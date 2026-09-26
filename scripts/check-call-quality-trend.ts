/**
 * The call-quality trend in the portal: is the team getting better?
 *
 * Run: npx tsx scripts/check-call-quality-trend.ts
 *
 * This chart makes a claim about PEOPLE, in front of their boss — "up 6
 * points", "Mike's line", "below the four weeks before". Every way it can be
 * wrong is a way of telling somebody something false about how they do their
 * job, so the silent cases come first: when the data cannot support a
 * sentence, there must be no sentence.
 */

import {
  buildQualityTrend,
  TREND_WEEKS,
  MIN_CALLS_HEADLINE,
  MIN_CALLS_PER_REP,
  MAX_REP_LINES,
  type TrendRow,
} from '../src/lib/call-analysis/quality-trend'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

const TZ = 'America/Los_Angeles'
// A Wednesday afternoon in LA. Its week starts Monday 14 Sep 2026.
const NOW = new Date('2026-09-16T21:00:00Z')
const DAY = 24 * 60 * 60 * 1000

/** A call `weeksAgo` weeks before NOW (same weekday), with a score. */
const call = (
  weeksAgo: number,
  score: number,
  outcome = 'lost',
  rep: string | null = null,
  hoursOffset = 0
): TrendRow => ({
  createdAt: new Date(NOW.getTime() - weeksAgo * 7 * DAY + hoursOffset * 3600_000),
  score,
  outcome,
  analysis: { rep_name: rep },
})

console.log('\nSILENT: too little data makes no claim')
{
  const empty = buildQualityTrend([], TZ, NOW)
  if (empty.graded === 0 && empty.headline === null) pass('no calls → no headline, nothing graded')
  else fail(`an empty shop produced a claim: ${JSON.stringify(empty.headline)}`)
  if (empty.weeks.length === TREND_WEEKS && empty.weeks.every((w) => w.team.avg === null)) {
    pass(`${TREND_WEEKS} empty weeks, every one a gap — never a zero`)
  } else fail('an empty week was given a value')

  // Two calls a side: a coin toss dressed as a trend.
  const thin = buildQualityTrend([call(0, 90), call(1, 90), call(5, 40), call(6, 40)], TZ, NOW)
  if (thin.headline === null && thin.headlineReason) pass(`2 v 2 calls → no verdict: "${thin.headlineReason.slice(0, 60)}…"`)
  else fail(`a 50-point "improvement" was claimed on four calls: ${JSON.stringify(thin.headline)}`)
}

console.log('\nThe verdict, once there is enough to say it')
{
  const rows = [
    ...[0, 1, 2, 3].map((w) => call(w, 80)),
    ...[4, 5, 6, 7].map((w) => call(w, 70)),
  ]
  const t = buildQualityTrend(rows, TZ, NOW)
  if (t.headline?.recent === 80 && t.headline.prior === 70 && t.headline.delta === 10) {
    pass('last 4 weeks 80 vs 70 before → +10')
  } else fail(`wrong comparison: ${JSON.stringify(t.headline)}`)
  if (t.headline && t.headline.recentN >= MIN_CALLS_HEADLINE) pass('and the counts behind it travel with it')
  else fail('the headline hides how many calls it rests on')
}

console.log('\nPOOLED over calls, not an average of weekly averages')
{
  /* One week with a single 40 must not weigh the same as a week of eleven
     90s. Averaging the weekly averages would read (40+90)/2 = 65 for a team
     whose calls were almost all excellent. */
  const rows = [call(0, 40), ...Array.from({ length: 11 }, () => call(1, 90)), ...[4, 5, 6].map((w) => call(w, 70))]
  const t = buildQualityTrend(rows, TZ, NOW)
  const expected = Math.round((40 + 11 * 90) / 12)
  if (t.headline?.recent === expected) pass(`recent = ${expected}, not 65`)
  else fail(`recent average weighted by week, not by call: ${t.headline?.recent}`)
}

console.log('\nQUESTION CALLS are left out, and counted')
{
  const rows = [
    ...[0, 1, 2].map((w) => call(w, 80)),
    ...[0, 1, 2].map((w) => call(w, 10, 'info_only')),
    ...[4, 5, 6].map((w) => call(w, 80)),
  ]
  const t = buildQualityTrend(rows, TZ, NOW)
  if (t.headline?.recent === 80) pass('three "are you open Saturday" calls do not drag the team to 45')
  else fail(`question calls moved the sales average: ${t.headline?.recent}`)
  if (t.questionCalls === 3) pass('and the page can say 3 were left out')
  else fail(`question calls vanished without a count: ${t.questionCalls}`)
}

