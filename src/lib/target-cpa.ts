import { addDays, type TargetHint } from '@/lib/campaign-report'

/**
 * TARGET CPA VS GOOGLE — the rules, import-free so they can be checked against
 * saved API rows without credentials (`scripts/check-target-cpa.ts`).
 * `target-cpa-fetch.ts` reads the accounts; this file only decides.
 *
 * The problem it exists for: a Maximize Conversions campaign whose target CPA
 * is below what Google needs simply stops spending. Nothing errors, nothing in
 * the Ads interface goes red — the campaign is "Eligible", the budget sits
 * there unspent, and the shop's phone goes quiet. The fix has always been to
 * set the target just above what Google's own simulation says will spend the
 * budget, so this puts that number beside every AGMP campaign.
 *
 * ONLY "AGMP" CAMPAIGNS. Those are ours; anything else in an account belongs
 * to whoever set it up, and a suggestion against it is advice nobody asked for.
 *
 * The snapshot stores the INPUTS (campaigns, spend by day, simulation points,
 * recommendations), not these answers, and the page computes the rows when it
 * renders — so a fix to a rule here reaches every snapshot already stored
 * rather than waiting for tomorrow's run.
 */

export const AGMP_PREFIX = 'AGMP'

/** "Spends the budget" means at least this share of it, per day. */
export const FULL_SPEND_SHARE = 0.95
/** Under this share of the budget is UNDERSPENDING… */
export const UNDERSPEND_SHARE = 0.8
/** …once the campaign has run long enough for a week of spend to mean anything. */
export const MIN_ENABLED_DAYS = 7
export const SPEND_WINDOW_DAYS = 7
export const CPA_WINDOW_DAYS = 30

export function isAgmpCampaign(name: string): boolean {
  return name.startsWith(AGMP_PREFIX)
}

export interface SimPoint {
  targetMicros: number
  /** Total over the simulation's whole date range, as Google gives it. */
  costMicros: number
  conversions: number
  requiredBudgetMicros: number | null
}

export interface Simulation {
  startDate: string
  endDate: string
  points: SimPoint[]
}

export interface Recommendation {
  type: string
  /** The sub-message exactly as it arrived — read with `recommendationTarget`. */
  detail: Record<string, unknown>
}

export interface Portfolio {
  resourceName: string
  name: string
  type: string
  targetMicros: number | null
  campaignCount: number
}

export interface TcpaCampaign {
  id: string
  name: string
  channel: string | null
  biddingType: string
  /** The campaign's OWN target: maximize_conversions, or a standalone target_cpa. */
  ownTargetMicros: number | null
  portfolio: Portfolio | null
  primaryStatus: string | null
  reasons: string[]
  /** YYYY-MM-DD, the date part of `start_date_time`. */
  startDate: string | null
  budgetMicros: number | null
  budgetShared: boolean
  budgetResource: string | null
  /**
   * The days of the week its ad schedule runs on ('MONDAY'…), or null for
   * every day. Optional because snapshots stored before it was read have none.
   */
  schedule?: string[] | null
  /** date → [costMicros, conversions], last 30 complete days, days with a row only. */
  days: Record<string, [number, number]>
  simulation: Simulation | null
  recommendations: Recommendation[]
}

export interface TcpaAccount {
  customerId: string
  name: string
  clientId: string | null
  currency: string
  timeZone: string
  /** Today in the account's own zone — the windows end the day before. */
  today: string
  campaigns: TcpaCampaign[]
  /**
   * Spend per day of every campaign on a SHARED budget that is not itself an
   * AGMP campaign. A shared budget is spent by everything on it, so the
   * comparison has to count campaigns this panel otherwise ignores.
   */
  otherSharedSpend: Record<string, Record<string, number>>
  error: string | null
}

export interface TcpaSnapshot {
  builtAt: string
  accounts: TcpaAccount[]
  /** Set when the manager's account list itself could not be read. */
  error: string | null
}

export const n = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(x) ? x : 0
}
const has = (v: unknown) => v !== undefined && v !== null && v !== ''
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/* ----------------------------------------------------------------- windows */

