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
