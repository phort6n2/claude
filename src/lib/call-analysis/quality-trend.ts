/**
 * Is call quality getting better? Week by week, for the team and for each rep.
 *
 * THE QUESTION A SHOP OWNER ASKS is not "what did Tuesday's call score" — the
 * report on each call answers that — but "is my team getting better at the
 * phone". A single call is noisy: one tyre-kicker drags a week down, one easy
 * booking lifts it. So the trend is weekly averages over twelve weeks, and the
 * headline is the last four weeks against the four before them, which is the
 * sentence the chart exists to support.
 *
 * WHAT COUNTS. Sales calls only. A call the grader marked `info_only` — a
 * parts query, "are you open Saturday" — is not graded as a sale (see the
 * prompt), and folding it into a sales average would move the line for
 * reasons that have nothing to do with selling. They are counted and said,
 * never silently dropped.
 *
 * PER REP, ONLY FROM WHAT THE REP SAID. Every call forwards to the shop's one
 * line, so this app has no idea who picked up. The grader records the first
 * name a rep gives for themselves ("this is Mike"), and a rep gets their own
 * line once they have enough named calls to mean something. A call with no
 * name still counts for the team. Names are re-screened on READ as well as on
 * write, so a row stored before a rule existed cannot put a bad name on a
 * chart in front of somebody's boss.
 *
 * WEEKS ARE THE SHOP'S WEEKS, Monday to Sunday in their own timezone. The
 * monthly report learned this the hard way: bucketed in UTC, a call at 11pm on
 * a Sunday in Los Angeles lands in the next week, and the chart and the
 * per-call list disagree about a call that happened once.
 */

import { prisma } from '@/lib/db'
import { zoneParts } from '@/lib/tz'
import { normalizeRepName } from './rating'

export const TREND_WEEKS = 12
/** How many weeks the "better or worse" headline compares on each side. */
export const HEADLINE_WEEKS = 4
/**
 * Below this on either side, the headline says nothing. Two calls against two
 * calls is a coin toss presented as a trend, and a shop told they "dropped
 * 15 points" on that is being told something false.
 */
export const MIN_CALLS_HEADLINE = 3
/** A rep needs this many named calls in the window to get their own line. */
export const MIN_CALLS_PER_REP = 3
/**
 * Three reps plus the team is four lines, the most a validated palette keeps
 * apart for colour-blind readers on a line chart — and the most a phone can
 * show without the lines becoming a knot. A shop with more reps sees its
 * three busiest; the rest still count in the team line.
 */
export const MAX_REP_LINES = 3

export interface TrendRow {
  createdAt: Date
  score: number | null
  outcome: string | null
  analysis: unknown
}

export interface TrendCell {
  /** Mean score, rounded. Null for a week with no graded calls. */
  avg: number | null
  n: number
}

export interface TrendWeek {
  /** Monday, YYYY-MM-DD, in the shop's timezone. */
  start: string
  /** Sunday, YYYY-MM-DD. */
  end: string
  /** The current week, still in progress. */
  partial: boolean
  team: TrendCell & { booked: number }
  reps: Record<string, TrendCell>
}

