import { prisma } from '@/lib/db'
import { adsSearch, getAdsCredentials } from '@/lib/google-ads'
import { HIDDEN_ACCOUNT_IDS, clientsByCustomerId, pool, todayIn } from '@/lib/campaign-report-fetch'
import {
  CPA_WINDOW_DAYS,
  isAgmpCampaign,
  n,
  spendWindow,
  type Portfolio,
  type Recommendation,
  type Simulation,
  type TcpaAccount,
  type TcpaCampaign,
  type TcpaSnapshot,
} from '@/lib/target-cpa'

/**
 * Reads every account for the Target CPA panel and stores a snapshot. The
 * rules are in `target-cpa.ts`; this file only fetches and stores.
 *
 * ONE QUERY PER RESOURCE PER ACCOUNT, never per campaign: the campaigns, the
 * portfolio strategies (only when a campaign uses one), the simulations, the
 * recommendations, the ad schedules, and thirty days of spend by day. Fifteen
 * accounts at six queries, six accounts at a time, is seconds — well inside the function's
 * limit, and the run measures and stores its own duration to prove it.
 *
 * An account that fails is KEPT with its error, not dropped: a missing row on
 * a page whose job is "which campaigns are not spending" reads as "fine".
 *
 * Read-only. The one write is `target-cpa-apply.ts`, behind its own flag.
 */

const CONCURRENCY = 6
/** Snapshots older than this are pruned on each write; the page reads the latest. */
const KEEP_DAYS = 60

const s = (v: unknown): string => (v == null ? '' : String(v))
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const maybeNum = (v: unknown): number | null => (v == null || v === '' ? null : n(v))

/**
 * Whether a suggested target may be APPLIED. ON by default, at the owner's
 * call: it shipped behind an off-by-default flag, and the flag could not be
 * set from where the work was done, so it became a built-in. The variable
 * stays as a KILL SWITCH — `TARGET_CPA_APPLY_ENABLED=false` turns every Set
 * button and the apply route off at the next deploy, without a code change.
 * Every other guard (owner only, AGMP only, live re-read, validate-only,
 * read-back, change log) is unaffected by it.
 */
export function applyEnabled(): boolean {
  return process.env.TARGET_CPA_APPLY_ENABLED !== 'false'
}

export interface Listed {
  customerId: string
  name: string
  currency: string
  timeZone: string
}

