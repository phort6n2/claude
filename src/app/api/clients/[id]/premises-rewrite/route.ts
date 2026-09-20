import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import { secretSetting } from '@/lib/secret-settings'
import { editorialFields, targetIsWritable } from '@/lib/rogue-numbers'
import { findPremisesClaims, type PremisesCopyHit } from '@/lib/premises-copy-health'
import { parseDraftArray } from '@/lib/draft-json'
import { readSteps } from '@/lib/insurance-programs'
import { headlineArea } from '@/lib/site-area'
import {
  rewritePrompt,
  screenRewrites,
  targetsFrom,
  replaceSentence,
  type Proposal,
  type RewriteTarget,
} from '@/lib/premises-rewrite'
import type { ClaimContext } from '@/lib/copy-claims'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/clients/[id]/premises-rewrite
 *
 *   {}                      → PROPOSE. Reads the copy, asks the model, screens
 *                             every rewrite, returns before/after. Writes
 *                             NOTHING.
 *   { apply: [proposals] }  → APPLY. Re-screens the text that came back from
 *                             the browser, then saves.
 *
 * TWO CALLS ON PURPOSE. The bulk city drafter saves unread because it FILLS
 * EMPTY pages — a blank page carrying noindex is the thing it exists to
 * prevent, so the screen standing in for a reader is a fair trade. This one
 * REWRITES copy somebody may have curated, and a button that silently
 * overwrites a hand-edited paragraph is one nobody presses twice.
 *
 * THE APPLY RE-SCREENS. What comes back from a browser is just text, whatever
 * this route proposed a minute ago. Screening only on the way out would make
 * this a suggestion box wired straight to a live website.
 */

const SELECT = {
  id: true,
  businessName: true,
  city: true,
  state: true,
  marketArea: true,
  serviceAreas: true,
  hasShopLocation: true,
  offersMobileService: true,
  smsCapable: true,
  filesInsuranceClaims: true,
  offersWindshieldReplacement: true,
  offersWindshieldRepair: true,
  offersRockChipRepair: true,
  offersSideWindowRepair: true,
  offersBackWindowRepair: true,
  offersSunroofRepair: true,
  offersAdasCalibration: true,
  siteContent: { select: { warrantyText: true, footerBlurb: true, faq: true, chapters: true } },
  cityContent: { select: { city: true, body: true } },
  customPages: { where: { publishedAt: { not: null } }, select: { path: true, title: true, bodyHtml: true } },
  insuranceProgram: { select: { coverageNote: true, claimSteps: true } },
} as const

type LoadedClient = NonNullable<Awaited<ReturnType<typeof loadClient>>>

async function loadClient(id: string) {
  return prisma.client.findUnique({ where: { id }, select: SELECT })
}

function contextFor(client: LoadedClient): ClaimContext {
  return {
    hasShopLocation: client.hasShopLocation,
    offersMobileService: client.offersMobileService,
    filesInsuranceClaims: client.filesInsuranceClaims,
    smsCapable: client.smsCapable,
    services: {
      offersWindshieldReplacement: client.offersWindshieldReplacement,
      offersWindshieldRepair: client.offersWindshieldRepair,
      offersRockChipRepair: client.offersRockChipRepair,
      offersSideWindowRepair: client.offersSideWindowRepair,
      offersBackWindowRepair: client.offersBackWindowRepair,
      offersSunroofRepair: client.offersSunroofRepair,
      offersAdasCalibration: client.offersAdasCalibration,
    },
  }
}

/**
 * Fields this route reports but will not write to.
 *
 * Keyed on the target's own `writable: false` marker rather than on a list of
 * kinds, so a field added to `editorialFields` lands in one of the two
 * buckets by construction. Before this it was `kind === 'keptPage'`, and a
 * third unwritable kind would have fallen into neither — reported by the
 * sweep, absent from the proposals, absent from the "left alone" list, and
 * therefore invisible.
 */
function handEdited(hit: PremisesCopyHit): boolean {
  return !!hit.target && !targetIsWritable(hit.target)
}

