/**
 * THE CAMPAIGN TABLE ON THE ADMIN HOME PAGE — the rules, import-free.
 *
 * Shaped like the Google Ads app's campaign list on purpose: budget, cost,
 * impressions, clicks, conversions, conversion rate and calls per campaign,
 * one range picker on top. What it adds is the one thing Google's app cannot
 * do from one screen: every account under the manager side by side, with the
 * campaigns that need a look marked.
 *
 * No React, no Prisma, no fetch, so the client component switches ranges
 * without a round trip and `scripts/check-campaign-report.ts` can hold the
 * rules against real-shaped rows.
 *
 * THE RANGES ARE GOOGLE'S CONVENTION, NOT A CALENDAR'S. "Last 7 days" in
 * Google Ads ends YESTERDAY: today is still accumulating, and folding a
 * half-day into a seven-day window reads as a dip that is not there. Today is
 * its own range for the same reason. Every date is the ACCOUNT's own date
 * (`customer_client.time_zone`), the zone Google segments by — an account in
 * Vancouver and one in New York do not share a "today" for three hours a day.
 */

/* `short` is what a 320px phone has room for: all seven in one row, so no
   range is hidden off the edge of a scroller nobody knows is there. */
export const RANGES = [
  { id: 'today', label: 'Today', short: 'Today' },
  { id: 'yesterday', label: 'Yesterday', short: 'Yest.' },
  { id: '3d', label: '3 days', short: '3d' },
  { id: '7d', label: '7 days', short: '7d' },
  { id: '14d', label: '14 days', short: '14d' },
  { id: '21d', label: '21 days', short: '21d' },
  { id: '30d', label: '30 days', short: '30d' },
] as const

export type RangeId = (typeof RANGES)[number]['id']
export const DEFAULT_RANGE: RangeId = '7d'

export function isRangeId(v: unknown): v is RangeId {
  return RANGES.some((r) => r.id === v)
}

/** Enough history for the longest range AND the equal period before it. */
export const HISTORY_DAYS = 60

/** `YYYY-MM-DD` arithmetic on the string itself, no zone involved. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export interface DateWindow {
  start: string
  end: string
  days: number
}

export function rangeWindow(range: RangeId, today: string): DateWindow {
  if (range === 'today') return { start: today, end: today, days: 1 }
  const yesterday = addDays(today, -1)
  if (range === 'yesterday') return { start: yesterday, end: yesterday, days: 1 }
  const days = parseInt(range, 10)
  return { start: addDays(today, -days), end: yesterday, days }
}

/** The same number of days immediately before, for the change figures. */
export function previousWindow(w: DateWindow): DateWindow {
  return { start: addDays(w.start, -w.days), end: addDays(w.start, -1), days: w.days }
}

function inWindow(date: string, w: DateWindow): boolean {
  return date >= w.start && date <= w.end
}

/** One day of one campaign: cost in MICROS, then the counts. A tuple, because
 *  sixty of them per campaign per account travel to the browser. */
export type DayMetrics = [
  costMicros: number,
  impressions: number,
  clicks: number,
  interactions: number,
  conversions: number,
  calls: number,
]

export interface ReportCampaign {
  id: string
  name: string
  /** campaign.status — what the operator set. */
  status: string
  /** campaign.primary_status — Google's own verdict on whether it serves. */
  primaryStatus: string | null
  reasons: string[]
  channel: string | null
  budgetId: string | null
  /** DAILY budget. Not additive over days; a budget is a rate. */
  budgetMicros: number | null
  budgetShared: boolean
  /** campaign.bidding_strategy_type. Optional: a stored fixture predates it. */
  biddingType?: string | null
  /** The campaign's OWN target CPA, read live. A portfolio's is not here. */
  targetCpaMicros?: number | null
  days: Record<string, DayMetrics>
}

export interface ReportAccount {
  customerId: string
  /** The client's name when the account is bound to one, else Google's. */
  name: string
  clientId: string | null
  currency: string
  timeZone: string
  /** customer_client.status: ENABLED, or SUSPENDED — which serves nothing
   *  and is the one account-level fact worth a mark. */
  status: string
  /** Today's date in the account's zone, when the report was built. */
  today: string
  campaigns: ReportCampaign[]
  /** A failed read is shown, never dropped: "spent nothing" and "could not
   *  read the account" are different claims. */
  error: string | null
}

