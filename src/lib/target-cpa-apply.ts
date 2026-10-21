import { prisma } from '@/lib/db'
import { adsMutate, adsSearch } from '@/lib/google-ads'
import { applyEnabled, latestTcpaSnapshot } from '@/lib/target-cpa-fetch'
import { applyRefusal, buildRows, isAgmpCampaign, n } from '@/lib/target-cpa'

/**
 * PHASE 2: apply the suggested target to ONE campaign (or its portfolio
 * strategy). On unless `TARGET_CPA_APPLY_ENABLED=false` (the kill switch).
 *
 * What it will and will not do, each checked here on the server rather than
 * trusted from the page:
 * - Only the suggested .77 target from the LATEST snapshot, and only the value
 *   the confirm dialog showed — the page sends both numbers and either one
 *   disagreeing refuses. It never re-derives a target at send time.
 * - Only an ENABLED campaign whose name starts AGMP, on Maximize Conversions,
 *   read LIVE just before sending; a target changed in Google since the
 *   snapshot (somebody did it by hand) refuses rather than overwrites.
 * - A PORTFOLIO strategy moves every campaign on it, so it is refused unless
 *   EVERY campaign on it is an AGMP one — AGS's "tcpa - windshield" also runs
 *   "Search - Windshield MC V TIS", which is not ours to touch.
 * - Only `maximize_conversions.target_cpa_micros`, by update mask. Never a
 *   budget, never the bidding strategy type.
 * - `validateOnly: true` first; the real request only if that passes; then the
 *   value is READ BACK, and the log records what Google says now.
 * Every attempt is logged, refusals included.
 */

const s = (v: unknown): string => (v == null ? '' : String(v))
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const digits = (v: string) => v.replace(/\D/g, '')

export interface ApplyRequest {
  customerId: string
  campaignId: string
  fromMicros: number | null
  toMicros: number
  /** The page's own reading of what will change, so a mismatch refuses. */
  scope: 'campaign' | 'portfolio'
}

export type ApplyResult =
  | { ok: true; scope: 'campaign' | 'portfolio'; readBackMicros: number | null; affectedCampaigns: number; status: 'applied' | 'unconfirmed' }
  | { ok: false; status: 'disabled' | 'refused' | 'validate-failed' | 'failed'; error: string }

interface LogBase {
  userEmail: string
  customerId: string
  accountName: string
  campaignId: string
  campaignName: string
  scope: string
  resourceName: string
  oldMicros: number | null
  newMicros: number
  affectedCampaigns: number
}

async function log(base: LogBase, status: string, extra: { error?: string; readBackMicros?: number | null } = {}) {
  await prisma.targetCpaChange
    .create({
      data: {
        ...base,
        oldMicros: base.oldMicros == null ? null : BigInt(Math.round(base.oldMicros)),
        newMicros: BigInt(Math.round(base.newMicros)),
        readBackMicros: extra.readBackMicros == null ? null : BigInt(Math.round(extra.readBackMicros)),
        status,
        error: extra.error ?? null,
      },
    })
    .catch((e) => console.error('[TargetCpa] could not write the change log:', e))
  console.log(
    `[TargetCpa] ${status}: ${base.userEmail} ${base.accountName} / ${base.campaignName} (${base.scope}) ` +
      `${base.oldMicros ?? 'none'} → ${base.newMicros}${extra.readBackMicros != null ? `, read back ${extra.readBackMicros}` : ''}${extra.error ? ` — ${extra.error}` : ''}`
  )
}