console.log('\nBOOKED calls count as booked, week by week')
{
  const t = buildQualityTrend([call(0, 85, 'booked'), call(0, 82, 'booked'), call(0, 60)], TZ, NOW)
  const thisWeek = t.weeks[t.weeks.length - 1]
  if (thisWeek.team.booked === 2 && thisWeek.team.n === 3) pass('2 booked of 3 in the current week')
  else fail(`booked count wrong: ${JSON.stringify(thisWeek.team)}`)
  if (thisWeek.partial) pass('the current week is marked as still in progress')
  else fail('the current week reads as complete')
}

console.log("\nWEEKS ARE THE SHOP'S WEEKS")
{
  /* Sunday 13 Sep 2026, 11pm in Los Angeles is Monday 06:00 UTC. Bucketed in
     UTC it lands in THIS week; it belongs to last week. The monthly report
     shipped exactly this bug once. */
  const sundayNightLA = new Date('2026-09-14T06:00:00Z')
  const t = buildQualityTrend([{ createdAt: sundayNightLA, score: 77, outcome: 'lost', analysis: {} }], TZ, NOW)
  const last = t.weeks[t.weeks.length - 1]
  const prev = t.weeks[t.weeks.length - 2]
  if (prev.team.n === 1 && last.team.n === 0) pass(`a Sunday 11pm LA call sits in the week of ${prev.start}`)
  else fail(`bucketed in UTC: this week n=${last.team.n}, last week n=${prev.team.n}`)
  if (last.start === '2026-09-14' && last.end === '2026-09-20') pass('weeks run Monday to Sunday')
  else fail(`week edges wrong: ${last.start}–${last.end}`)
}

console.log('\nPER REP, only from what the rep said')
{
  const rows = [
    ...[0, 1, 2].map((w) => call(w, 80, 'lost', 'mike')),
    call(3, 60, 'lost', 'Mike'), // same person, other casing
    call(0, 70, 'lost', 'Sam'), // not enough calls for a line
    call(0, 90, 'lost', null), // nobody gave a name
  ]
  const t = buildQualityTrend(rows, TZ, NOW)
  if (t.reps.length === 1 && t.reps[0] === 'Mike') pass('"mike" and "Mike" are one person with one line')
  else fail(`reps: ${JSON.stringify(t.reps)}`)
  if (!t.reps.includes('Sam')) pass(`a rep with fewer than ${MIN_CALLS_PER_REP} named calls gets no line yet`)
  else fail('drew a line from a single call')
  if (t.unnamedCalls === 1 && t.graded === 6) pass('an unnamed call still counts for the team, and is counted as unnamed')
  else fail(`unnamed ${t.unnamedCalls}, graded ${t.graded}`)

  /* A name that is not a name must never become a line — "Unknown" as a rep
     would collect every call the model could not attribute and chart them
     as one bad employee. */
  const junk = buildQualityTrend([0, 1, 2, 3].map((w) => call(w, 50, 'lost', 'unknown')), TZ, NOW)
  if (junk.reps.length === 0) pass('"unknown" is never a rep')
  else fail(`a placeholder became a person: ${junk.reps}`)
}

console.log(`\nAt most ${MAX_REP_LINES} rep lines — the busiest`)
{
  const names = ['Ana', 'Ben', 'Cal', 'Dee', 'Eli']
  const rows = names.flatMap((n, i) => Array.from({ length: 3 + (names.length - i) }, (_, k) => call(k % 8, 70, 'lost', n)))
  const t = buildQualityTrend(rows, TZ, NOW)
  if (t.reps.length === MAX_REP_LINES && t.reps.join() === names.slice(0, MAX_REP_LINES).join()) {
    pass(`${names.length} reps → the ${MAX_REP_LINES} busiest: ${t.reps.join(', ')}`)
  } else fail(`rep selection wrong: ${t.reps}`)
  if (t.graded === rows.length) pass('every rep still counts in the team line')
  else fail('dropping a rep line dropped their calls from the team')
}

console.log('\nOutside the window is ignored')
{
  const t = buildQualityTrend([call(TREND_WEEKS + 2, 20), call(0, 80)], TZ, NOW)
  if (t.graded === 1) pass(`a call ${TREND_WEEKS + 2} weeks ago is not in a ${TREND_WEEKS}-week chart`)
  else fail(`old calls leaked in: graded ${t.graded}`)
  const ungraded = buildQualityTrend([{ createdAt: NOW, score: null, outcome: null, analysis: null }], TZ, NOW)
  if (ungraded.graded === 0) pass('a call with no score is not a zero')
  else fail('an unscored call counted')
}

console.log(
  failures === 0
    ? '\nAll call-quality-trend checks passed.'
    : `\n${failures} call-quality-trend check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