export function spendWindow(today: string, days: number): { start: string; end: string } {
  return { start: addDays(today, -days), end: addDays(today, -1) }
}

/** Inclusive day count between two YYYY-MM-DD dates. */
export function inclusiveDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

/** Whether an ad schedule runs on this YYYY-MM-DD (dates are in the account's zone, as Google gives them). */
export function runsOn(date: string, schedule: string[] | null | undefined): boolean {
  if (!schedule || schedule.length === 0) return true
  return schedule.includes(WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()])
}

/** Days between two dates, inclusive, that the schedule runs on. */
export function scheduledDays(start: string, end: string, schedule: string[] | null | undefined): number {
  let count = 0
  for (let d = start; d <= end; d = addDays(d, 1)) if (runsOn(d, schedule)) count++
  return count
}

/**
 * Days of the window the campaign could spend on. "Enabled" is read from the
 * start date: a campaign launched on Thursday has three days of spend in a
 * seven-day window, and dividing them by seven reads a full spender as half
 * of one.
 *
 * AND FROM THE AD SCHEDULE. Collision's AGMP Lead Gen runs Monday to Friday
 * only, so its Saturday and Sunday were $0 days that counted, and it read 53%
 * of budget — underspending — when on the days it runs it spent 74%. A
 * weekday-only campaign is never going to spend at the weekend, whatever its
 * target. A pause inside the window is still NOT visible here — it would take
 * the change history to see — so a campaign paused for part of the week reads
 * low.
 */
export function enabledDays(
  startDate: string | null,
  window: { start: string; end: string },
  schedule?: string[] | null
): number {
  const from = startDate && startDate > window.start ? startDate : window.start
  return scheduledDays(from, window.end, schedule)
}

/* ------------------------------------------------------------- simulation */

export interface SimRow {
  targetMicros: number
  dailySpendMicros: number
  /** Per day, like the spend. */
  dailyConversions: number
  requiredBudgetMicros: number | null
}

/**
 * Google's points, sorted by target, with spend made DAILY. `cost_micros` on a
 * point is a total over the simulation's start-to-end range, inclusive — the
 * Oct 12–17 simulations are six days, and reading a total as a day overstates
 * every point six-fold, which makes every campaign look as if a lower target
 * would already spend it. On an ad schedule only the days it runs count, the
 * same as the spend it is compared with.
 */
export function simulationRows(sim: Simulation | null, schedule?: string[] | null): SimRow[] {
  if (!sim) return []
  const days = scheduledDays(sim.startDate, sim.endDate, schedule)
  if (days <= 0) return []
  return sim.points
    .filter((p) => p.targetMicros > 0)
    .map((p) => ({
      targetMicros: p.targetMicros,
      dailySpendMicros: p.costMicros / days,
      dailyConversions: p.conversions / days,
      requiredBudgetMicros: p.requiredBudgetMicros,
    }))
    .sort((a, b) => a.targetMicros - b.targetMicros)
}

export type FullSpend =
  | { kind: 'target'; micros: number }
  | { kind: 'already' }
  | { kind: 'above'; highestMicros: number }
  | { kind: 'none' }

/**
 * The lowest target whose simulated daily spend reaches `thresholdMicros`,
 * interpolated linearly between the two points either side of it.
 *
 * The FIRST crossing in target order, not the best-fitting one: the points are
 * Google's estimates and can wobble, and the question is the least the target
 * has to rise.
 */
export function fullSpendTarget(rows: SimRow[], thresholdMicros: number): FullSpend {
  if (rows.length === 0) return { kind: 'none' }
  if (rows[0].dailySpendMicros >= thresholdMicros) return { kind: 'already' }
  for (let i = 1; i < rows.length; i++) {
    const hi = rows[i]
    if (hi.dailySpendMicros < thresholdMicros) continue
    const lo = rows[i - 1]
    const span = hi.dailySpendMicros - lo.dailySpendMicros
    const share = span > 0 ? (thresholdMicros - lo.dailySpendMicros) / span : 1
    return { kind: 'target', micros: lo.targetMicros + share * (hi.targetMicros - lo.targetMicros) }
  }
  return { kind: 'above', highestMicros: rows[rows.length - 1].targetMicros }
}

