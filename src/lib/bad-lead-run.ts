import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { brandTermsFor } from '@/lib/site-analytics'
import { secretSetting } from '@/lib/secret-settings'
import { notifyAllAdmins } from '@/lib/push-notifications'
import { traceLead, type TraceResult } from '@/lib/bad-lead-trace'
import { decideNegatives } from '@/lib/bad-lead-ai'
import {
  MAX_AUTO_PER_CLIENT_DAY,
  MAX_AUTO_PER_LEAD,
  UNTRACED_NOTE,
  confidenceAllowsAuto,
  fallbackProposals,
  negativeProblems,
  reasonLabel,
  type MatchType,
  type NegativeProposal,
  type Problem,
  type ShopFacts,
} from '@/lib/bad-lead'
import {
  addNegative,
  readNegatives,
  readPositives,
  removeNegative,
  type AttachedList,
  type Level,
  type NegativeTarget,
} from '@/lib/negative-keywords'

/**
 * "Bad lead", end to end: the mark, the trace, the model's pick, the safety
 * checks, the write, the log, the notification. Rules in `bad-lead.ts`.
 *
 * WHO CAN DO WHAT. Anybody who can see the lead may mark it — the shop in the
 * portal, any admin. Marking writes nothing to Google by itself: it is the
 * PIPELINE that may add a negative, and only one that passes every check in
 * `negativeProblems`, on a trace strong enough to place the lead, for a client
 * with `autoNegatives` on, under the per-lead and per-day caps — and
 * `BAD_LEAD_AUTO_NEGATIVES=false` turns all of it off. Everything else lands
 * in the review queue, where only the owner (`targetCpaUser`) can add it.
 */

export function autoEnabled(): boolean {
  return process.env.BAD_LEAD_AUTO_NEGATIVES !== 'false'
}

export interface ProposalOutcome extends NegativeProposal {
  problems: Problem[]
  /** applied | review | duplicate | failed | not-tried */
  outcome: 'applied' | 'review' | 'duplicate' | 'failed' | 'not-tried'
  changeId?: string
  error?: string
}

export interface Decision {
  by: 'model' | 'fallback'
  model?: string
  aiError?: string
  noneReason?: string | null
  auto: boolean
  /** Why nothing was added on its own, when nothing was. */
  autoOffWhy?: string
  proposals: ProposalOutcome[]
}

const json = (v: unknown) => v as Prisma.InputJsonValue

export async function shopFor(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      brandTerms: true,
      city: true,
      state: true,
      marketArea: true,
      serviceAreas: true,
      timezone: true,
      autoNegatives: true,
      offersWindshieldRepair: true,
      offersRockChipRepair: true,
      offersSunroofRepair: true,
      offersAdasCalibration: true,
      offersMobileService: true,
      adsTracking: { select: { googleAdsCustomerId: true } },
    },
  })
  if (!client) return null
  const shop: ShopFacts = {
    businessName: client.businessName,
    brandTerms: brandTermsFor(client.brandTerms, client.businessName),
    city: client.city,
    state: client.state,
    marketArea: client.marketArea,
    serviceAreas: client.serviceAreas || [],
    offersWindshieldRepair: client.offersWindshieldRepair,
    offersRockChipRepair: client.offersRockChipRepair,
    offersSunroofRepair: client.offersSunroofRepair,
    offersAdasCalibration: client.offersAdasCalibration,
    offersMobileService: client.offersMobileService,
  }
  return {
    client,
    shop,
    customerId: client.adsTracking?.googleAdsCustomerId?.replace(/\D/g, '') || null,
  }
}