export async function applyTargetCpa(userEmail: string, req: ApplyRequest): Promise<ApplyResult> {
  if (!applyEnabled()) return { ok: false, status: 'disabled', error: 'Applying targets is switched off (TARGET_CPA_APPLY_ENABLED=false).' }

  const customerId = digits(req.customerId)
  const campaignId = digits(req.campaignId)
  const latest = await latestTcpaSnapshot()
  const row = latest ? buildRows(latest.snapshot).find((r) => r.customerId === customerId && r.campaignId === campaignId) : null

  const base: LogBase = {
    userEmail,
    customerId,
    accountName: row?.accountName || customerId,
    campaignId,
    campaignName: row?.campaignName || campaignId,
    scope: req.scope,
    resourceName: `customers/${customerId}/campaigns/${campaignId}`,
    oldMicros: req.fromMicros,
    newMicros: req.toMicros,
    affectedCampaigns: 1,
  }
  const refuse = async (error: string): Promise<ApplyResult> => {
    await log(base, 'refused', { error })
    return { ok: false, status: 'refused', error }
  }

  if (!row) return refuse('That campaign is not in the latest snapshot. Refresh and try again.')
  const why = applyRefusal(row)
  if (why) return refuse(why)
  if (row.suggestedMicros !== req.toMicros) {
    return refuse('The suggested target has changed since the page loaded. Reload the page.')
  }
  if ((row.portfolio ? 'portfolio' : 'campaign') !== req.scope) {
    return refuse('The campaign moved onto or off a shared bid strategy. Refresh and try again.')
  }
  if (!Number.isInteger(req.toMicros) || req.toMicros <= 0 || req.toMicros % 10_000 !== 0) {
    return refuse('The new target is not a whole number of cents.')
  }

  // LIVE read, not the snapshot: the decision is about the campaign as it is now.
  const live = await adsSearch(
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type,
            campaign.maximize_conversions.target_cpa_micros, campaign.bidding_strategy
     FROM campaign WHERE campaign.id = ${campaignId}`
  )
  if (!live.ok) return refuse(`Could not read the campaign from Google: ${live.error}`)
  const c = obj(obj(live.rows[0]).campaign)
  const name = s(c.name)
  base.campaignName = name || base.campaignName
  if (!name) return refuse('Google has no such campaign in that account.')
  if (!isAgmpCampaign(name)) return refuse(`"${name}" does not start with AGMP. Not touched.`)
  if (s(c.status) !== 'ENABLED') return refuse(`"${name}" is ${s(c.status).toLowerCase() || 'not enabled'}.`)
  if (s(c.biddingStrategyType) !== 'MAXIMIZE_CONVERSIONS') {
    return refuse(`"${name}" is on ${s(c.biddingStrategyType)}, not Maximize Conversions. Bidding types are never changed here.`)
  }

  const portfolio = s(c.biddingStrategy)
  let resource: 'campaigns' | 'biddingStrategies' = 'campaigns'
  let resourceName = `customers/${customerId}/campaigns/${campaignId}`
  let liveTarget: number | null = c.maximizeConversions && obj(c.maximizeConversions).targetCpaMicros != null
    ? n(obj(c.maximizeConversions).targetCpaMicros)
    : null

  if (portfolio) {
    if (req.scope !== 'portfolio') return refuse('This campaign is on a shared bid strategy now. Refresh and try again.')
    const [strategy, members] = await Promise.all([
      adsSearch(
        customerId,
        `SELECT bidding_strategy.resource_name, bidding_strategy.name, bidding_strategy.type,
                bidding_strategy.maximize_conversions.target_cpa_micros
         FROM bidding_strategy WHERE bidding_strategy.resource_name = '${portfolio}'`
      ),
      adsSearch(
        customerId,
        `SELECT campaign.id, campaign.name FROM campaign
         WHERE campaign.bidding_strategy = '${portfolio}' AND campaign.status != 'REMOVED'`
      ),
    ])
    if (!strategy.ok) return refuse(`Could not read the shared bid strategy: ${strategy.error}`)
    if (!members.ok) return refuse(`Could not list the campaigns on the shared bid strategy: ${members.error}`)
    const p = obj(obj(strategy.rows[0]).biddingStrategy)
    if (s(p.type) !== 'MAXIMIZE_CONVERSIONS') return refuse('The shared bid strategy is not Maximize Conversions.')
    const names = members.rows.map((r) => s(obj(obj(r).campaign).name))
    const foreign = names.filter((x) => !isAgmpCampaign(x))
    base.affectedCampaigns = names.length
    if (foreign.length) {
      return refuse(`The shared strategy "${s(p.name)}" also runs ${foreign.map((x) => `"${x}"`).join(', ')}, which ${foreign.length === 1 ? 'is' : 'are'} not AGMP. Not touched.`)
    }
    resource = 'biddingStrategies'
    resourceName = portfolio
    liveTarget = obj(p.maximizeConversions).targetCpaMicros != null ? n(obj(p.maximizeConversions).targetCpaMicros) : null
  } else if (req.scope !== 'campaign') {
    return refuse('This campaign is no longer on a shared bid strategy. Refresh and try again.')
  }
  base.resourceName = resourceName

  // Somebody changed it in Google since the snapshot: their change wins.
  const same = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 5_000)
  if (!same(liveTarget, req.fromMicros)) {
    return refuse(
      `The target in Google is now ${liveTarget == null ? 'not set' : (liveTarget / 1e6).toFixed(2)}, not the ${req.fromMicros == null ? 'unset' : (req.fromMicros / 1e6).toFixed(2)} shown. Refresh first.`
    )
  }

  const body = (validateOnly: boolean) => ({
    operations: [
      {
        update: { resourceName, maximizeConversions: { targetCpaMicros: String(req.toMicros) } },
        // The ONE field this panel may change.
        updateMask: 'maximizeConversions.targetCpaMicros',
      },
    ],
    validateOnly,
  })

  const check = await adsMutate(customerId, resource, body(true))
  if (!check.ok) {
    await log(base, 'validate-failed', { error: check.error })
    return { ok: false, status: 'validate-failed', error: `Google refused the change in its test: ${check.error}` }
  }
  const sent = await adsMutate(customerId, resource, body(false))
  if (!sent.ok) {
    await log(base, 'failed', { error: sent.error })
    return { ok: false, status: 'failed', error: `Google refused the change: ${sent.error}` }
  }

  const back = await adsSearch(
    customerId,
    resource === 'campaigns'
      ? `SELECT campaign.maximize_conversions.target_cpa_micros FROM campaign WHERE campaign.id = ${campaignId}`
      : `SELECT bidding_strategy.maximize_conversions.target_cpa_micros FROM bidding_strategy WHERE bidding_strategy.resource_name = '${resourceName}'`
  )
  const backRow = back.ok ? obj(back.rows[0]) : {}
  const readRaw = obj(obj(resource === 'campaigns' ? backRow.campaign : backRow.biddingStrategy).maximizeConversions).targetCpaMicros
  const readBackMicros = readRaw == null ? null : n(readRaw)
  const status = readBackMicros != null && Math.abs(readBackMicros - req.toMicros) < 5_000 ? 'applied' : 'unconfirmed'
  await log(base, status, { readBackMicros, error: back.ok ? undefined : `Read-back failed: ${back.error}` })
  return { ok: true, scope: req.scope, readBackMicros, affectedCampaigns: base.affectedCampaigns, status }
}