export interface CampaignReportData {
  builtAt: string
  accounts: ReportAccount[]
  /** The manager listing itself failed — nothing below is complete. */
  error: string | null
  /** From the latest Target CPA snapshot, by `customerId:campaignId`. */
  targets?: Record<string, TargetHint>
}

/**
 * What the Target CPA panel (`target-cpa.ts`) concluded about a campaign this
 * morning, carried onto the campaign table so the two screens agree. Declared
 * here, not imported, so this module stays import-free.
 */
export interface TargetHint {
  /** The panel would apply this: underspending, and a higher .77 target spends it. */
  raise: boolean
  suggestedMicros: number | null
  spendPct: number | null
  /** The target the snapshot read — compared with the live one, to drop a stale hint. */
  snapshotTargetMicros: number | null
  portfolio: boolean
  /** For the confirm dialog's warning: a shared strategy moves every campaign on it. */
  portfolioName?: string
  portfolioCampaigns?: number
  builtAt: string
}

export type TargetLabel =
  | { kind: 'max-clicks' }
  | { kind: 'max-conv'; micros: number | null; portfolio: boolean }
  | { kind: 'target-cpa'; micros: number | null }

/** The bidding line under a campaign's name, or null for anything else. */
export function targetLabel(c: ReportCampaign, hint?: TargetHint): TargetLabel | null {
  if (c.biddingType === 'TARGET_SPEND') return { kind: 'max-clicks' }
  // A portfolio campaign has no target of its own; the snapshot read the strategy's.
  const micros = c.targetCpaMicros ?? (hint?.portfolio ? hint.snapshotTargetMicros : null)
  if (c.biddingType === 'MAXIMIZE_CONVERSIONS') return { kind: 'max-conv', micros, portfolio: !!hint?.portfolio }
  if (c.biddingType === 'TARGET_CPA') return { kind: 'target-cpa', micros }
  return null
}

/**
 * "Target too low — try $X", or nothing. Only what the Target CPA panel would
 * apply, and DROPPED when the live target is no longer the one the morning
 * snapshot read: somebody has already changed it, and a suggestion computed
 * against the old target is advice about a campaign that no longer exists.
 */
export function targetAdvice(c: ReportCampaign, hint?: TargetHint): { suggestedMicros: number } | null {
  if (!hint?.raise || hint.suggestedMicros == null) return null
  if (!hint.portfolio && c.targetCpaMicros !== undefined) {
    const live = c.targetCpaMicros
    const then = hint.snapshotTargetMicros
    const same = (live == null && then == null) || (live != null && then != null && Math.abs(live - then) < 5_000)
    if (!same) return null
  }
  return { suggestedMicros: hint.suggestedMicros }
}

export interface Totals {
  costMicros: number
  impressions: number
  clicks: number
  interactions: number
  conversions: number
  calls: number
}

export const ZERO: Totals = {
  costMicros: 0,
  impressions: 0,
  clicks: 0,
  interactions: 0,
  conversions: 0,
  calls: 0,
}

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    costMicros: a.costMicros + b.costMicros,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    interactions: a.interactions + b.interactions,
    conversions: a.conversions + b.conversions,
    calls: a.calls + b.calls,
  }
}

export function campaignTotals(c: ReportCampaign, w: DateWindow): Totals {
  let t = ZERO
  for (const [date, m] of Object.entries(c.days)) {
    if (!inWindow(date, w)) continue
    t = addTotals(t, {
      costMicros: m[0],
      impressions: m[1],
      clicks: m[2],
      interactions: m[3],
      conversions: m[4],
      calls: m[5],
    })
  }
  return t
}

/**
 * Google's definition: conversions ÷ INTERACTIONS, pooled over the window —
 * never an average of daily rates, which lets one click on a quiet day weigh
 * like a busy week. Null, not 0%, when nothing was interacted with.
 */
export function convRate(t: Totals): number | null {
  return t.interactions > 0 ? t.conversions / t.interactions : null
}