/** What the customer said or wrote, for the model. Capped: it is context, not the decision. */
async function leadText(leadId: string, formData: unknown): Promise<string | null> {
  const lines: string[] = []
  if (formData && typeof formData === 'object') {
    for (const [k, v] of Object.entries(formData as Record<string, unknown>)) {
      if (typeof v !== 'string' || !v.trim()) continue
      if (/message|comment|note|service|vehicle|description|damage|details|question/i.test(k)) lines.push(`${k}: ${v.trim().slice(0, 400)}`)
    }
  }
  const call = await prisma.callAnalysis.findFirst({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
    select: { transcript: true },
  })
  const utterances = (call?.transcript as { results?: { utterances?: Array<{ speaker?: number; channel?: number; transcript?: string }> } } | null)
    ?.results?.utterances
  if (utterances?.length) {
    lines.push('Call transcript (start):')
    let size = 0
    for (const u of utterances) {
      const line = `- ${u.transcript || ''}`
      size += line.length
      if (size > 2500) break
      lines.push(line)
    }
  }
  return lines.length ? lines.join('\n') : null
}

export async function markBadLead(input: {
  leadId: string
  reason: string
  notes: string | null
  by: string
  role: 'admin' | 'client'
}) {
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, select: { id: true, clientId: true } })
  if (!lead) return null
  return prisma.badLeadMark.upsert({
    where: { leadId: lead.id },
    create: {
      leadId: lead.id,
      clientId: lead.clientId,
      reason: input.reason,
      notes: input.notes,
      markedBy: input.by,
      markedByRole: input.role,
      status: 'tracing',
    },
    update: {
      reason: input.reason,
      notes: input.notes,
      markedBy: input.by,
      markedByRole: input.role,
      status: 'tracing',
      undoneAt: null,
      error: null,
    },
  })
}

/** The campaign a proposal belongs to: the candidate it came from, else the traced one. */
function campaignFor(p: NegativeProposal, trace: TraceResult): { id: string; name: string; adGroupId: string | null } | null {
  const c = trace.allCandidates.find((x) => x.term.toLowerCase() === (p.fromTerm || '').toLowerCase())
  if (c) return { id: c.campaignId, name: c.campaignName, adGroupId: c.adGroupId }
  return trace.campaign ? { id: trace.campaign.id, name: trace.campaign.name, adGroupId: trace.adGroup?.id || null } : null
}

/**
 * Add one negative, after the checks. The caller decides whether problems
 * may be overridden (an owner pressing "add anyway"); the pipeline never does.
 */
export async function applyNegative(input: {
  clientId: string
  customerId: string
  shop: ShopFacts
  target: NegativeTarget
  proposal: NegativeProposal
  searchTerms: string[]
  source: 'auto' | 'admin'
  userEmail: string
  markId?: string | null
  leadId?: string | null
  override?: boolean
  typedByAdmin?: boolean
}): Promise<
  | { ok: true; changeId: string; status: 'applied' | 'unconfirmed' }
  | { ok: false; status: 'duplicate' | 'problems' | 'failed'; problems?: Problem[]; error?: string; changeId?: string }