function hitsFor(client: LoadedClient) {
  return findPremisesClaims(
    editorialFields({
      content: client.siteContent,
      cityContent: client.cityContent,
      keptPages: client.customPages,
      insuranceProgram: programFields(client),
    })
  )
}

/** The insurance page's typed copy, for scanning only — never for a write. */
function programFields(client: LoadedClient) {
  const p = client.insuranceProgram
  return p ? { coverageNote: p.coverageNote, claimSteps: readSteps(p.claimSteps) } : null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { apply?: unknown }
  const client = await loadClient(id)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Only a service-area business has this problem, and only their copy may be
  // rewritten for it. On a shop with premises these sentences are simply true.
  if (client.hasShopLocation !== false) {
    return NextResponse.json(
      { error: 'This client is not marked as a service-area business, so these sentences are true.' },
      { status: 400 }
    )
  }

  const hits = hitsFor(client)
  const targets = targetsFrom(hits)
  const context = contextFor(client)

  if (Array.isArray(body.apply)) {
    return applyProposals(client, body.apply as Proposal[], targets, context)
  }

  if (targets.length === 0) {
    const handOnly = hits.filter((h) => handEdited(h))
    return NextResponse.json({
      proposals: [],
      rejected: [],
      handOnly: handOnly.map((h) => ({ where: h.where, sentence: h.sentence })),
      message: handOnly.length
        ? 'Everything left is in a field this cannot write back to, so it has to be edited by hand.'
        : 'Nothing left to rewrite.',
    })
  }

  const apiKey = await secretSetting('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key configured (Settings → API keys).' },
      { status: 400 }
    )
  }

  const facts = {
    businessName: client.businessName,
    area: headlineArea({ city: client.city, state: client.state, marketArea: client.marketArea }),
    city: client.city,
    state: client.state,
    offersMobileService: client.offersMobileService,
    smsCapable: client.smsCapable,
    filesInsuranceClaims: client.filesInsuranceClaims,
    serviceAreas: client.serviceAreas || [],
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      // A handful of one-line rewrites needs a fraction of this. The ceiling
      // is high for the reason the story drafter's is: tokens are only spent
      // if they are used, and a budget that only just fits turns a slightly
      // long answer into a total failure.
      max_tokens: 4000,
      messages: [{ role: 'user', content: rewritePrompt(targets, facts) }],
    })

    if (message.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The model declined to rewrite this copy.' }, { status: 502 })
    }
    const block = message.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') {
      console.error('[premises-rewrite] no text block; stop_reason=%s', message.stop_reason)
      return NextResponse.json({ error: 'No text in the response.' }, { status: 502 })
    }

    const parsed = parseDraftArray(block.text)
    if (!parsed.ok) {
      // The log is the point — see the note in draft-story. Without the raw
      // text the only way to guess at a bad answer is to press it again.
      console.error(
        '[premises-rewrite] %s (stop_reason=%s, out=%d tokens): %s\n--- raw ---\n%s',
        parsed.kind,
        message.stop_reason,
        message.usage?.output_tokens ?? -1,
        parsed.detail,
        block.text.slice(0, 2000)
      )
      const said =
        parsed.kind === 'truncated'
          ? 'The rewrite was cut off. Press it again.'
          : parsed.kind === 'unparseable'
            ? `The rewrite came back malformed (${parsed.detail}). Press it again.`
            : `The model answered in prose rather than rewrites: ${parsed.detail}`
      return NextResponse.json({ error: said }, { status: 502 })
    }

    const screened = screenRewrites(
      parsed.sections as Array<{ id?: unknown; rewrite?: unknown }>,
      targets,
      context
    )
    return NextResponse.json({
      ...screened,
      handOnly: hits.filter(handEdited).map((h) => ({ where: h.where, sentence: h.sentence })),
    })
  } catch (error) {
    console.error('[premises-rewrite] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The rewrite failed.' },
      { status: 502 }
    )
  }
}

/**
 * Write the accepted rewrites back, one field at a time.
 *
 * A sentence that is no longer there is REPORTED, not forced. Between the
 * proposal and the press somebody may have edited the same paragraph, and a
 * fuzzy replace would quietly throw their edit away.
 */