/**
 * Cost per conversion in MICROS — Google's own figure, cost ÷ conversions,
 * so it reconciles with their app (the monthly report's rule too). Null, not
 * a cost, when nothing converted: "$0 per conversion" would read as free.
 */
export function costPerConv(t: Totals): number | null {
  return t.conversions > 0 ? t.costMicros / t.conversions : null
}

/**
 * An account's daily budget: the distinct budgets of its ENABLED campaigns.
 * Deduped by budget id, because a shared budget is one amount spread over
 * several campaigns and summing it per campaign counts it once per campaign.
 */
export function accountBudgetMicros(a: ReportAccount): number | null {
  const seen = new Map<string, number>()
  for (const c of a.campaigns) {
    if (!isRunning(c) || c.budgetMicros == null) continue
    seen.set(c.budgetId || `campaign:${c.id}`, c.budgetMicros)
  }
  if (seen.size === 0) return null
  return [...seen.values()].reduce((s, v) => s + v, 0)
}

// ---------------------------------------------------------------------------
// Issues. EVERY ONE NEEDS A FACT, never a taste: Google's own serving verdict,
// an enabled campaign nobody saw, or money spent with nothing to show for it.
// A table that marks half its rows is a table nobody reads the marks on.
// ---------------------------------------------------------------------------

/** Spend with zero conversions is only worth a mark past this, in the
 *  account's own currency — below it a quiet day is just a quiet day. */
export const NO_CONVERSION_MIN_SPEND = 50
/** …AND past this many days of the campaign's own daily budget, so a $300/day
 *  campaign is not flagged for one slow afternoon. */
export const NO_CONVERSION_BUDGET_DAYS = 2

export type IssueSeverity = 'bad' | 'warn'

export interface CampaignIssue {
  kind: 'not-serving' | 'limited' | 'no-impressions' | 'no-conversions' | 'under-budget'
  severity: IssueSeverity
  label: string
  detail: string
}

const PRIMARY_STATUS_LABEL: Record<string, string> = {
  ELIGIBLE: 'Eligible',
  LIMITED: 'Limited',
  LEARNING: 'Learning',
  NOT_ELIGIBLE: 'Not eligible',
  MISCONFIGURED: 'Misconfigured',
  PAUSED: 'Paused',
  PENDING: 'Pending',
  ENDED: 'Ended',
  REMOVED: 'Removed',
}

/** Google's reasons in Google's own UI words where they are known; any other
 *  enum is shown readably rather than hidden, because an unknown reason is
 *  still the reason. */
const REASON_LABEL: Record<string, string> = {
  BUDGET_CONSTRAINED: 'Limited by budget',
  BIDDING_STRATEGY_LEARNING: 'Bid strategy learning',
  BIDDING_STRATEGY_LIMITED: 'Bid strategy limited',
  BIDDING_STRATEGY_CONSTRAINED: 'Bid strategy constrained',
  BIDDING_STRATEGY_MISCONFIGURED: 'Bid strategy misconfigured',
  HAS_ADS_DISAPPROVED: 'Ads disapproved',
  HAS_ADS_LIMITED_BY_POLICY: 'Ads limited by policy',
  MOST_ADS_UNDER_REVIEW: 'Ads under review',
  CAMPAIGN_PENDING: 'Starts later',
  CAMPAIGN_ENDED: 'Ended',
  CAMPAIGN_PAUSED: 'Paused',
}

