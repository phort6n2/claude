/**
 * Calendar windows in a shop's own timezone.
 *
 * Run: npx tsx scripts/check-tz-windows.ts
 *
 * WHY THIS IS WORTH A CHECK. Two callers depend on this arithmetic and they
 * fail in opposite, silent ways. `lead-dedup.ts` uses the DAY window to decide
 * whether two enquiries are the same job — an hour out at the boundary merges
 * two real jobs into one, or splits one into two. The monthly report uses the
 * MONTH window to decide which month a lead belongs to, and an hour out there
 * moves revenue between two reports that have already been emailed.
 *
 * Neither would look wrong. Both produce plausible numbers.
 *
 * THE DST CASE IS THE POINT. March in Los Angeles opens at -08:00 and closes
 * at -07:00, so a window built with one offset for both ends is an hour too
 * long or too short, and that hour is a real hour with real leads in it.
 */

import { dayWindow, monthLabel, monthWindow, previousMonthOf, zoneOffsetHours } from '../src/lib/tz'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const iso = (d: Date) => d.toISOString()

function expectEqual(label: string, got: string, want: string) {
  if (got === want) pass(`${label}: ${got}`)
  else fail(`${label}\n      got:  ${got}\n      want: ${want}`)
}

const LA = 'America/Los_Angeles'
const NY = 'America/New_York'
const PHX = 'America/Phoenix' // No DST, ever — the control.

console.log('\nOffsets, read from the platform rather than a table')
{
  expectEqual('LA in January', String(zoneOffsetHours(new Date('2026-01-15T20:00:00Z'), LA)), '-8')
  expectEqual('LA in July', String(zoneOffsetHours(new Date('2026-07-15T20:00:00Z'), LA)), '-7')
  // Arizona does not move, which is why STATE_TIMEZONES lists it separately.
  expectEqual('Phoenix in January', String(zoneOffsetHours(new Date('2026-01-15T20:00:00Z'), PHX)), '-7')
  expectEqual('Phoenix in July', String(zoneOffsetHours(new Date('2026-07-15T20:00:00Z'), PHX)), '-7')
}

console.log('\nMonth windows')
{
  // February 2026 in New York: 1 Feb 00:00 EST is 05:00 UTC.
  const feb = monthWindow(2026, 2, NY)
  expectEqual('Feb 2026 NY starts', iso(feb.start), '2026-02-01T05:00:00.000Z')
  expectEqual('Feb 2026 NY ends', iso(feb.end), '2026-03-01T05:00:00.000Z')

  /* THE DST MONTH. US clocks go forward on 8 March 2026, so March opens at
     -08:00 and closes at -07:00 in Los Angeles. The window must be 30 days
     and 23 hours, not 31 days — an offset taken once and reused makes it 31,
     which silently annexes the first hour of April. */
  const mar = monthWindow(2026, 3, LA)
  expectEqual('Mar 2026 LA starts (PST)', iso(mar.start), '2026-03-01T08:00:00.000Z')
  expectEqual('Mar 2026 LA ends (PDT)', iso(mar.end), '2026-04-01T07:00:00.000Z')
  const hours = (mar.end.getTime() - mar.start.getTime()) / 3_600_000
  if (hours === 31 * 24 - 1) pass(`March is ${hours} hours — the lost hour is accounted for`)
  else fail(`March came out ${hours} hours; expected ${31 * 24 - 1}`)

  // And the November month gains one.
  const nov = monthWindow(2026, 11, LA)
  const novHours = (nov.end.getTime() - nov.start.getTime()) / 3_600_000
  if (novHours === 30 * 24 + 1) pass(`November is ${novHours} hours — the extra hour is counted`)
  else fail(`November came out ${novHours} hours; expected ${30 * 24 + 1}`)

  // Phoenix never moves, so its months are exact.
  const marPhx = monthWindow(2026, 3, PHX)
  const phxHours = (marPhx.end.getTime() - marPhx.start.getTime()) / 3_600_000
  if (phxHours === 31 * 24) pass('Phoenix March is exactly 31 days')
  else fail(`Phoenix March came out ${phxHours} hours`)

  // December rolls the year, in both directions.
  const dec = monthWindow(2026, 12, NY)
  expectEqual('Dec 2026 NY ends in 2027', iso(dec.end), '2027-01-01T05:00:00.000Z')
}

