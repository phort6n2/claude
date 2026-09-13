import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { secretSetting } from '@/lib/secret-settings'
import { asChapters } from '@/lib/site-content'
import { parseDraftArray } from '@/lib/draft-json'
import { MAX_DRAFT_FAQS, faqPrompt, screenFaq, type FaqInput } from '@/lib/faq-draft'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — draft the FAQ for a shop that has not written one.
 *
 * WRITES NOTHING, same as the story drafter: the questions go back to the
 * editor, which owns the autosave. Read the top of `faq-draft.ts` for the one
 * thing that makes this different from the story sections — the FAQ is NOT
 * empty when the field is empty, because the template already answers four
 * questions from compliance-reviewed copy, and a draft that lands on one of
 * those replaces or duplicates it silently.
 *
 * Anything already typed in the field is sent along, so a second press adds to
 * the FAQ rather than re-asking it.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      businessName: true,
      city: true,
      state: true,
      marketArea: true,
      hasShopLocation: true,
      offersMobileService: true,
      filesInsuranceClaims: true,
      smsCapable: true,
      offersWindshieldReplacement: true,
      offersWindshieldRepair: true,
      offersRockChipRepair: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersAdasCalibration: true,
      siteContent: { select: { footerBlurb: true, chapters: true } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.city || !client.state) {
    return NextResponse.json(
      {
        error:
          'Set the shop’s city and state on the Business tab first — the state decides which insurance answers the site already gives.',
      },
      { status: 400 }
    )
  }

  const apiKey = await secretSetting('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key configured (Settings → API keys).' },
      { status: 503 }
    )
  }

  // Questions the operator is looking at right now, not the ones in the
  // database: they may have typed one and not waited for the autosave.
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const existingQuestions = Array.isArray(body.existingQuestions)
    ? (body.existingQuestions as unknown[])
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim())
        .filter(Boolean)
    : []

  const input: FaqInput = {
    businessName: client.businessName,
    city: client.city,
    state: client.state,
    marketArea: client.marketArea,
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
    existingVoice: [
      client.siteContent?.footerBlurb || '',
      ...asChapters(client.siteContent?.chapters).map((c) => c.body),
    ].filter(Boolean),
    existingQuestions,
  }

  let items: Array<Record<string, unknown>>
  let cutOff = false
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      // Eight answers of ~90 words, with room to spare on purpose: a budget
      // that only just fits turns a slightly long draft into a total failure,
      // and the tokens are only spent if they are used.
      max_tokens: 8000,
      messages: [{ role: 'user', content: faqPrompt(input) }],
    })
    if (message.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'The model declined to draft this.' }, { status: 502 })
    }
    const block = message.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') {
      console.error('[draft-faq] no text block; stop_reason=%s', message.stop_reason)
      return NextResponse.json({ error: 'No text in the response.' }, { status: 502 })
    }

    const parsed = parseDraftArray(block.text)
    if (!parsed.ok) {
      // Logged in full, for the reason the story route learned the hard way:
      // a message that names nothing, over a response nothing recorded, left
      // no way to tell the three causes apart.
      console.error(
        '[draft-faq] %s (stop_reason=%s, out=%d tokens): %s\n--- raw ---\n%s',
        parsed.kind,
        message.stop_reason,
        message.usage?.output_tokens ?? -1,
        parsed.detail,
        block.text.slice(0, 2000)
      )
      const said =
        parsed.kind === 'truncated'
          ? 'The draft was cut off before any answer finished. Press it again.'
          : parsed.kind === 'unparseable'
            ? `The draft came back malformed (${parsed.detail}). Press it again.`
            : `The model answered in prose rather than questions: ${parsed.detail}`
      return NextResponse.json({ error: said }, { status: 502 })
    }
    items = parsed.sections
    cutOff = parsed.truncated
    if (cutOff) {
      console.warn(
        '[draft-faq] response truncated (stop_reason=%s); salvaged %d complete answer(s)',
        message.stop_reason,
        items.length
      )
    }
  } catch (error) {
    console.error('FAQ draft failed:', error)
    return NextResponse.json(
      {
        error: `Could not draft them: ${error instanceof Error ? error.message : 'model call failed'}`,
      },
      { status: 502 }
    )
  }

  const { kept, dropped } = screenFaq(items, input)

  const shortBecauseCutOff = cutOff
    ? ' The draft was cut off part-way, so there may be fewer than usual — press it again for more.'
    : ''

  const note = kept.length
    ? `Drafted ${kept.length} question${kept.length === 1 ? '' : 's'}.${shortBecauseCutOff}${
        dropped.length
          ? ` ${dropped.length} more ${dropped.length === 1 ? 'was' : 'were'} thrown away: ${dropped
              .map((d) => `“${d.q}” ${d.reason}`)
              .join('; ')}.`
          : ''
      } Read each answer before you move on — and remember the site answers the insurance, repair-versus-replace and recalibration questions on its own, which is why nothing here does.`
    : `Nothing usable came back. ${
        dropped.length
          ? `Every question was either already answered or made a claim we cannot back: ${dropped
              .map((d) => `“${d.q}” ${d.reason}`)
              .join('; ')}.`
          : 'The draft was empty.'
      } Press it again — it is a fresh draft each time.`

  return NextResponse.json({ faq: kept, dropped, note, max: MAX_DRAFT_FAQS })
}