export function reasonLabel(reason: string): string {
  if (REASON_LABEL[reason]) return REASON_LABEL[reason]
  const words = reason.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** What the status line under a campaign's name says. */
export function statusLabel(c: ReportCampaign): string {
  if (c.status === 'PAUSED') return 'Paused'
  if (c.channel === 'LOCAL_SERVICES') return 'Local Services'
  if (c.status === 'REMOVED') return 'Removed'
  return PRIMARY_STATUS_LABEL[c.primaryStatus || ''] || (c.primaryStatus ? reasonLabel(c.primaryStatus) : 'Enabled')
}

/* Statuses that mean "not meant to be running", even with campaign.status
   ENABLED. Found on a real account: an ENABLED campaign whose end date had
   passed reads primary_status ENDED, and marking it "No impressions" is a
   mark about a decision, not a fault. */
const NOT_MEANT_TO_RUN = new Set(['PAUSED', 'ENDED', 'PENDING', 'REMOVED'])

/** Enabled AND meant to be serving now. */
export function isRunning(c: ReportCampaign): boolean {
  return c.status === 'ENABLED' && !NOT_MEANT_TO_RUN.has(c.primaryStatus || '')
}

/* Placeholders the API sends when it has no better word. A chip reading
   "Limited by budget, Unknown" — seen on ElitePro — adds a word nobody can
   act on to one they can. */
const NOT_A_REASON = new Set(['UNKNOWN', 'UNSPECIFIED', 'BIDDING_STRATEGY_LEARNING'])
/* Limited reasons that are not a FAULT, at the owner's call: a campaign
   limited by its budget is spending all of it, which is the budget doing its
   job — nothing to fix this morning. The other Limited reasons (bid strategy
   constrained, ads limited by policy, …) still mark. */
const NOT_A_FAULT = new Set(['BUDGET_CONSTRAINED'])

/* Local Services campaigns are Google's own, system-generated and managed
   outside the campaign screens; the API does not report their delivery the
   way it does a search campaign's. A real account's read ELIGIBLE with no
   impression rows in sixty days, and "No impressions" on it would be a mark
   nobody can act on here. Silence beats a confident mark that may be wrong. */
const NO_IMPRESSION_DATA = new Set(['LOCAL_SERVICES'])

export function campaignIssues(
  c: ReportCampaign,
  t: Totals,
  range: RangeId,
  currency = 'USD'
): CampaignIssue[] {
  // Paused, ended or removed is a decision somebody made, not a fault.
  if (!isRunning(c)) return []
  const issues: CampaignIssue[] = []
  const reasons = c.reasons.filter((r) => !NOT_A_REASON.has(r))
  const why = reasons.map(reasonLabel).join(', ')

  if (c.primaryStatus === 'NOT_ELIGIBLE' || c.primaryStatus === 'MISCONFIGURED') {
    issues.push({
      kind: 'not-serving',
      severity: 'bad',
      label: why || statusLabel(c),
      detail: `Google says this campaign is ${statusLabel(c).toLowerCase()}${why ? `: ${why}` : ''}. It is enabled and cannot show.`,
    })
  } else if (c.primaryStatus === 'LIMITED') {
    const faults = reasons.filter((r) => !NOT_A_FAULT.has(r))
    if (faults.length > 0) {
      const what = faults.map(reasonLabel).join(', ')
      issues.push({
        kind: 'limited',
        severity: 'warn',
        label: what,
        detail: `Google marks this campaign Limited: ${what}.`,
      })
    }
  }

  /* NOT FOR TODAY. At 7am an enabled campaign with no impressions yet is an
     ordinary morning, and Google's own figures for today run hours behind. A
     whole day or more with none, while enabled and not already explained by
     Google's verdict above, is a campaign nobody can see. */
  if (
    range !== 'today' &&
    t.impressions === 0 &&
    !NO_IMPRESSION_DATA.has(c.channel || '') &&
    !issues.some((i) => i.kind === 'not-serving')
  ) {
    issues.push({
      kind: 'no-impressions',
      severity: 'bad',
      label: 'No impressions',
      detail: 'Enabled, and not shown to anybody in this period.',
    })
  }

  const cost = t.costMicros / 1_000_000
  const budget = (c.budgetMicros ?? 0) / 1_000_000
  if (
    t.conversions === 0 &&
    cost >= NO_CONVERSION_MIN_SPEND &&
    cost >= budget * NO_CONVERSION_BUDGET_DAYS
  ) {
    issues.push({
      kind: 'no-conversions',
      severity: 'bad',
      label: 'Spending, no conversions',
      detail: `Spent ${formatMoney(t.costMicros, currency)} in this period with no conversions recorded.`,
    })
  }
  return issues
}

/** Worst first, so the row's colour is its worst mark. */
export function worstSeverity(issues: CampaignIssue[]): IssueSeverity | null {
  if (issues.some((i) => i.severity === 'bad')) return 'bad'
  if (issues.length > 0) return 'warn'
  return null
}

/**
 * Which campaigns a row list shows. Running always — a running campaign with
 * nothing in the period IS the finding. Paused, ended and removed only when
 * they spent in the period, so the account total is explained by the rows
 * under it; one that cost nothing is history, not a row.
 */
export function visibleCampaigns(a: ReportAccount, w: DateWindow): Array<{ c: ReportCampaign; t: Totals }> {
  return a.campaigns
    .map((c) => ({ c, t: campaignTotals(c, w) }))
    .filter(({ c, t }) => isRunning(c) || t.costMicros > 0 || t.impressions > 0)
    .sort((x, y) => {
      if (isRunning(x.c) !== isRunning(y.c)) return isRunning(x.c) ? -1 : 1
      return y.t.costMicros - x.t.costMicros || x.c.name.localeCompare(y.c.name)
    })
}

/** Nothing running and nothing spent in the whole history. Still a ROW —
 *  "every account on the list" means every one, and an account that went
 *  quiet is exactly what someone scanning the list is looking for — but it
 *  sorts to the foot, below the accounts that are spending money. */
export function isIdle(a: ReportAccount): boolean {
  // A failed read or a suspension is a FINDING, so it never sinks to the foot.
  if (a.error || a.status === 'SUSPENDED') return false
  return !a.campaigns.some(
    (c) => isRunning(c) || Object.values(c.days).some((m) => m[0] > 0 || m[1] > 0)
  )
}

/** Percentage change, or null where there is nothing to compare against. */
export function change(now: number, before: number): number | null {
  if (before === 0) return null
  return (now - before) / before
}

// ---------------------------------------------------------------------------
// Sorting. A tap on a heading sorts the ACCOUNTS by their totals and, inside
// each, the campaigns by the same figure — the grouping stays, because a
// campaign row without its account above it is a number with no owner.
// ---------------------------------------------------------------------------

export const SORT_KEYS = [
  'name',
  'issues',
  'budget',
  'cost',
  'impressions',
  'clicks',
  'conversions',
  'costPerConv',
  'convRate',
  'calls',
] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'
export interface SortState {
  key: SortKey
  dir: SortDir
}
/** Alphabetical — the order the admin home has always used, so a client
 *  somebody already has in mind is where they left it. */
export const DEFAULT_SORT: SortState = { key: 'name', dir: 'asc' }

export function isSortState(v: unknown): v is SortState {
  const s = v as SortState
  return !!s && (SORT_KEYS as readonly string[]).includes(s.key) && (s.dir === 'asc' || s.dir === 'desc')
}

/** A first tap on a figure puts the BIGGEST first — the money and the
 *  outliers are what a sort is reached for. Names start at A. */
export function firstDir(key: SortKey): SortDir {
  // 'issues' (most marks first) is a figure like the others.
  return key === 'name' ? 'asc' : 'desc'
}

export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, dir: firstDir(key) }
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
}