/**
 * Up to the next value ending in .77 — the owner sets targets like 25.77,
 * 27.77, 29.77. A value that already ends in .77 stays where it is; anything
 * past it goes to the next dollar's .77, so the result is never BELOW the
 * target the simulation said is needed.
 */
export function roundUpTo77(micros: number): number {
  const whole = Math.floor(micros / 1_000_000) * 1_000_000
  let candidate = whole + 770_000
  // Half a cent of slack: 27.77 computed as 27.7700001 is 27.77, not 28.77.
  if (candidate < micros - 5_000) candidate += 1_000_000
  return candidate
}

/** With no simulation to read, a raise is one step of at most this much. */
export const STEP_SHARE = 0.15

/**
 * One step up from the current target when Google has given nothing to read:
 * the highest .77 no more than STEP_SHARE above it — rounded DOWN, unlike the
 * simulation's, because there is no number underneath this one to stay above,
 * and the point of a step is that it is small ($40.77 → $46.77, not $47.77).
 * A target so small that no .77 fits inside the step goes to the next .77.
 */
export function stepTarget(currentMicros: number): number {
  const ceiling = currentMicros * (1 + STEP_SHARE)
  let candidate = Math.floor(ceiling / 1_000_000) * 1_000_000 + 770_000
  if (candidate > ceiling + 5_000) candidate -= 1_000_000
  if (candidate <= currentMicros + 5_000) candidate = roundUpTo77(currentMicros + 10_000)
  return candidate
}

/* -------------------------------------------------------- recommendations */

/** A number held at `key` on the object or one level below it. */
function findNumber(detail: Record<string, unknown>, key: string): number | null {
  if (has(detail[key])) return n(detail[key])
  for (const v of Object.values(detail)) {
    const inner = obj(v)
    if (has(inner[key])) return n(inner[key])
  }
  return null
}

/**
 * Google's suggested target out of a recommendation's sub-message. GAQL
 * REFUSES the leaf fields (checked live, v25: UNRECOGNIZED_FIELD on every one),
 * so the whole sub-message is selected and read here, which is also why it is
 * stored as it arrived: no account had one of these five types on the day
 * this was written, so the shape is the documented one, and a reader fix
 * against a stored snapshot costs a recompute rather than a lost day.
 *
 * - raise_target_cpa_bid_too_low: multiplier × average_target_cpa_micros
 * - raise_target_cpa (target_adjustment): multiplier × current_average_target_micros
 * - set_target_cpa / forecasting_set_target_cpa / target_cpa_opt_in:
 *   recommended_target_cpa_micros
 */
export function recommendationTarget(rec: Recommendation): number | null {
  const d = rec.detail
  const multiplier = findNumber(d, 'recommendedTargetMultiplier')
  const base = findNumber(d, 'averageTargetCpaMicros') ?? findNumber(d, 'currentAverageTargetMicros')
  if (multiplier != null && base != null && multiplier > 0 && base > 0) return multiplier * base
  const direct = findNumber(d, 'recommendedTargetCpaMicros') ?? findNumber(d, 'targetCpaMicros')
  return direct != null && direct > 0 ? direct : null
}

export function googleSuggestion(recs: Recommendation[]): { type: string; micros: number } | null {
  for (const r of recs) {
    const micros = recommendationTarget(r)
    if (micros != null) return { type: r.type, micros }
  }
  return null
}

/* ------------------------------------------------------------------- rows */

export type Bidding = 'MAX_CONV' | 'TARGET_CPA' | 'MAX_CLICKS' | 'OTHER'

export function biddingKind(type: string): Bidding {
  if (type === 'MAXIMIZE_CONVERSIONS') return 'MAX_CONV'
  if (type === 'TARGET_CPA') return 'TARGET_CPA'
  if (type === 'TARGET_SPEND') return 'MAX_CLICKS'
  return 'OTHER'
}

