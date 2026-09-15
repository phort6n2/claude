/**
 * Calendar windows in a SHOP'S OWN timezone, as UTC instants.
 *
 * WHY THIS IS SHARED AND NOT COPIED. The day window was written inside
 * `lead-dedup.ts`, where it decides whether two enquiries are the same day and
 * therefore the same job. The monthly report needs the same arithmetic for a
 * month, and timezone maths written twice is timezone maths that drifts —
 * which here would mean the report counting a lead into a month the dedup put
 * in the other one. So the primitive moved here and dedup imports it; nothing
 * about its behaviour changed.
 *
 * WHY IT MATTERS FOR A REPORT AT ALL. "Send it on the first of the month" has
 * no meaning until somebody says whose first. A cron firing at 00:00 UTC on
 * the 1st is 5pm on the 31st in California: a report built then is missing the
 * last evening of the month it claims to cover, every month, for every Pacific
 * client — and nothing about the output would look wrong.
 */

/**
 * The zone's UTC offset in whole hours at `at`.
 *
 * Read from `Intl` rather than a table, so DST is handled by the platform: the
 * same zone is -8 in January and -7 in July, and a report for a month
 * containing a clock change must use the offset in force, not an average.
 *
 * Whole hours only, which covers every zone this platform serves (the US and
 * Canada). A half-hour zone (India, Newfoundland) would land 30 minutes out,
 * so it is `zonedTimeToUtc` that would need the minutes, not this — noted
 * because the failure would be a handful of leads either side of midnight
 * landing in the wrong day, which reads as nothing at all.
 */
export function zoneOffsetHours(at: Date, timezone: string): number {
  const offsetStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).format(at)
  const offsetMatch = offsetStr.match(/GMT([+-]?\d+)/)
  return offsetMatch ? parseInt(offsetMatch[1], 10) : 0
}

/**
 * A local wall-clock time in `timezone`, as the UTC instant it happens at.
 *
 * TWO PASSES, AND THE SECOND ONE IS NOT OPTIONAL. The offset has to be read
 * at an instant, but the instant is what we are trying to find — so the first
 * read can land on the wrong side of a clock change and give an answer an hour
 * out. Reading it again at the candidate instant settles it.
 *
 * FOUND BY THE CHECK, on the one case a simpler version cannot get right. US
 * clocks go back at 2am on 1 November, so midnight on the 1st is still PDT
 * while midday on the 1st is already PST. A single probe taken at midday —
 * which is what this function replaced — read PST and moved the start of
 * November an hour late, making the month 720 hours instead of 721. The hour
 * it dropped is a real hour of a real month.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
  const firstGuess = zoneOffsetHours(new Date(naive), timezone)
  const candidate = naive - firstGuess * 60 * 60 * 1000
  const settled = zoneOffsetHours(new Date(candidate), timezone)
  return new Date(settled === firstGuess ? candidate : naive - settled * 60 * 60 * 1000)
}

/** The local Y/M/D of `at` in `timezone`. */
export function zoneParts(
  at: Date,
  timezone: string
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
  }
}

/**
 * Start and end of the calendar DAY containing `at` in `timezone`, as UTC.
 *
 * Moved here from `lead-dedup.ts` and CORRECTED on the way — see the note
 * inside. `end` stays inclusive to the millisecond, which is what its
 * callers' `lte` comparisons expect and the opposite of `monthWindow`.
 */
export function dayWindow(at: Date, timezone: string): { start: Date; end: Date } {
  const { year, month, day } = zoneParts(at, timezone)
  const start = zonedTimeToUtc(year, month, day, timezone)
  /* THE END IS THE NEXT LOCAL MIDNIGHT, not start + 24h. On the two days a
     year the clocks move, the local day is 23 or 25 hours long — and the old
     version took the offset at `at` rather than at midnight, so on the spring
     forward day the window opened an hour early and swept in the last hour of
     the previous local day. Twice a year, two enquiries either side of
     midnight could read as the same day, which in lead-dedup means one job
     instead of two. */
  const next = zonedTimeToUtc(year, month, day + 1, timezone)
  return { start, end: new Date(next.getTime() - 1) }
}

/**
 * Start (inclusive) and end (EXCLUSIVE) of a calendar month in `timezone`.
 *
 * Exclusive end on purpose, unlike `dayWindow`: a month window is used with
 * `lt`, so the boundary instant belongs to the next month and cannot be
 * counted twice. A window that overlapped by a millisecond would put a lead
 * created exactly at midnight into both months, and the two reports would
 * disagree by one about a lead that exists once.
 *
 * `month` is 1-12, as a person says it, not 0-11 as `Date` does. The
 * off-by-one that costs is the silent one: `monthWindow(2026, 0)` reading as
 * January in one caller and December in another.
 *
 * Each edge is resolved on its own, which is the DST case: March opens at
 * -08:00 and closes at -07:00 in Los Angeles, so one offset reused for both
 * ends makes the month an hour too long or too short, and the hour it borrows
 * or loses is a real hour with real leads in it.
 */
export function monthWindow(
  year: number,
  month: number,
  timezone: string
): { start: Date; end: Date } {
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return {
    start: zonedTimeToUtc(year, month, 1, timezone),
    end: zonedTimeToUtc(nextYear, nextMonth, 1, timezone),
  }
}

/**
 * The month BEFORE the one containing `at`, in `timezone` — what a report
 * built on the 1st is about.
 *
 * Derived from the shop's own calendar rather than the server's: a cron firing
 * at 13:00 UTC on 1 March is still 1 March everywhere this platform serves, so
 * the answer is February for all of them — but the same code run at 02:00 UTC
 * would be 28 February in Los Angeles, and asking for "last month" there means
 * January. Reading the zone makes that correct instead of lucky.
 */
export function previousMonthOf(at: Date, timezone: string): { year: number; month: number } {
  const { year, month } = zoneParts(at, timezone)
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/** "February 2026", for a heading or a subject line. */
export function monthLabel(year: number, month: number): string {
  return new Date(`${year}-${String(month).padStart(2, '0')}-15T12:00:00Z`).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  )
}