/** The figure a row sorts on. Null where there is nothing to compare — no
 *  budget, no conversions to divide by — and nulls always sort LAST in both
 *  directions, so "lowest cost per conversion" is not a column of blanks. */
export function sortValue(key: SortKey, t: Totals, budgetMicros: number | null): number | null {
  switch (key) {
    case 'budget':
      return budgetMicros
    case 'cost':
      return t.costMicros
    case 'impressions':
      return t.impressions
    case 'clicks':
      return t.clicks
    case 'conversions':
      return t.conversions
    case 'costPerConv':
      return costPerConv(t)
    case 'convRate':
      return convRate(t)
    case 'calls':
      return t.calls
    default:
      return null
  }
}

export function sortRows<T>(
  rows: T[],
  sort: SortState,
  get: (row: T) => { name: string; value: number | null }
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((x, y) => {
    const a = get(x)
    const b = get(y)
    if (sort.key !== 'name') {
      if (a.value == null && b.value != null) return 1
      if (b.value == null && a.value != null) return -1
      if (a.value != null && b.value != null && a.value !== b.value) return sign * (a.value - b.value)
      // Ties (and two blanks) fall back to the name, always A first.
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    }
    return sign * a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  })
}

// ---------------------------------------------------------------------------
// Under-spending. Google spends close to a daily budget on most days when
// nothing is holding a campaign back, so a campaign spending well under it
// for several COMPLETE days is being held back by something — bids,
// targeting, keywords, a disapproval — and the budget the shop set is not
// buying what they think it is. Judged per BUDGET, not per campaign: a shared
// budget split over three campaigns would otherwise mark all three.
// ---------------------------------------------------------------------------