async function applyProposals(
  client: LoadedClient,
  incoming: Proposal[],
  targets: RewriteTarget[],
  context: ClaimContext
) {
  // Re-screen against the ORIGINAL sentences this route found, not against
  // whatever `before` the browser claims — otherwise a caller could name any
  // sentence it liked as the thing being replaced.
  const screened = screenRewrites(
    incoming.map((p) => ({ id: p.id, rewrite: p.after })),
    targets,
    context
  )
  const byId = new Map(targets.map((t) => [t.id, t]))

  const applied: Array<{ where: string; before: string; after: string }> = []
  const skipped: Array<{ where: string; reason: string }> = []

  // Read-modify-write per field, so several sentences in one FAQ answer all land.
  const content = client.siteContent
  let warrantyText = content?.warrantyText ?? null
  let footerBlurb = content?.footerBlurb ?? null
  const faq = Array.isArray(content?.faq) ? [...(content.faq as Array<Record<string, unknown>>)] : []
  const chapters = Array.isArray(content?.chapters)
    ? [...(content.chapters as Array<Record<string, unknown>>)]
    : []
  const cityEdits = new Map<string, string>()

  for (const p of screened.proposals) {
    const target = byId.get(p.id)
    const hit = findPremisesClaims(
      editorialFields({
        content: client.siteContent,
        cityContent: client.cityContent,
        keptPages: [],
      })
    ).find((h) => h.sentence === target?.sentence)
    const where = target?.where || p.where
    if (!hit?.target) {
      skipped.push({ where, reason: 'could not work out which field that sentence is in' })
      continue
    }

    const swap = (text: string | null | undefined) => replaceSentence(text, p.before, p.after)
    const t = hit.target
    if (t.kind === 'warrantyText') {
      const r = swap(warrantyText)
      if (r.ok) {
        warrantyText = r.text
        applied.push({ where, before: p.before, after: p.after })
      } else skipped.push({ where, reason: r.reason })
    } else if (t.kind === 'footerBlurb') {
      const r = swap(footerBlurb)
      if (r.ok) {
        footerBlurb = r.text
        applied.push({ where, before: p.before, after: p.after })
      } else skipped.push({ where, reason: r.reason })
    } else if (t.kind === 'faq') {
      const row = faq[t.index] || {}
      const r = swap(String(row.a ?? ''))
      if (r.ok) {
        faq[t.index] = { ...row, a: r.text }
        applied.push({ where, before: p.before, after: p.after })
      } else skipped.push({ where, reason: r.reason })
    } else if (t.kind === 'chapter') {
      const row = chapters[t.index] || {}
      const r = swap(String(row.body ?? ''))
      if (r.ok) {
        chapters[t.index] = { ...row, body: r.text }
        applied.push({ where, before: p.before, after: p.after })
      } else skipped.push({ where, reason: r.reason })
    } else if (t.kind === 'cityContent') {
      const current =
        cityEdits.get(t.city) ?? client.cityContent.find((c) => c.city === t.city)?.body ?? ''
      const r = swap(current)
      if (r.ok) {
        cityEdits.set(t.city, r.text)
        applied.push({ where, before: p.before, after: p.after })
      } else skipped.push({ where, reason: r.reason })
    } else {
      skipped.push({ where, reason: 'kept pages are edited by hand' })
    }
  }

  if (applied.length > 0) {
    if (content) {
      await prisma.clientSiteContent.update({
        where: { clientId: client.id },
        data: {
          warrantyText,
          footerBlurb,
          faq: faq as never,
          chapters: chapters as never,
        },
      })
    }
    for (const [city, body] of cityEdits) {
      await prisma.clientCityContent
        .updateMany({ where: { clientId: client.id, city }, data: { body } })
        .catch(() => {})
    }
  }

  return NextResponse.json({
    applied,
    skipped: [
      ...skipped,
      ...screened.rejected.map((r) => ({ where: r.where, reason: r.reason })),
    ],
    message: applied.length
      ? `Rewrote ${applied.length} sentence${applied.length === 1 ? '' : 's'}. The site updates on the next render.`
      : 'Nothing was changed.',
  })
}