export interface QualityTrend {
  weeks: TrendWeek[]
  /** Reps with enough named calls to draw, busiest first. */
  reps: string[]
  headline: {
    recent: number
    prior: number
    delta: number
    recentN: number
    priorN: number
  } | null
  /** Why there is no headline, in words for the shop. */
  headlineReason: string | null
  /** Sales calls in the window — what the chart is made of. */
  graded: number
  /** Question-only calls in the window, left out and said so. */
  questionCalls: number
  /** Graded calls where the rep never said their name. */
  unnamedCalls: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** YYYY-MM-DD for a UTC-midnight date that stands in for a local calendar day. */
const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** The Monday of the local week containing `at`, as a UTC-midnight stand-in. */
function localMonday(at: Date, timezone: string): Date {
  const { year, month, day } = zoneParts(at, timezone)
  const local = new Date(Date.UTC(year, month - 1, day))
  const sinceMonday = (local.getUTCDay() + 6) % 7
  return new Date(local.getTime() - sinceMonday * DAY_MS)
}

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null

/**
 * The trend, with no database in it — rows in, weeks out — so the rules can
 * be checked against fixtures without credentials or a clock.
 */
export function buildQualityTrend(rows: TrendRow[], timezone: string, now: Date): QualityTrend {
  const thisMonday = localMonday(now, timezone)
  const firstMonday = new Date(thisMonday.getTime() - (TREND_WEEKS - 1) * 7 * DAY_MS)

  const weeks: TrendWeek[] = []
  const scoresByWeek: number[][] = []
  const repScoresByWeek: Map<string, number[]>[] = []
  for (let w = 0; w < TREND_WEEKS; w++) {
    const start = new Date(firstMonday.getTime() + w * 7 * DAY_MS)
    weeks.push({
      start: ymd(start),
      end: ymd(new Date(start.getTime() + 6 * DAY_MS)),
      partial: w === TREND_WEEKS - 1,
      team: { avg: null, n: 0, booked: 0 },
      reps: {},
    })
    scoresByWeek.push([])
    repScoresByWeek.push(new Map())
  }

  let questionCalls = 0
  let unnamedCalls = 0
  const repTotals = new Map<string, number>()

  for (const row of rows) {
    if (row.score == null) continue
    const monday = localMonday(row.createdAt, timezone)
    const w = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS))
    if (w < 0 || w >= TREND_WEEKS) continue

    if (row.outcome === 'info_only') {
      questionCalls++
      continue
    }

    scoresByWeek[w].push(row.score)
    if (row.outcome === 'booked') weeks[w].team.booked++

    const rep = normalizeRepName((row.analysis as { rep_name?: unknown } | null)?.rep_name)
    if (!rep) {
      unnamedCalls++
      continue
    }
    const bucket = repScoresByWeek[w].get(rep) ?? []
    bucket.push(row.score)
    repScoresByWeek[w].set(rep, bucket)
    repTotals.set(rep, (repTotals.get(rep) ?? 0) + 1)
  }

  const reps = [...repTotals.entries()]
    .filter(([, n]) => n >= MIN_CALLS_PER_REP)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_REP_LINES)
    .map(([name]) => name)

  weeks.forEach((week, w) => {
    week.team.avg = mean(scoresByWeek[w])
    week.team.n = scoresByWeek[w].length
    for (const rep of reps) {
      const xs = repScoresByWeek[w].get(rep) ?? []
      week.reps[rep] = { avg: mean(xs), n: xs.length }
    }
  })

  // Pooled over the CALLS, not an average of weekly averages: a week with one
  // call must not weigh the same as a week with twelve.
  const recentScores = scoresByWeek.slice(-HEADLINE_WEEKS).flat()
  const priorScores = scoresByWeek.slice(-2 * HEADLINE_WEEKS, -HEADLINE_WEEKS).flat()
  const recent = mean(recentScores)
  const prior = mean(priorScores)

  let headline: QualityTrend['headline'] = null
  let headlineReason: string | null = null
  if (recentScores.length < MIN_CALLS_HEADLINE || priorScores.length < MIN_CALLS_HEADLINE) {
    headlineReason = `The comparison needs at least ${MIN_CALLS_HEADLINE} graded sales calls in each of the last two four-week stretches — ${recentScores.length} recent, ${priorScores.length} before that so far.`
  } else if (recent != null && prior != null) {
    headline = {
      recent,
      prior,
      delta: recent - prior,
      recentN: recentScores.length,
      priorN: priorScores.length,
    }
  }

  return {
    weeks,
    reps,
    headline,
    headlineReason,
    graded: scoresByWeek.flat().length,
    questionCalls,
    unnamedCalls,
  }
}

export async function getQualityTrend(clientId: string, timezone: string): Promise<QualityTrend> {
  const now = new Date()
  // A day of slack either side of the window: the exact edge is decided in
  // the shop's timezone by the builder, not by this query.
  const since = new Date(now.getTime() - (TREND_WEEKS * 7 + 1) * DAY_MS)
  const rows = await prisma.callAnalysis.findMany({
    where: { clientId, status: 'COMPLETE', createdAt: { gte: since } },
    select: { createdAt: true, score: true, outcome: true, analysis: true },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  })
  return buildQualityTrend(rows, timezone, now)
}