console.log('\nThe end is EXCLUSIVE, so nothing is counted twice')
{
  const feb = monthWindow(2026, 2, NY)
  const mar = monthWindow(2026, 3, NY)
  if (feb.end.getTime() === mar.start.getTime())
    pass('February ends exactly where March begins')
  else fail(`the months do not meet: ${iso(feb.end)} vs ${iso(mar.start)}`)
  // A lead created at that instant belongs to March only. Asserted the way
  // the queries ask it: gte start, lt end.
  const boundary = mar.start
  const inFeb = boundary >= feb.start && boundary < feb.end
  const inMar = boundary >= mar.start && boundary < mar.end
  if (!inFeb && inMar) pass('the boundary instant counts in March alone')
  else fail(`the boundary instant is in Feb=${inFeb} Mar=${inMar} — one lead, two reports`)
}

console.log('\n"Last month", from the shop\'s own calendar')
{
  // The cron fires mid-morning UTC on the 1st. By then every zone this
  // platform serves has finished the month, so every client agrees.
  const fired = new Date('2026-03-01T13:00:00Z')
  const la = previousMonthOf(fired, LA)
  const ny = previousMonthOf(fired, NY)
  if (la.year === 2026 && la.month === 2 && ny.year === 2026 && ny.month === 2)
    pass('at 13:00 UTC on 1 March, both coasts say February')
  else fail(`LA said ${la.month}/${la.year}, NY said ${ny.month}/${ny.year}`)

  /* THE REASON THE CRON IS NOT AT MIDNIGHT. 00:00 UTC on 1 March is still 28
     February in Los Angeles, so "last month" there is JANUARY — the report
     would skip February entirely for every Pacific client and nothing about
     it would look wrong. This asserts the trap rather than the fix, so the
     schedule cannot quietly move back to midnight. */
  const midnight = new Date('2026-03-01T00:00:00Z')
  const laMidnight = previousMonthOf(midnight, LA)
  if (laMidnight.month === 1)
    pass('at 00:00 UTC the Pacific answer really is January — hence the 13:00 schedule')
  else fail(`expected the midnight trap to yield January, got ${laMidnight.month}`)
  /* AND IT IS NOT ONLY THE WEST COAST. 00:00 UTC on 1 March is 19:00 on 28
     February in New York, so every US client would be sent January. This
     started out asserting February for New York and the check was wrong, not
     the code — the trap is wider than it first looked, which is the reason to
     write the expectation down. */
  const nyMidnight = previousMonthOf(midnight, NY)
  if (nyMidnight.month === 1) pass('and New York says January too — no US client escapes it')
  else fail(`New York said ${nyMidnight.month} at midnight UTC, expected January`)

  // January rolls back a year.
  const jan = previousMonthOf(new Date('2026-01-01T13:00:00Z'), NY)
  if (jan.year === 2025 && jan.month === 12) pass('January looks back to December 2025')
  else fail(`January rolled back to ${jan.month}/${jan.year}`)
}

console.log('\nDay windows still behave as lead-dedup expects')
{
  /* THE SAME FUNCTION lead-dedup HAS ALWAYS USED, moved rather than rewritten.
     Its end is INCLUSIVE to the millisecond because its callers compare with
     lte — the opposite of the month window, and deliberately so. */
  const noon = new Date('2026-02-10T20:00:00Z') // Noon in LA
  const day = dayWindow(noon, LA)
  expectEqual('10 Feb LA starts', iso(day.start), '2026-02-10T08:00:00.000Z')
  expectEqual('10 Feb LA ends', iso(day.end), '2026-02-11T07:59:59.999Z')
  const span = (day.end.getTime() - day.start.getTime() + 1) / 3_600_000
  if (span === 24) pass('the day is 24 hours end to end')
  else fail(`the day came out ${span} hours`)

  // Late evening local is still the same local day, which is the case that
  // makes two enquiries one job.
  const evening = new Date('2026-02-11T06:30:00Z') // 22:30 on the 10th in LA
  const sameDay = dayWindow(evening, LA)
  if (sameDay.start.getTime() === day.start.getTime())
    pass('22:30 local lands in the same local day as noon')
  else fail('a late-evening enquiry fell into the next day')

  // And in New York that same instant is already the 11th.
  const nyDay = dayWindow(evening, NY)
  if (nyDay.start.getTime() !== day.start.getTime())
    pass('the same instant is a different local day in New York, as it should be')
  else fail('New York and Los Angeles agreed on the day at 06:30 UTC')
}

console.log('\nLabels')
{
  expectEqual('February', monthLabel(2026, 2), 'February 2026')
  // Built at midday UTC so no zone can drag the label into the month either
  // side of it — the bug that labels a January report "December".
  expectEqual('January', monthLabel(2026, 1), 'January 2026')
  expectEqual('December', monthLabel(2025, 12), 'December 2025')
}

console.log(
  failures === 0
    ? '\nAll timezone-window checks passed.'
    : `\n${failures} timezone-window check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