/** Under this share of the daily budget, on average, is under-spending. */
export const UNDERSPEND_SHARE = 0.5
/** Budgets below this (per day, account currency) are left alone — a $3/day
 *  test is noise, not a finding. */
export const UNDERSPEND_MIN_BUDGET = 10
/** The alert's window: three complete days, so one quiet Sunday is silent. */
export const UNDERSPEND_ALERT_DAYS = 3

export interface Underspend {
  /** The budget's id, or the campaign's own when it has no shared budget. */
  budgetKey: string
  campaignIds: string[]
  names: string[]
  budgetMicros: number
  spentMicros: number
  days: number
  /** spent ÷ (budget × days) */
  share: number
}

export function underspendingBudgets(a: ReportAccount, w: DateWindow): Underspend[] {
  if (a.error || a.status === 'SUSPENDED' || w.days < 1) return []
  const groups = new Map<string, { budgetMicros: number; running: ReportCampaign[]; all: ReportCampaign[] }>()
  for (const c of a.campaigns) {
    if (c.budgetMicros == null) continue
    const key = c.budgetId || `campaign:${c.id}`
    const g = groups.get(key) || { budgetMicros: c.budgetMicros, running: [], all: [] }
    g.all.push(c)
    // Only a campaign that is meant to serve, that Google has not already
    // explained (not eligible = its own mark), that is not budget-capped (the
    // opposite fault) and that reports delivery the usual way counts.
    const explained =
      c.primaryStatus === 'NOT_ELIGIBLE' ||
      c.primaryStatus === 'MISCONFIGURED' ||
      c.reasons.includes('BUDGET_CONSTRAINED') ||
      c.channel === 'LOCAL_SERVICES'
    if (isRunning(c) && !explained) g.running.push(c)
    groups.set(key, g)
  }
  const out: Underspend[] = []
  for (const [budgetKey, g] of groups) {
    if (g.running.length === 0) continue
    if (g.budgetMicros < UNDERSPEND_MIN_BUDGET * 1_000_000) continue
    // Every campaign on the budget spends from it, paused ones included.
    const spentMicros = g.all.reduce((s, c) => s + campaignTotals(c, w).costMicros, 0)
    const share = spentMicros / (g.budgetMicros * w.days)
    if (share >= UNDERSPEND_SHARE) continue
    out.push({
      budgetKey,
      campaignIds: g.running.map((c) => c.id),
      names: g.running.map((c) => c.name),
      budgetMicros: g.budgetMicros,
      spentMicros,
      days: w.days,
      share,
    })
  }
  return out
}

function formatMoney(micros: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(micros / 1_000_000)
  } catch {
    return `${(micros / 1_000_000).toFixed(2)} ${currency}`
  }
}

/** The mark a campaign row carries for it, in the table. */
export function underspendIssue(u: Underspend, currency: string): CampaignIssue {
  const fmt = (m: number) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(m / 1_000_000)
    } catch {
      return `${Math.round(m / 1_000_000)} ${currency}`
    }
  }
  const pct = Math.round(u.share * 100)
  return {
    kind: 'under-budget',
    severity: 'warn',
    label: u.spentMicros === 0 ? 'Not spending' : `Spending ${pct}% of budget`,
    detail: `Spent ${fmt(u.spentMicros)} of ${fmt(u.budgetMicros * u.days)} over ${u.days} days (${fmt(u.budgetMicros)}/day${
      u.names.length > 1 ? `, shared by ${u.names.length} campaigns` : ''
    }). Something is holding it back — bids, targeting, keywords or ads.`,
  }
}