> {
  const t = input.target
  const campaignId = t.campaignId
  const negatives = campaignId ? await readNegatives(input.customerId, campaignId, t.adGroupId) : { existing: [], lists: [], errors: [] }
  const positives = campaignId ? await readPositives(input.customerId, campaignId) : { ok: true as const, list: [] }
  const problems = negativeProblems(input.proposal, {
    shop: input.shop,
    searchTerms: input.searchTerms,
    positives: positives.ok ? positives.list : [],
    existing: negatives.existing,
    typedByAdmin: input.typedByAdmin,
  })
  // Unreadable is not empty: a check that could not read what it guards against has not passed.
  if (negatives.errors.length) problems.push({ kind: 'unreadable', detail: `Could not read the existing negatives (${negatives.errors[0]}).` })
  if (!positives.ok) problems.push({ kind: 'unreadable', detail: `Could not read the campaign’s keywords (${positives.error}).` })

  const base = {
    clientId: input.clientId,
    customerId: input.customerId,
    ownerCustomerId: t.level === 'shared_list' && t.list ? t.list.ownerCustomerId : input.customerId,
    badLeadMarkId: input.markId || null,
    leadId: input.leadId || null,
    level: t.level,
    campaignId: t.level === 'shared_list' ? null : campaignId,
    adGroupId: t.level === 'ad_group' ? t.adGroupId : null,
    sharedSetId: t.list?.id || null,
    sharedSetName: t.list?.name || null,
    text: input.proposal.text,
    matchType: input.proposal.matchType,
    source: input.source,
    userEmail: input.userEmail,
    rationale: input.proposal.why || null,
    warnings: json(problems),
  }

  const dup = problems.find((p) => p.kind === 'duplicate' && p.blocking)
  if (dup) return { ok: false, status: 'duplicate', problems }
  if (problems.length && !input.override) return { ok: false, status: 'problems', problems }

  const res = await addNegative(t, { text: input.proposal.text, matchType: input.proposal.matchType })
  if (!res.ok) {
    const row = await prisma.negativeKeywordChange.create({
      data: {
        ...base,
        campaignName: res.campaignName ?? null,
        adGroupName: res.adGroupName ?? null,
        status: res.stage === 'validate' ? 'validate-failed' : res.stage === 'check' ? 'refused' : 'failed',
        error: res.error,
      },
    })
    console.warn(`[BadLead] negative "${input.proposal.text}" not added (${res.stage}): ${res.error}`)
    return { ok: false, status: 'failed', error: res.error, changeId: row.id }
  }
  const status = res.confirmed ? 'applied' : 'unconfirmed'
  const row = await prisma.negativeKeywordChange.create({
    data: { ...base, status, resourceName: res.resourceName, campaignName: res.campaignName, adGroupName: res.adGroupName },
  })
  console.log(`[BadLead] ${status}: ${input.source} ${input.userEmail} ${t.level} "${input.proposal.text}" (${input.proposal.matchType}) → ${res.resourceName}`)
  return { ok: true, changeId: row.id, status }
}

