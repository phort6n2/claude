import { prisma } from '@/lib/db'
import {
  isMissedCall,
  hourLabel,
  weekdayLabel,
  MISSED_CALL_STATUSES,
  type CallInsight,
  type CallPatterns,
  type MissedCall,
} from '@/lib/call-display'

/**
 * What this shop's phone actually does.
 *
 * TWO QUESTIONS, ONE SOURCE. Every call through a tracking number is already
 * stored as a Lead with `callStatus` and `callDurationSecs` — so the two
 * things a shop owner most wants from a phone system are arithmetic on rows
 * this platform has held all along and never showed anybody:
 *
 *   1. WHICH CALLS WENT UNANSWERED, with the number, so they can ring back.
 *   2. WHEN THE PHONE RINGS, by hour and by weekday, so they can staff for it.
 *
 * The second is the one no competitor can give them: it needs every call to
 * a tracked line over months, which is exactly what the call-tracking numbers
 * have been quietly accumulating.
 *
 * NOTHING IS ESTIMATED. In particular a missed call is never multiplied by an
 * average job value to produce a "lost revenue" figure — that number would be
 * modelled, and the plain count is more persuasive anyway. Same rule as the
 * monthly report: their own facts, no grossing up.
 *
 * THE SHOP'S OWN CLOCK. Every hour and weekday here is bucketed in
 * `Client.timezone`, not UTC and not the server's. "Most of your calls come
 * at 7am" is worthless if it is 7am somewhere else.
 */

/**
 * The hour and weekday a Date falls in, for a given timezone.
 *
 * Intl rather than an offset: an offset is wrong twice a year, and "our calls
 * shifted an hour in November" is the kind of nonsense that makes a shop stop
 * trusting a dashboard.
 */
function localParts(date: Date, timeZone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date)
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const dayPart = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    // 'hour12: false' can render midnight as 24 rather than 0.
    hour: Number(hourPart) % 24,
    weekday: Math.max(0, days.indexOf(dayPart)),
  }
}

/**
 * The longest run of consecutive hours holding the busiest share of calls.
 *
 * A SINGLE PEAK HOUR IS NOISE at these volumes — fifteen shops, a few calls a
 * day. A window is what somebody can actually act on ("open at seven"), and
 * it survives one unusual Tuesday.
 */
function busiestWindow(byHour: number[]): string | null {
  const total = byHour.reduce((a, b) => a + b, 0)
  if (total < 10) return null
  let best = { start: 0, sum: 0 }
  const WIDTH = 3
  for (let start = 0; start <= 24 - WIDTH; start++) {
    const sum = byHour.slice(start, start + WIDTH).reduce((a, b) => a + b, 0)
    if (sum > best.sum) best = { start, sum }
  }
  // Not worth saying when it is barely above an even spread.
  if (best.sum / total < (WIDTH / 24) * 1.5) return null
  return `${hourLabel(best.start)} to ${hourLabel(best.start + WIDTH)}`
}

export { hourLabel, weekdayLabel }

/** How far back the patterns look. Long enough to be a pattern. */
export const PATTERN_DAYS = 180

