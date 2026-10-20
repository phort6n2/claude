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
  days: Record<string, DayMetrics>
}

export interface ReportAccount {
  customerId: string
  /** The client's name when the account is bound to one, else Google's. */
  name: string
  clientId: string | null
  currency: string
  timeZone: string
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
  kind: 'not-serving' | 'limited' | 'no-impressions' | 'no-conversions'
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

/* Local Services campaigns are Google's own, system-generated and managed
   outside the campaign screens; the API does not report their delivery the
   way it does a search campaign's. A real account's read ELIGIBLE with no
   impression rows in sixty days, and "No impressions" on it would be a mark
   nobody can act on here. Silence beats a confident mark that may be wrong. */
const NO_IMPRESSION_DATA = new Set(['LOCAL_SERVICES'])

export function campaignIssues(
  c: ReportCampaign,
  t: Totals,
  range: RangeId
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
  } else if (c.primaryStatus === 'LIMITED' && reasons.length > 0) {
    issues.push({
      kind: 'limited',
      severity: 'warn',
      label: why,
      detail: `Google marks this campaign Limited: ${why}.`,
    })
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
      detail: `Spent ${cost.toFixed(2)} in this period with no conversions recorded.`,
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

/** An account with nothing enabled and nothing spent in the whole history is
 *  not a row — it is one line at the foot of the table. */
export function isIdle(a: ReportAccount): boolean {
  if (a.error) return false
  return !a.campaigns.some(
    (c) => isRunning(c) || Object.values(c.days).some((m) => m[0] > 0 || m[1] > 0)
  )
}

/** Percentage change, or null where there is nothing to compare against. */
export function change(now: number, before: number): number | null {
  if (before === 0) return null
  return (now - before) / before
}