/** Trace, decide, check, add. Safe to run again: duplicates are found, not added twice. */
export async function processBadLead(markId: string): Promise<void> {
  const mark = await prisma.badLeadMark.findUnique({ where: { id: markId } })
  if (!mark || mark.undoneAt) return
  const lead = await prisma.lead.findUnique({ where: { id: mark.leadId } })
  if (!lead) return
  const ctx = await shopFor(mark.clientId)
  if (!ctx) return
  try {
    if (!ctx.customerId) {
      await prisma.badLeadMark.update({
        where: { id: mark.id },
        data: { status: 'untraced', confidence: 'none', trace: json({ note: 'This client has no Google Ads account linked.', candidates: [] }) },
      })
      await notify(ctx.shop.businessName, mark.reason, 'No Google Ads account linked — reason saved, nothing traced.')
      return
    }

    // Every call that day, so Google's call log is matched one-to-one.
    const day = new Date(lead.createdAt)
    const sameDayCalls =
      lead.source === 'PHONE'
        ? (
            await prisma.lead.findMany({
              where: {
                clientId: lead.clientId,
                source: 'PHONE',
                createdAt: { gte: new Date(day.getTime() - 86_400_000), lte: new Date(day.getTime() + 86_400_000) },
              },
              select: { id: true, createdAt: true, phone: true },
            })
          ).map((l) => ({ id: l.id, at: l.createdAt, phone: l.phone, status: null, durationSecs: null, tracked: true }))
        : []

    const trace = await traceLead({
      lead,
      customerId: ctx.customerId,
      fallbackZone: ctx.client.timezone || 'America/New_York',
      reason: mark.reason,
      sameDayCalls,
    })

    if (trace.confidence === 'none' || trace.notOurs) {
      await prisma.badLeadMark.update({
        where: { id: mark.id },
        data: { status: trace.notOurs ? 'no-action' : 'untraced', confidence: trace.confidence, trace: json(trace), decision: Prisma.DbNull },
      })
      await notify(ctx.shop.businessName, mark.reason, trace.notOurs ? trace.note : UNTRACED_NOTE)
      return
    }

    // The model's pick, or the narrow fallback without it.
    const text = await leadText(lead.id, lead.formData)
    const ai = await decideNegatives({ shop: ctx.shop, reason: mark.reason, notes: mark.notes, leadText: text, trace })
    const proposals = ai.ok ? ai.proposals : fallbackProposals(trace.allCandidates, mark.reason)

    const decision: Decision = {
      by: ai.ok ? 'model' : 'fallback',
      model: ai.model,
      aiError: ai.ok ? undefined : ai.error,
      noneReason: ai.noneReason,
      auto: false,
      proposals: [],
    }

    // May anything be added without a person?
    let autoOffWhy: string | undefined
    if (!autoEnabled()) autoOffWhy = 'Automatic negatives are switched off (BAD_LEAD_AUTO_NEGATIVES=false).'
    else if (!ctx.client.autoNegatives) autoOffWhy = 'Automatic negatives are off for this client.'
    else if (!confidenceAllowsAuto(trace.confidence)) autoOffWhy = 'The lead could not be placed in a campaign, so these are suggestions only.'
    let budget = MAX_AUTO_PER_LEAD
    if (!autoOffWhy) {
      const today = await prisma.negativeKeywordChange.count({
        where: { clientId: mark.clientId, source: 'auto', status: { in: ['applied', 'unconfirmed'] }, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      })
      budget = Math.min(budget, MAX_AUTO_PER_CLIENT_DAY - today)
      if (budget <= 0) autoOffWhy = `${MAX_AUTO_PER_CLIENT_DAY} negatives were already added automatically to this account in the last 24 hours — the rest wait for review.`
    }
    decision.auto = !autoOffWhy
    decision.autoOffWhy = autoOffWhy
    const searchTerms = trace.allCandidates.map((c) => c.term)

    for (const p of proposals) {
      const camp = campaignFor(p, trace)
      const target: NegativeTarget = { customerId: ctx.customerId, level: 'campaign', campaignId: camp?.id || null, adGroupId: camp?.adGroupId || null, list: null }
      if (!decision.auto || budget <= 0 || !camp) {
        // Screened anyway, so the queue shows what a person would be agreeing to.
        const problems = camp
          ? await screenOnly(ctx.customerId, ctx.shop, target, p, searchTerms)
          : [{ kind: 'not-from-search' as const, detail: 'No campaign to add it to.' }]
        const dup = problems.some((x) => x.kind === 'duplicate' && x.blocking)
        decision.proposals.push({ ...p, problems, outcome: dup ? 'duplicate' : 'review' })
        continue
      }
      const res = await applyNegative({
        clientId: mark.clientId,
        customerId: ctx.customerId,
        shop: ctx.shop,
        target,
        proposal: p,
        searchTerms,
        source: 'auto',
        userEmail: `auto (marked by ${mark.markedBy})`,
        markId: mark.id,
        leadId: lead.id,
      })
      if (res.ok) {
        budget--
        decision.proposals.push({ ...p, problems: [], outcome: 'applied', changeId: res.changeId })
      } else {
        decision.proposals.push({
          ...p,
          problems: res.problems || [],
          outcome: res.status === 'duplicate' ? 'duplicate' : res.status === 'problems' ? 'review' : 'failed',
          changeId: res.changeId,
          error: res.error,
        })
      }
    }

    const applied = decision.proposals.filter((p) => p.outcome === 'applied')
    const review = decision.proposals.filter((p) => p.outcome === 'review' || p.outcome === 'failed')
    const status = review.length ? 'review' : applied.length ? 'applied' : 'no-action'
    await prisma.badLeadMark.update({
      where: { id: mark.id },
      data: { status, confidence: trace.confidence, trace: json(trace), decision: json(decision), error: null },
    })
    await notify(
      ctx.shop.businessName,
      mark.reason,
      [
        applied.length ? `Added ${applied.map((p) => `"${p.text}"`).join(', ')}` : null,
        review.length ? `${review.length} to review` : null,
        !applied.length && !review.length ? decision.noneReason || 'No negative needed — already excluded or nothing to add.' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      { applied, review, trace, decision }
    )
  } catch (error) {
    console.error('[BadLead] pipeline failed:', error)
    await prisma.badLeadMark.update({
      where: { id: mark.id },
      data: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'failed' },
    })
  }
}

async function screenOnly(customerId: string, shop: ShopFacts, target: NegativeTarget, p: NegativeProposal, searchTerms: string[]): Promise<Problem[]> {
  if (!target.campaignId) return []
  const [neg, pos] = await Promise.all([readNegatives(customerId, target.campaignId, target.adGroupId), readPositives(customerId, target.campaignId)])
  return negativeProblems(p, { shop, searchTerms, positives: pos.ok ? pos.list : [], existing: neg.existing })
}

export async function undoNegativeChange(changeId: string, userEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.negativeKeywordChange.findUnique({ where: { id: changeId } })
  if (!row) return { ok: false, error: 'No such change.' }
  if (row.removedAt) return { ok: true }
  if (!row.resourceName || !['applied', 'unconfirmed'].includes(row.status)) return { ok: false, error: 'Nothing was added, so there is nothing to undo.' }
  const res = await removeNegative(row.ownerCustomerId, row.level as Level, row.resourceName)
  if (!res.ok) return { ok: false, error: `Google refused the removal (${res.stage}): ${res.error}` }
  await prisma.negativeKeywordChange.update({ where: { id: row.id }, data: { status: 'removed', removedAt: new Date(), removedBy: userEmail } })
  console.log(`[BadLead] removed by ${userEmail}: "${row.text}" ${row.resourceName}`)
  return { ok: true }
}

/**
 * Undo the mark. Negatives the PIPELINE added because of it come off too — a
 * mis-press must not leave a negative behind that nobody chose. Ones the
 * owner added by hand stay: that was a decision of its own.
 */
export async function undoBadLead(leadId: string, by: string): Promise<{ ok: true; removed: number; failed: string[] } | { ok: false; error: string }> {
  const mark = await prisma.badLeadMark.findUnique({ where: { leadId } })
  if (!mark) return { ok: false, error: 'This lead is not marked.' }
  const auto = await prisma.negativeKeywordChange.findMany({
    where: { badLeadMarkId: mark.id, source: 'auto', status: { in: ['applied', 'unconfirmed'] }, removedAt: null },
  })
  let removed = 0
  const failed: string[] = []
  for (const row of auto) {
    const res = await undoNegativeChange(row.id, by)
    if (res.ok) removed++
    else failed.push(`"${row.text}": ${res.error}`)
  }
  await prisma.badLeadMark.update({ where: { id: mark.id }, data: { status: 'undone', undoneAt: new Date() } })
  return { ok: true, removed, failed }
}

/** For the owner's "add" from the queue or the panel. */
export async function ownerAdd(input: {
  markId: string | null
  clientId: string
  text: string
  matchType: MatchType
  level: Level
  campaignId: string | null
  adGroupId: string | null
  list: AttachedList | null
  fromTerm: string | null
  override: boolean
  userEmail: string
}) {
  const ctx = await shopFor(input.clientId)
  if (!ctx?.customerId) return { ok: false as const, status: 'failed' as const, error: 'This client has no Google Ads account linked.' }
  const mark = input.markId ? await prisma.badLeadMark.findUnique({ where: { id: input.markId } }) : null
  const trace = (mark?.trace as unknown as TraceResult | null) || null
  const searchTerms = trace?.allCandidates?.map((c) => c.term) || []
  const fromSearch = searchTerms.some((t) => t.toLowerCase() === (input.fromTerm || '').toLowerCase())
  const res = await applyNegative({
    clientId: input.clientId,
    customerId: ctx.customerId,
    shop: ctx.shop,
    target: { customerId: ctx.customerId, level: input.level, campaignId: input.campaignId, adGroupId: input.adGroupId, list: input.list },
    proposal: { text: input.text.trim().toLowerCase(), matchType: input.matchType, fromTerm: input.fromTerm, why: 'Added by the owner.' },
    searchTerms,
    source: 'admin',
    userEmail: input.userEmail,
    markId: mark?.id || null,
    leadId: mark?.leadId || null,
    override: input.override,
    typedByAdmin: !fromSearch,
  })
  if (res.ok && mark) {
    // The queue item it came from is settled.
    const decision = (mark.decision as unknown as Decision | null) || null
    if (decision) {
      for (const p of decision.proposals) {
        if (p.text === input.text.trim().toLowerCase() && p.matchType === input.matchType) {
          p.outcome = 'applied'
          p.changeId = res.changeId
        }
      }
      const open = decision.proposals.some((p) => p.outcome === 'review' || p.outcome === 'failed')
      await prisma.badLeadMark.update({ where: { id: mark.id }, data: { decision: json(decision), status: open ? 'review' : 'applied' } })
    }
  }
  return res
}

/** Dismiss a queued suggestion without adding it. */
export async function dismissProposal(markId: string, text: string, matchType: string): Promise<void> {
  const mark = await prisma.badLeadMark.findUnique({ where: { id: markId } })
  const decision = (mark?.decision as unknown as Decision | null) || null
  if (!mark || !decision) return
  for (const p of decision.proposals) if (p.text === text && p.matchType === matchType && p.outcome !== 'applied') p.outcome = 'not-tried'
  const open = decision.proposals.some((p) => p.outcome === 'review' || p.outcome === 'failed')
  const applied = decision.proposals.some((p) => p.outcome === 'applied')
  await prisma.badLeadMark.update({ where: { id: mark.id }, data: { decision: json(decision), status: open ? 'review' : applied ? 'applied' : 'no-action' } })
}

async function notify(shopName: string, reason: string, line: string, detail?: { applied: ProposalOutcome[]; review: ProposalOutcome[]; trace: TraceResult; decision: Decision }) {
  await notifyAllAdmins({
    title: `Bad lead · ${shopName}`,
    body: `${reasonLabel(reason)} — ${line}`,
    tag: 'bad-lead',
    data: { url: '/admin/bad-leads' },
  }).catch((e) => console.warn('[BadLead] push failed:', e))
  const to = process.env.ADMIN_EMAIL || process.env.MASTER_LEADS_EMAIL
  const apiKey = await secretSetting('RESEND_API_KEY')
  if (!to || !apiKey) return
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const base = process.env.APP_URL || 'https://glassleads.app'
  const list = (items: ProposalOutcome[]) =>
    items.map((p) => `<li>${p.matchType.toLowerCase()} "${esc(p.text)}"${p.problems.length ? ` — ${esc(p.problems.map((x) => x.detail).join(' '))}` : ''}</li>`).join('')
  try {
    const configured = (await secretSetting('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
    const address = /<([^>]+)>/.exec(configured)?.[1] || configured
    const { Resend } = await import('resend')
    await new Resend(apiKey).emails.send({
      from: `GlassLeads <${address}>`,
      to: [to],
      subject: `Bad lead · ${shopName}: ${line}`.slice(0, 180),
      html: `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;padding:16px">
<p style="margin:0 0 8px"><strong>${esc(shopName)}</strong> · ${esc(reasonLabel(reason))}</p>
${detail?.trace ? `<p style="margin:0 0 8px;font-size:13px;color:#4b5563">${esc(detail.trace.note)}${detail.trace.campaign ? ` Campaign: ${esc(detail.trace.campaign.name)}${detail.trace.adGroup ? ` › ${esc(detail.trace.adGroup.name)}` : ''}.` : ''}</p>` : `<p>${esc(line)}</p>`}
${detail?.applied.length ? `<p style="margin:12px 0 4px"><strong>Added automatically</strong></p><ul>${list(detail.applied)}</ul>` : ''}
${detail?.review.length ? `<p style="margin:12px 0 4px"><strong>Waiting for you</strong>${detail.decision.autoOffWhy ? ` — ${esc(detail.decision.autoOffWhy)}` : ''}</p><ul>${list(detail.review)}</ul>` : ''}
<p style="margin:16px 0 0"><a href="${esc(base)}/admin/bad-leads" style="color:#2563eb">Open Bad leads</a> — every negative can be undone there.</p>
</body></html>`,
    })
  } catch (e) {
    console.warn('[BadLead] email failed:', e)
  }
}