export function biddingLabel(type: string): string {
  const k = biddingKind(type)
  if (k === 'MAX_CONV') return 'Max Conversions'
  if (k === 'TARGET_CPA') return 'Target CPA'
  if (k === 'MAX_CLICKS') return 'Max Clicks'
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export type Flag = 'bid-limited' | 'budget-limited' | 'learning'

export const FLAG_LABELS: Record<Flag, string> = {
  'bid-limited': 'Limited by bid strategy',
  'budget-limited': 'Limited by budget',
  learning: 'Learning',
}

export function statusFlags(c: Pick<TcpaCampaign, 'primaryStatus' | 'reasons'>): Flag[] {
  const flags: Flag[] = []
  if (c.reasons.includes('BIDDING_STRATEGY_LIMITED') || c.reasons.includes('BIDDING_STRATEGY_CONSTRAINED')) {
    flags.push('bid-limited')
  }
  if (c.reasons.includes('BUDGET_CONSTRAINED')) flags.push('budget-limited')
  if (c.primaryStatus === 'LEARNING' || c.reasons.includes('BIDDING_STRATEGY_LEARNING')) flags.push('learning')
  return flags
}

export interface TcpaRow {
  key: string
  customerId: string
  accountName: string
  clientId: string | null
  currency: string
  today: string
  campaignId: string
  campaignName: string
  channel: string | null
  biddingType: string
  bidding: Bidding
  /** The target that applies: the portfolio's when there is one, else the campaign's. */
  targetMicros: number | null
  portfolio: Portfolio | null
  budgetMicros: number | null
  budgetShared: boolean
  /** On a shared budget: the campaigns' combined spend, ours and anyone else's. */
  avgDailySpendMicros: number | null
  spendPct: number | null
  enabledDays: number
  window: { start: string; end: string }
  /** date → spend, for the expanded view: the seven days behind the average. `off` = not on its ad schedule. */
  spendByDay: Array<{ date: string; costMicros: number; off: boolean }>
  /** The ad schedule's days, or null for every day. */
  schedule: string[] | null
  fullSpend: FullSpend
  /** What the simulation's spend is compared with, per day. */
  thresholdMicros: number | null
  suggestedMicros: number | null
  /**
   * Where the suggestion came from: Google's simulation, or — when there is
   * no simulation to read — one STEP_SHARE step up from the current target.
   */
  suggestionSource: 'simulation' | 'step' | null
  google: { type: string; micros: number } | null
  cpa30Micros: number | null
  conversions30: number
  cost30Micros: number
  flags: Flag[]
  underspending: boolean
  simulation: { startDate: string; endDate: string; rows: SimRow[] } | null
  /** Why a row has no suggestion, when it has none. */
  note: string | null
}

function sumSpend(days: Record<string, number | [number, number]>, w: { start: string; end: string }): number {
  let total = 0
  for (const [date, v] of Object.entries(days)) {
    if (date < w.start || date > w.end) continue
    total += Array.isArray(v) ? v[0] : v
  }
  return total
}

function listDays(w: { start: string; end: string }): string[] {
  const out: string[] = []
  for (let d = w.start; d <= w.end; d = addDays(d, 1)) out.push(d)
  return out
}

export function buildRows(snapshot: TcpaSnapshot): TcpaRow[] {
  const rows: TcpaRow[] = []
  for (const a of snapshot.accounts) {
    const w7 = spendWindow(a.today, SPEND_WINDOW_DAYS)
    const w30 = spendWindow(a.today, CPA_WINDOW_DAYS)

    // Shared budgets: every AGMP campaign on one, plus whatever else spends it.
    const sharedGroups = new Map<string, TcpaCampaign[]>()
    for (const c of a.campaigns) {
      if (!c.budgetShared || !c.budgetResource) continue
      const list = sharedGroups.get(c.budgetResource) || []
      list.push(c)
      sharedGroups.set(c.budgetResource, list)
    }

    for (const c of a.campaigns) {
      const bidding = biddingKind(c.biddingType)
      const targetMicros =
        bidding === 'MAX_CLICKS' ? null : c.portfolio ? c.portfolio.targetMicros : c.ownTargetMicros

      // Spend and the days it is divided by. For a shared budget it is the
      // budget's spend — every campaign on it — over the longest-running one's
      // days, since the budget has existed at least that long.
      const ownSpend7 = sumSpend(c.days, w7)
      const schedule = c.schedule && c.schedule.length > 0 ? c.schedule : null
      let spend7 = ownSpend7
      let days7 = enabledDays(c.startDate, w7, schedule)
      if (c.budgetShared && c.budgetResource) {
        const group = sharedGroups.get(c.budgetResource) || [c]
        const othersSpend = sumSpend(a.otherSharedSpend[c.budgetResource] || {}, w7)
        spend7 = group.reduce((t, g) => t + sumSpend(g.days, w7), 0) + othersSpend
        // Spend from a campaign outside the panel proves the budget was live
        // all week, on whatever schedule that campaign keeps; otherwise it is
        // as old as its oldest AGMP campaign and runs on the days any of them do.
        const starts = group.map((g) => g.startDate).filter(Boolean) as string[]
        const unscheduled = othersSpend > 0 || group.some((g) => !g.schedule || g.schedule.length === 0)
        const union = unscheduled ? null : [...new Set(group.flatMap((g) => g.schedule || []))]
        days7 = enabledDays(othersSpend > 0 ? null : (starts.sort()[0] ?? null), w7, union)
      }
      const avgDaily = days7 > 0 ? spend7 / days7 : null
      const othersDaily = days7 > 0 ? (spend7 - ownSpend7) / days7 : 0
      const spendPct = avgDaily != null && c.budgetMicros ? avgDaily / c.budgetMicros : null

      const simRows = simulationRows(c.simulation, schedule)
      // The simulation is THIS campaign alone. On a shared budget it only has
      // to fill what the others leave, so the threshold is the remainder.
      const thresholdMicros =
        c.budgetMicros != null ? Math.max(0, FULL_SPEND_SHARE * c.budgetMicros - othersDaily) : null

      const lifetimeDays = c.startDate ? inclusiveDays(c.startDate, w7.end) : MIN_ENABLED_DAYS
      const underspending =
        bidding === 'MAX_CONV' && spendPct != null && spendPct < UNDERSPEND_SHARE && lifetimeDays >= MIN_ENABLED_DAYS
      const flags = statusFlags(c)

      let fullSpend: FullSpend = { kind: 'none' }
      let suggestedMicros: number | null = null
      let suggestionSource: TcpaRow['suggestionSource'] = null
      let note: string | null = null
      if (bidding === 'MAX_CLICKS') {
        note = 'Max Clicks has no target CPA.'
      } else if (thresholdMicros == null) {
        note = 'No daily budget to compare with.'
      } else {
        fullSpend = fullSpendTarget(simRows, thresholdMicros)
        if (fullSpend.kind === 'target') {
          suggestedMicros = roundUpTo77(fullSpend.micros)
          suggestionSource = 'simulation'
        } else if ((fullSpend.kind === 'none' || fullSpend.kind === 'above') && underspending && targetMicros != null) {
          // NOTHING TO READ, so ONE SMALL STEP — never a guess at the answer.
          // Not when Google itself says the BUDGET is what limits it: then the
          // target is not holding it back, and a higher one only raises the
          // cost per lead on the days it already spends.
          if (flags.includes('budget-limited')) {
            note = 'No suggestion: Google reports this campaign limited by budget, so a higher target is not what it is missing.'
          } else {
            suggestedMicros = stepTarget(targetMicros)
            suggestionSource = 'step'
          }
        }
      }

      const cost30 = sumSpend(c.days, w30)
      const conv30 = Object.entries(c.days)
        .filter(([d]) => d >= w30.start && d <= w30.end)
        .reduce((t, [, v]) => t + v[1], 0)

      rows.push({
        key: `${a.customerId}:${c.id}`,
        customerId: a.customerId,
        accountName: a.name,
        clientId: a.clientId,
        currency: a.currency,
        today: a.today,
        campaignId: c.id,
        campaignName: c.name,
        channel: c.channel,
        biddingType: c.biddingType,
        bidding,
        targetMicros,
        portfolio: c.portfolio,
        budgetMicros: c.budgetMicros,
        budgetShared: c.budgetShared,
        avgDailySpendMicros: avgDaily,
        spendPct,
        enabledDays: days7,
        window: w7,
        spendByDay: listDays(w7).map((date) => ({ date, costMicros: c.days[date]?.[0] ?? 0, off: !runsOn(date, schedule) })),
        schedule,
        fullSpend,
        thresholdMicros,
        suggestedMicros,
        suggestionSource,
        google: bidding === 'MAX_CLICKS' ? null : googleSuggestion(c.recommendations),
        cpa30Micros: conv30 > 0 ? cost30 / conv30 : null,
        conversions30: conv30,
        cost30Micros: cost30,
        flags,
        underspending,
        simulation: c.simulation ? { startDate: c.simulation.startDate, endDate: c.simulation.endDate, rows: simRows } : null,
        note,
      })
    }
  }
  return sortTcpaRows(rows)
}

/** UNDERSPENDING first, then by share of budget spent, lowest first; blanks last. */
export function sortTcpaRows(rows: TcpaRow[]): TcpaRow[] {
  return [...rows].sort((x, y) => {
    if (x.underspending !== y.underspending) return x.underspending ? -1 : 1
    const a = x.spendPct
    const b = y.spendPct
    if (a == null && b != null) return 1
    if (b == null && a != null) return -1
    if (a != null && b != null && a !== b) return a - b
    return (
      x.accountName.localeCompare(y.accountName, 'en', { sensitivity: 'base' }) ||
      x.campaignName.localeCompare(y.campaignName, 'en', { sensitivity: 'base' })
    )
  })
}

/* ---------------------------------------------------------------- apply */

/**
 * Whether a suggested target may be applied to this row, and if not, why.
 * The route asks this against a FRESH read before it sends anything; the page
 * asks it to decide whether to show the button.
 */
export function applyRefusal(
  row: Pick<TcpaRow, 'campaignName' | 'bidding' | 'suggestedMicros' | 'targetMicros' | 'portfolio' | 'underspending'>
): string | null {
  if (!isAgmpCampaign(row.campaignName)) return 'Only AGMP campaigns can be changed here.'
  if (row.bidding !== 'MAX_CONV') return 'Only Maximize Conversions campaigns can be changed here.'
  if (row.portfolio && row.portfolio.type !== 'MAXIMIZE_CONVERSIONS') {
    return 'The shared bid strategy is not Maximize Conversions.'
  }
  if (row.suggestedMicros == null) return 'There is no suggested target for this campaign.'
  if (row.targetMicros != null && Math.abs(row.targetMicros - row.suggestedMicros) < 5_000) {
    return 'The target is already the suggested one.'
  }
  // A campaign already spending its budget does not need a higher target:
  // Google's simulation is an estimate over an earlier week, and on live data
  // it asked for $61.77 on a campaign spending 100% at $38.77. Raising that
  // buys nothing but a higher cost per lead.
  if (!row.underspending) return 'It is not underspending, so the target is left alone.'
  // Underspending, yet Google says a LOWER target would spend the budget: the
  // target is not what is holding it back, and lowering it spends less.
  if (row.targetMicros != null && row.suggestedMicros < row.targetMicros) {
    return 'The suggestion is below the current target — the target is not what is holding this campaign back.'
  }
  return null
}

/** The suggestion is below the target that is already set — shown, never applied. */
export function suggestionBelowTarget(row: Pick<TcpaRow, 'suggestedMicros' | 'targetMicros'>): boolean {
  return row.suggestedMicros != null && row.targetMicros != null && row.suggestedMicros < row.targetMicros - 5_000
}

/** Per campaign, what the campaign table shows from this panel (`targetAdvice`). */
export function targetHints(snapshot: TcpaSnapshot): Record<string, TargetHint> {
  const out: Record<string, TargetHint> = {}
  for (const r of buildRows(snapshot)) {
    out[r.key] = {
      raise: applyRefusal(r) == null,
      suggestedMicros: r.suggestedMicros,
      ...(r.suggestionSource === 'step' ? { step: true } : {}),
      spendPct: r.spendPct,
      snapshotTargetMicros: r.targetMicros,
      portfolio: !!r.portfolio,
      ...(r.portfolio ? { portfolioName: r.portfolio.name, portfolioCampaigns: r.portfolio.campaignCount } : {}),
      builtAt: snapshot.builtAt,
    }
  }
  return out
}