async function listAccounts(): Promise<{ ok: true; accounts: Listed[] } | { ok: false; error: string }> {
  const creds = await getAdsCredentials()
  if (!creds) return { ok: false, error: 'Google Ads credentials are not configured.' }
  if (!creds.loginCustomerId) return { ok: false, error: 'Set the manager (MCC) customer ID in Settings.' }
  const res = await adsSearch(
    creds.loginCustomerId,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
            customer_client.time_zone, customer_client.manager
     FROM customer_client
     WHERE customer_client.manager = FALSE AND customer_client.status = 'ENABLED'`
  )
  if (!res.ok) return res
  return {
    ok: true,
    accounts: res.rows
      .map((row) => obj(obj(row).customerClient))
      // The same accounts the campaign table leaves off: not part of the book.
      .filter((c) => c.id && !c.manager && !HIDDEN_ACCOUNT_IDS.has(s(c.id)))
      .map((c) => ({
        customerId: s(c.id),
        name: s(c.descriptiveName) || s(c.id),
        currency: s(c.currencyCode) || 'USD',
        timeZone: s(c.timeZone) || 'America/New_York',
      })),
  }
}

/* The five recommendation types and the sub-message each one's figures are in.
   GAQL refuses the leaf fields (UNRECOGNIZED_FIELD, checked live on v25), so
   the parents are selected and read in `recommendationTarget`. */
const REC_FIELDS: Record<string, string> = {
  RAISE_TARGET_CPA_BID_TOO_LOW: 'raiseTargetCpaBidTooLowRecommendation',
  RAISE_TARGET_CPA: 'raiseTargetCpaRecommendation',
  SET_TARGET_CPA: 'setTargetCpaRecommendation',
  FORECASTING_SET_TARGET_CPA: 'forecastingSetTargetCpaRecommendation',
  TARGET_CPA_OPT_IN: 'targetCpaOptInRecommendation',
}

type Search = typeof adsSearch

/** `search` is the API call — passed in so a check can answer it from saved rows. */
export async function readTcpaAccount(
  account: Listed,
  client: { id: string; businessName: string } | undefined,
  search: Search = adsSearch
): Promise<TcpaAccount> {
  const today = todayIn(account.timeZone)
  const w30 = spendWindow(today, CPA_WINDOW_DAYS)
  const base: TcpaAccount = {
    customerId: account.customerId,
    name: client?.businessName || account.name,
    clientId: client?.id ?? null,
    currency: account.currency,
    timeZone: account.timeZone,
    today,
    campaigns: [],
    otherSharedSpend: {},
    error: null,
  }

  const [list, sims, recs, spend, schedules] = await Promise.all([
    search(
      account.customerId,
      `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.bidding_strategy_type,
              campaign.maximize_conversions.target_cpa_micros, campaign.target_cpa.target_cpa_micros,
              campaign.bidding_strategy, campaign.primary_status, campaign.primary_status_reasons,
              campaign.start_date_time, campaign_budget.amount_micros, campaign_budget.explicitly_shared,
              campaign_budget.resource_name
       FROM campaign
       WHERE campaign.status = 'ENABLED' AND campaign.name LIKE 'AGMP%'`
    ),
    search(
      account.customerId,
      `SELECT campaign_simulation.campaign_id, campaign_simulation.start_date, campaign_simulation.end_date,
              campaign_simulation.target_cpa_point_list.points
       FROM campaign_simulation
       WHERE campaign_simulation.type = 'TARGET_CPA' AND campaign_simulation.modification_method = 'UNIFORM'`
    ),
    search(
      account.customerId,
      `SELECT recommendation.type, recommendation.campaign,
              recommendation.raise_target_cpa_bid_too_low_recommendation,
              recommendation.raise_target_cpa_recommendation,
              recommendation.set_target_cpa_recommendation,
              recommendation.forecasting_set_target_cpa_recommendation,
              recommendation.target_cpa_opt_in_recommendation
       FROM recommendation
       WHERE recommendation.type IN ('${Object.keys(REC_FIELDS).join("','")}')`
    ),
    // EVERY campaign, not only ours: a shared budget is spent by everything on
    // it, and the comparison has to count the campaigns the panel ignores.
    search(
      account.customerId,
      `SELECT campaign.id, campaign_budget.resource_name, campaign_budget.explicitly_shared,
              segments.date, metrics.cost_micros, metrics.conversions
       FROM campaign
       WHERE segments.date BETWEEN '${w30.start}' AND '${w30.end}'`
    ),
    // Ad schedules: a weekday-only campaign's weekend is not underspending.
    search(
      account.customerId,
      `SELECT campaign.id, campaign_criterion.ad_schedule.day_of_week
       FROM campaign_criterion
       WHERE campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.status != 'REMOVED'
         AND campaign.status = 'ENABLED' AND campaign.name LIKE 'AGMP%'`
    ),
  ])
  // The campaign list and the spend are the panel; without either there is
  // nothing true to show. Simulations and recommendations are columns, and a
  // failure there is reported beside rows that are otherwise right.
  if (!list.ok) return { ...base, error: `Campaigns: ${list.error}` }
  if (!spend.ok) return { ...base, error: `Spend: ${spend.error}` }
  const partial: string[] = []
  if (!sims.ok) partial.push(`Simulations: ${sims.error}`)
  if (!recs.ok) partial.push(`Recommendations: ${recs.error}`)
  // Without them every scheduled campaign reads its days off as $0 days, so
  // the failure is said beside the rows rather than swallowed.
  if (!schedules.ok) partial.push(`Ad schedules: ${schedules.error}`)

  const campaigns = new Map<string, TcpaCampaign>()
  const portfolioNames = new Set<string>()
  for (const row of list.rows) {
    const c = obj(obj(row).campaign)
    const b = obj(obj(row).campaignBudget)
    const id = s(c.id)
    const name = s(c.name)
    // The query already says AGMP%; LIKE is case-insensitive, the rule is not.
    if (!id || !isAgmpCampaign(name)) continue
    const portfolio = s(c.biddingStrategy) || null
    if (portfolio) portfolioNames.add(portfolio)
    campaigns.set(id, {
      id,
      name,
      channel: s(c.advertisingChannelType) || null,
      biddingType: s(c.biddingStrategyType) || 'UNKNOWN',
      ownTargetMicros: maybeNum(obj(c.maximizeConversions).targetCpaMicros) ?? maybeNum(obj(c.targetCpa).targetCpaMicros),
      portfolio: portfolio ? { resourceName: portfolio, name: '', type: '', targetMicros: null, campaignCount: 0 } : null,
      primaryStatus: s(c.primaryStatus) || null,
      // Omitted when empty — the protobuf rule again.
      reasons: Array.isArray(c.primaryStatusReasons) ? c.primaryStatusReasons.map(s) : [],
      // `campaign.start_date` does not exist on v25; `start_date_time` is
      // "2025-08-03 17:12:18" in the account's zone.
      startDate: s(c.startDateTime).slice(0, 10) || null,
      budgetMicros: maybeNum(b.amountMicros),
      budgetShared: b.explicitlyShared === true,
      budgetResource: s(b.resourceName) || null,
      schedule: null,
      days: {},
      simulation: null,
      recommendations: [],
    })
  }

  // Portfolio strategies hold the target for every campaign on them. Only
  // fetched when one of ours uses one, which is rare.
  if (portfolioNames.size > 0) {
    const ps = await search(
      account.customerId,
      `SELECT bidding_strategy.resource_name, bidding_strategy.name, bidding_strategy.type,
              bidding_strategy.maximize_conversions.target_cpa_micros, bidding_strategy.target_cpa.target_cpa_micros,
              bidding_strategy.campaign_count
       FROM bidding_strategy`
    )
    if (!ps.ok) partial.push(`Portfolio strategies: ${ps.error}`)
    else {
      const byName = new Map<string, Portfolio>()
      for (const row of ps.rows) {
        const p = obj(obj(row).biddingStrategy)
        const resourceName = s(p.resourceName)
        byName.set(resourceName, {
          resourceName,
          name: s(p.name),
          type: s(p.type),
          targetMicros: maybeNum(obj(p.maximizeConversions).targetCpaMicros) ?? maybeNum(obj(p.targetCpa).targetCpaMicros),
          campaignCount: n(p.campaignCount),
        })
      }
      for (const c of campaigns.values()) {
        if (c.portfolio) c.portfolio = byName.get(c.portfolio.resourceName) || c.portfolio
      }
    }
  }

  if (sims.ok) {
    for (const row of sims.rows) {
      const sim = obj(obj(row).campaignSimulation)
      const c = campaigns.get(s(sim.campaignId))
      if (!c) continue
      const points = obj(sim.targetCpaPointList).points
      const simulation: Simulation = {
        startDate: s(sim.startDate),
        endDate: s(sim.endDate),
        points: (Array.isArray(points) ? points : []).map((p) => {
          const q = obj(p)
          return {
            targetMicros: n(q.targetCpaMicros),
            costMicros: n(q.costMicros),
            conversions: n(q.biddableConversions),
            requiredBudgetMicros: maybeNum(q.requiredBudgetAmountMicros),
          }
        }),
      }
      // One per campaign is the norm; keep the most recent if there are two.
      if (!c.simulation || simulation.endDate > c.simulation.endDate) c.simulation = simulation
    }
  }

  if (recs.ok) {
    for (const row of recs.rows) {
      const r = obj(obj(row).recommendation)
      const id = s(r.campaign).split('/').pop() || ''
      const c = campaigns.get(id)
      const type = s(r.type)
      if (!c || !REC_FIELDS[type]) continue
      const rec: Recommendation = { type, detail: obj(r[REC_FIELDS[type]]) }
      c.recommendations.push(rec)
    }
  }

  if (schedules.ok) {
    for (const row of schedules.rows) {
      const r = obj(row)
      const c = campaigns.get(s(obj(r.campaign).id))
      const day = s(obj(obj(r.campaignCriterion).adSchedule).dayOfWeek)
      if (!c || !day) continue
      // Several windows on one day (morning and afternoon) are still one day.
      const days = (c.schedule ||= [])
      if (!days.includes(day)) days.push(day)
    }
  }

  const otherSharedSpend: Record<string, Record<string, number>> = {}
  for (const row of spend.rows) {
    const r = obj(row)
    const id = s(obj(r.campaign).id)
    const date = s(obj(r.segments).date)
    const m = obj(r.metrics)
    if (!id || !date) continue
    const c = campaigns.get(id)
    if (c) {
      const prev = c.days[date] || [0, 0]
      c.days[date] = [prev[0] + n(m.costMicros), prev[1] + n(m.conversions)]
      continue
    }
    const b = obj(r.campaignBudget)
    const budget = s(b.resourceName)
    if (b.explicitlyShared === true && budget) {
      const day = (otherSharedSpend[budget] ||= {})
      day[date] = (day[date] || 0) + n(m.costMicros)
    }
  }
  // Only the shared budgets one of OUR campaigns is on matter.
  const ours = new Set([...campaigns.values()].map((c) => c.budgetResource).filter(Boolean))
  for (const k of Object.keys(otherSharedSpend)) if (!ours.has(k)) delete otherSharedSpend[k]

  return {
    ...base,
    campaigns: [...campaigns.values()],
    otherSharedSpend,
    error: partial.length ? partial.join(' · ') : null,
  }
}

export async function buildTcpaSnapshot(): Promise<TcpaSnapshot> {
  const listed = await listAccounts()
  if (!listed.ok) return { builtAt: new Date().toISOString(), accounts: [], error: listed.error }
  const clientFor = await clientsByCustomerId().catch(() => new Map<string, { id: string; businessName: string }>())
  const accounts = await pool(listed.accounts, CONCURRENCY, (a) =>
    readTcpaAccount(a, clientFor.get(a.customerId)).catch(
      (e): TcpaAccount => ({
        customerId: a.customerId,
        name: clientFor.get(a.customerId)?.businessName || a.name,
        clientId: clientFor.get(a.customerId)?.id ?? null,
        currency: a.currency,
        timeZone: a.timeZone,
        today: todayIn(a.timeZone),
        campaigns: [],
        otherSharedSpend: {},
        error: e instanceof Error ? e.message : 'Read failed',
      })
    )
  )
  accounts.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  return { builtAt: new Date().toISOString(), accounts, error: null }
}

/** Read every account and store the result. Never throws past a stored error. */
export async function runTargetCpaSnapshot(trigger: 'cron' | 'manual' | 'auto') {
  const started = Date.now()
  const snapshot = await buildTcpaSnapshot()
  const durationMs = Date.now() - started
  const errors = snapshot.accounts.filter((a) => a.error).length + (snapshot.error ? 1 : 0)
  const campaigns = snapshot.accounts.reduce((t, a) => t + a.campaigns.length, 0)
  // A run that could not even list the accounts is not stored over a good one:
  // the page would go empty and read as "nothing is underspending".
  if (snapshot.error) {
    return { ok: false as const, error: snapshot.error, durationMs }
  }
  const row = await prisma.targetCpaSnapshot.create({
    data: {
      trigger,
      accounts: snapshot.accounts.length,
      errors,
      durationMs,
      payload: snapshot as unknown as object,
    },
    select: { id: true, createdAt: true },
  })
  await prisma.targetCpaSnapshot
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } })
    .catch(() => {})
  return {
    ok: true as const,
    id: row.id,
    builtAt: snapshot.builtAt,
    accounts: snapshot.accounts.length,
    campaigns,
    errors: snapshot.accounts.filter((a) => a.error).map((a) => `${a.name}: ${a.error}`),
    durationMs,
  }
}

export async function latestTcpaSnapshot(): Promise<{ snapshot: TcpaSnapshot; trigger: string; durationMs: number } | null> {
  const row = await prisma.targetCpaSnapshot
    .findFirst({ orderBy: { createdAt: 'desc' }, select: { payload: true, trigger: true, durationMs: true } })
    .catch(() => null)
  if (!row) return null
  return { snapshot: row.payload as unknown as TcpaSnapshot, trigger: row.trigger, durationMs: row.durationMs }
}

/** Older than this and the page reads again on open: a missed morning run. */
const STALE_MS = 26 * 60 * 60 * 1000

/**
 * What the page shows. A page with no reading is a page that says nothing,
 * and the morning run can be up to a day away — so the first visit, or one
 * after a missed morning run, reads every account itself. The same read-only
 * run "Refresh now" makes, and only when there is nothing current to show.
 */
export async function currentTcpaSnapshot(): Promise<{
  latest: Awaited<ReturnType<typeof latestTcpaSnapshot>>
  autoError: string | null
}> {
  const latest = await latestTcpaSnapshot()
  if (latest && Date.now() - Date.parse(latest.snapshot.builtAt) <= STALE_MS) return { latest, autoError: null }
  const run = await runTargetCpaSnapshot('auto')
  console.log(
    run.ok
      ? `[TargetCpa] auto read on open: ${run.accounts} accounts, ${run.campaigns} campaigns, ${run.errors.length} errors, ${run.durationMs}ms`
      : `[TargetCpa] auto read on open failed: ${run.error}`
  )
  if (!run.ok) return { latest, autoError: run.error }
  return { latest: await latestTcpaSnapshot(), autoError: null }
}