// ---------------------------------------------------------------------------
// The quick screens: ONE figure per account, ranked, for spotting the shop
// that moved. The table answers "what is everything"; these answer "who
// spent the most", "who stopped converting", "who got expensive".
// ---------------------------------------------------------------------------

export const VIEWS = [
  { id: 'overview', label: 'Overview', short: 'All' },
  { id: 'cost', label: 'Cost', short: 'Cost' },
  { id: 'conversions', label: 'Conversions', short: 'Conv.' },
  { id: 'clicks', label: 'Clicks', short: 'Clicks' },
  { id: 'costPerConv', label: 'Cost / conv.', short: '$/conv.' },
] as const
export type ViewId = (typeof VIEWS)[number]['id']
export type QuickMetric = Exclude<ViewId, 'overview'>
export function isViewId(v: unknown): v is ViewId {
  return VIEWS.some((x) => x.id === v)
}

export interface RankInput {
  id: string
  name: string
  currency: string
  total: Totals
  prior: Totals
}

export interface RankRow {
  id: string
  name: string
  currency: string
  value: number | null
  prior: number | null
  change: number | null
  /** Cost / conv. only: money spent and nothing converted — the worst cost
   *  per conversion there is, and the one a blank would hide. */
  noConvSpend: boolean
  costMicros: number
  /** 0–1, against the biggest value IN THE SAME CURRENCY: a CAD bar is never
   *  drawn against a USD one. */
  bar: number
}

export function rankAccounts(metric: QuickMetric, inputs: RankInput[]): RankRow[] {
  const rows: RankRow[] = inputs.map((x) => {
    const value = sortValue(metric, x.total, null)
    const prior = sortValue(metric, x.prior, null)
    return {
      id: x.id,
      name: x.name,
      currency: x.currency,
      value,
      prior,
      change: value != null && prior != null ? change(value, prior) : null,
      noConvSpend: metric === 'costPerConv' && x.total.conversions === 0 && x.total.costMicros > 0,
      costMicros: x.total.costMicros,
      bar: 0,
    }
  })
  const max = new Map<string, number>()
  for (const r of rows) if (r.value != null) max.set(r.currency, Math.max(max.get(r.currency) || 0, r.value))
  for (const r of rows) {
    const m = max.get(r.currency) || 0
    r.bar = r.noConvSpend ? 1 : r.value != null && m > 0 ? r.value / m : 0
  }
  const tier = (r: RankRow) => (r.noConvSpend ? 0 : r.value != null && r.value > 0 ? 1 : 2)
  return rows.sort((a, b) => {
    // Spending with nothing back leads the cost-per-conversion screen, most
    // spent first; then the figure, biggest first; empty accounts last.
    if (tier(a) !== tier(b)) return tier(a) - tier(b)
    if (tier(a) === 0) return b.costMicros - a.costMicros
    if (tier(a) === 1 && a.value !== b.value) return (b.value as number) - (a.value as number)
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  })
}

export interface TargetRaise {
  customerId: string
  accountName: string
  currency: string
  campaignId: string
  campaignName: string
  suggestedMicros: number
}

/**
 * Every campaign the Target CPA panel would raise, by the same rule as the
 * per-line mark (`targetAdvice`), so the count at the top of the page and the
 * marks under it can never disagree.
 */
export function targetRaises(data: Pick<CampaignReportData, 'accounts' | 'targets'>): TargetRaise[] {
  const out: TargetRaise[] = []
  if (!data.targets) return out
  for (const a of data.accounts) {
    for (const c of a.campaigns) {
      const advice = targetAdvice(c, data.targets[`${a.customerId}:${c.id}`])
      if (!advice) continue
      out.push({
        customerId: a.customerId,
        accountName: a.name,
        currency: a.currency,
        campaignId: c.id,
        campaignName: c.name,
        suggestedMicros: advice.suggestedMicros,
      })
    }
  }
  return out
}

/** When the Target CPA panel last read the accounts, or null if it never has. */
export function targetsReadAt(data: Pick<CampaignReportData, 'targets'>): string | null {
  const first = data.targets ? Object.values(data.targets)[0] : undefined
  return first?.builtAt ?? null
}