export async function getCallInsight(clientId: string): Promise<CallInsight | null> {
  const client = await prisma.client
    .findUnique({ where: { id: clientId }, select: { timezone: true } })
    .catch(() => null)
  const timezone = client?.timezone || 'America/Denver'

  const since = new Date(Date.now() - PATTERN_DAYS * 86400000)
  const calls = await prisma.lead
    .findMany({
      where: {
        clientId,
        // Only calls: a form submission has no callStatus and no hour worth
        // charting — somebody filling in a form at 2am is not a staffing fact.
        source: 'PHONE',
        createdAt: { gte: since },
      },
      select: {
        id: true,
        phone: true,
        createdAt: true,
        callStatus: true,
        status: true,
        firstTouchedAt: true,
        trackingNumber: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => [])

  if (!calls.length) return null

  const byHour = new Array(24).fill(0)
  const byWeekday = new Array(7).fill(0)
  const missedByHour = new Array(24).fill(0)
  let missedCalls = 0
  let answeredCalls = 0

  for (const call of calls) {
    const { hour, weekday } = localParts(call.createdAt, timezone)
    byHour[hour] += 1
    byWeekday[weekday] += 1
    if (isMissedCall(call.callStatus)) {
      missedCalls += 1
      missedByHour[hour] += 1
    } else if (call.callStatus) {
      answeredCalls += 1
    }
    // A call still ringing when the page loads has no status yet and counts
    // in neither — it is not yet a fact about anything.
  }

  const decided = missedCalls + answeredCalls
  /* THE WORST HOUR NEEDS ENOUGH CALLS TO MEAN SOMETHING. One missed call in
     an hour that has only ever had one is a 100% miss rate and a lie. */
  let worstHour: CallPatterns['worstHour'] = null
  for (let hour = 0; hour < 24; hour++) {
    if (byHour[hour] < 5 || !missedByHour[hour]) continue
    const rate = missedByHour[hour] / byHour[hour]
    const bestRate = worstHour ? worstHour.missed / worstHour.total : 0
    if (rate > bestRate) worstHour = { hour, missed: missedByHour[hour], total: byHour[hour] }
  }

  const recentMissed: MissedCall[] = calls
    .filter((c) => isMissedCall(c.callStatus))
    .slice(0, 25)
    .map((c) => ({
      id: c.id,
      phone: c.phone || null,
      at: c.createdAt.toISOString(),
      // Rung back, or otherwise dealt with. `firstTouchedAt` is stamped on the
      // first move off NEW, which is exactly "somebody picked this up".
      handled: !!c.firstTouchedAt || c.status !== 'NEW',
      line: c.trackingNumber || null,
    }))

  const firstAt = calls[calls.length - 1]?.createdAt ?? since
  const daysCovered = Math.max(
    1,
    Math.round((Date.now() - Math.max(firstAt.getTime(), since.getTime())) / 86400000)
  )

  return {
    timezone,
    recentMissed,
    patterns: {
      byHour,
      byWeekday,
      totalCalls: calls.length,
      missedCalls,
      answeredCalls,
      missedRate: decided ? Math.round((missedCalls / decided) * 1000) / 10 : 0,
      busiestWindow: busiestWindow(byHour),
      worstHour,
      daysCovered,
    },
  }
}

/**
 * Answered calls, for the home tile.
 *
 * A COUNT, not getCallInsight — that one loads 180 days of rows to build the
 * charts, which is far too much work for one number on a screen that already
 * runs a dozen queries.
 */
export async function countAnsweredCalls(clientId: string, days = 90): Promise<number> {
  return prisma.lead
    .count({
      where: {
        clientId,
        source: 'PHONE',
        // Not "not missed": a call still ringing has no status yet and is not
        // an answered one.
        callStatus: { notIn: [...MISSED_CALL_STATUSES], not: null },
        createdAt: { gte: new Date(Date.now() - days * 86400000) },
      },
    })
    .catch(() => 0)
}

/** Just the count, for the home screen. Cheap enough to run on every load. */
export async function countRecentMissed(clientId: string, days = 7): Promise<number> {
  return prisma.lead
    .count({
      where: {
        clientId,
        source: 'PHONE',
        callStatus: { in: [...MISSED_CALL_STATUSES] },
        createdAt: { gte: new Date(Date.now() - days * 86400000) },
      },
    })
    .catch(() => 0)
}

/** How far back the "Ring these back" list and the home banner look. */
export const RING_BACK_DAYS = 7

export interface RingBackCall {
  /** The call's own row. */
  id: string
  /**
   * The lead to open and to mark done — the CANONICAL row. A second call
   * from the same person the same day is a duplicate row whose own status
   * stays NEW for ever, because status lives on the canonical; judging or
   * updating the duplicate would show a shop a call they already dealt with,
   * and "Done" would change nothing they can see.
   */
  leadId: string
  phone: string | null
  at: string
  callStatus: string
  durationSecs: number | null
}

/**
 * The missed calls somebody still needs to ring back — the list pinned at the
 * top of Leads, and the number on the home banner. ONE RULE for both, so the
 * banner can never say three while the list shows one.
 *
 * It lived on the Calls page, mixed in with charts of when the phone rings —
 * an action on a page of analysis, which is why it moved: "who do I call
 * back?" is the question Leads answers. Three conditions, each one a way the
 * old list overstated:
 *
 * - MISSED, in the last RING_BACK_DAYS. The old list reached back 180 days
 *   while the banner that linked to it said "last 7 days".
 * - NOT HANDLED: the canonical lead has moved off NEW or been touched.
 * - NOT SINCE REACHED: no LATER answered call from the same number. Someone
 *   whose first call rang out and whose second got through has been spoken
 *   to — the same "latest call wins" rule the lead badges use.
 */
export async function getCallsToRingBack(clientId: string): Promise<RingBackCall[]> {
  const since = new Date(Date.now() - RING_BACK_DAYS * 86400000)
  const calls = await prisma.lead
    .findMany({
      where: { clientId, source: 'PHONE', createdAt: { gte: since } },
      select: {
        id: true,
        phone: true,
        createdAt: true,
        callStatus: true,
        callDurationSecs: true,
        status: true,
        firstTouchedAt: true,
        duplicateOfLeadId: true,
        duplicateOf: { select: { status: true, firstTouchedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    .catch(() => [])

  return selectCallsToRingBack(calls)
}

export interface RingBackRow {
  id: string
  phone: string | null
  createdAt: Date
  callStatus: string | null
  callDurationSecs: number | null
  status: string
  firstTouchedAt: Date | null
  duplicateOfLeadId: string | null
  duplicateOf: { status: string; firstTouchedAt: Date | null } | null
}

/** The rule, with no database in it — see getCallsToRingBack. Rows newest first. */
export function selectCallsToRingBack(calls: RingBackRow[]): RingBackCall[] {
  // The latest ANSWERED call per number, to rule out people already reached.
  const lastAnswered = new Map<string, number>()
  for (const c of calls) {
    if (!c.phone || !c.callStatus || isMissedCall(c.callStatus)) continue
    const t = c.createdAt.getTime()
    if (t > (lastAnswered.get(c.phone) ?? 0)) lastAnswered.set(c.phone, t)
  }

  const out: RingBackCall[] = []
  const seen = new Set<string>()
  for (const c of calls) {
    if (!isMissedCall(c.callStatus)) continue
    const owner = c.duplicateOf ?? c
    if (owner.firstTouchedAt || owner.status !== 'NEW') continue
    if (c.phone && (lastAnswered.get(c.phone) ?? 0) > c.createdAt.getTime()) continue
    // One row per person: three missed calls from one number are one call
    // back, shown at its most recent attempt (the list is newest first).
    const key = c.phone || c.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: c.id,
      leadId: c.duplicateOfLeadId ?? c.id,
      phone: c.phone || null,
      at: c.createdAt.toISOString(),
      callStatus: c.callStatus as string,
      durationSecs: c.callDurationSecs,
    })
  }
  return out
}
