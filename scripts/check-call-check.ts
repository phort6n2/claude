/**
 * The call check: our calls matched against Google's call log.
 *
 * Run: npx tsx scripts/check-call-check.ts
 *
 * The silent failures first. A match that is too eager pairs a website call
 * with an unrelated ad call and reports Google as seeing calls it never saw;
 * too strict, and every ad call reads as "not from an ad button", which is the
 * exact false alarm this page exists to settle. And the clock: Google writes
 * call times in the ACCOUNT's zone with no offset on the string, so a wrong
 * conversion moves every call by hours and nothing matches at all.
 */

import {
  areaCodeOf,
  googleCallInstant,
  matchCalls,
  weekOf,
  weeklyRows,
  callCheckVerdicts,
  conversionColumnOf,
  type AppCall,
  type GoogleCall,
} from '../src/lib/call-check'

let failures = 0
const check = (ok: boolean, msg: string) => {
  if (ok) console.log(`  ✓ ${msg}`)
  else {
    failures++
    console.error(`  ✗ ${msg}`)
  }
}

const app = (id: string, iso: string, phone: string | null, status = 'completed', d = 60): AppCall => ({
  id,
  at: new Date(iso),
  phone,
  status,
  durationSecs: d,
  tracked: true,
})
const g = (iso: string, areaCode: string | null, status = 'RECEIVED', d = 60): GoogleCall => ({
  at: new Date(iso),
  areaCode,
  status,
  durationSecs: d,
})

console.log('\nGOOGLE\'S CLOCK, READ IN THE ACCOUNT\'S ZONE')
// Real call_view shape (ElitePro, America/Chicago): "2026-10-06 16:39:42".
check(
  googleCallInstant('2026-10-06 16:39:42', 'America/Chicago')?.toISOString() === '2026-10-06T21:39:42.000Z',
  'CDT afternoon → UTC +5h'
)
check(
  googleCallInstant('2026-11-02 10:00:00', 'America/Chicago')?.toISOString() === '2026-11-02T16:00:00.000Z',
  'the day after clocks go back → +6h, not +5h'
)
check(
  googleCallInstant('2026-10-06 09:00:00', 'America/Vancouver')?.toISOString() === '2026-10-06T16:00:00.000Z',
  'a Canadian account (AGS) in its own zone'
)
check(googleCallInstant('', 'America/Chicago') === null, 'a missing time is null, not 1970')

console.log('\nAREA CODES')
check(areaCodeOf('+18325643197') === '832', 'E.164')
check(areaCodeOf('(346) 555-0101') === '346', 'formatted')
check(areaCodeOf('anonymous') === null && areaCodeOf(null) === null, 'withheld is unknown, not a mismatch')

console.log('\nMATCHING — NOT TOO EAGER')
{
  const m = matchCalls([app('a', '2026-10-06T21:39:44Z', '+12815550101')], [g('2026-10-06T21:39:42Z', '832')])
  check(m.pairs.length === 0, 'same second, different area code → not the same call')
}
{
  const m = matchCalls([app('a', '2026-10-06T21:45:00Z', '+18325550101')], [g('2026-10-06T21:39:42Z', '832')])
  check(m.pairs.length === 0 && m.appOnly.length === 1 && m.googleOnly.length === 1, 'five minutes apart → two calls')
}
{
  // Two ad calls from the same area code a minute apart, two of ours: each
  // takes its nearest, and neither is stolen by list order.
  const m = matchCalls(
    [app('late', '2026-10-06T21:41:05Z', '+18325550102'), app('early', '2026-10-06T21:40:03Z', '+18325550101')],
    [g('2026-10-06T21:40:00Z', '832'), g('2026-10-06T21:41:00Z', '832')]
  )
  const pairOf = (id: string) => m.pairs.find((p) => p.app.id === id)
  check(
    m.pairs.length === 2 &&
      pairOf('early')?.google.at.toISOString() === '2026-10-06T21:40:00.000Z' &&
      pairOf('late')?.google.at.toISOString() === '2026-10-06T21:41:00.000Z',
    'nearest first, one-to-one'
  )
}

console.log('\nMATCHING — NOT TOO STRICT')
{
  const m = matchCalls([app('a', '2026-10-06T21:39:44Z', '+18325550101')], [g('2026-10-06T21:39:42Z', '832')])
  check(m.pairs.length === 1 && m.pairs[0].gapSecs === 2, 'forwarded two seconds later → one call')
}
{
  const m = matchCalls([app('a', '2026-10-06T21:39:44Z', 'anonymous')], [g('2026-10-06T21:39:42Z', null, 'MISSED', 0)])
  check(m.pairs.length === 1, 'a withheld caller still matches on time')
}

console.log('\nWEEKS ARE MONDAYS IN THE SHOP\'S ZONE')
check(weekOf(new Date('2026-10-05T06:30:00Z'), 'America/Los_Angeles') === '2026-09-28', 'Sunday 11:30pm in LA is the week of Mon 28 Sep')
check(weekOf(new Date('2026-10-05T07:30:00Z'), 'America/Los_Angeles') === '2026-10-05', 'half past midnight Monday is the new week')

console.log('\nCONVERSION COLUMNS BY NAME')
check(conversionColumnOf('AGMP Website Call') === 'websiteCall', 'app website call')
check(conversionColumnOf('AGMP Call') === 'legacyCall', "HighLevel's call is LEGACY, not the website call")
check(conversionColumnOf('agmp call from ads') === 'callFromAds', 'case does not matter')
check(conversionColumnOf('Phone call click') === null, 'anything else is "other"')

console.log('\nTHE VERDICT ONLY SAYS WHAT THE COUNTS CARRY')
{
  // ElitePro's shape: plenty of calls reach us, Google credits ~nothing.
  const ours = Array.from({ length: 12 }, (_, i) => app(`w${i}`, `2026-10-0${1 + (i % 6)}T15:0${i % 10}:00Z`, '+18325550100'))
  const weeks = weeklyRows(matchCalls(ours, []), [{ week: '2026-09-28', action: 'AGMP Website Call', allConversions: 1 }], 'America/Chicago')
  const v = callCheckVerdicts({ weeks, callAssets: [], googleLogStarts: null })
  check(v.some((x) => x.tone === 'bad' && /Google is seeing very few/.test(x.text)), '12 non-ad calls against 1 credited → flagged')
}
{
  const ours = [app('a', '2026-10-01T15:00:00Z', '+18325550100'), app('b', '2026-10-02T15:00:00Z', '+18325550100')]
  const weeks = weeklyRows(matchCalls(ours, []), [], 'America/Chicago')
  const v = callCheckVerdicts({ weeks, callAssets: [], googleLogStarts: null })
  check(!v.some((x) => x.tone === 'bad' || x.tone === 'warn'), 'two calls is not a finding')
}
{
  const lost = [g('2026-10-01T15:00:00Z', '832'), g('2026-10-02T15:00:00Z', '346'), g('2026-10-03T15:00:00Z', '713')]
  const weeks = weeklyRows(matchCalls([], lost), [], 'America/Chicago')
  const ours = callCheckVerdicts({ weeks, callAssets: [{ phone: '(832) 564-3197', ours: true }], googleLogStarts: null })
  const theirs = callCheckVerdicts({ weeks, callAssets: [{ phone: '(713) 555-0199', ours: false }], googleLogStarts: null })
  check(ours.some((x) => x.tone === 'bad' && /never reached a tracking number/.test(x.text)), 'ad calls missing while the asset is ours → bad')
  check(theirs.every((x) => x.tone !== 'bad') && theirs.some((x) => /shop's own line/.test(x.text)), "asset on the shop's own line → explained, not alarmed")
}
{
  const weeks = weeklyRows(matchCalls([], []), [], 'America/Chicago')
  check(callCheckVerdicts({ weeks, callAssets: [], googleLogStarts: null })[0]?.text.startsWith('No calls'), 'an empty window says so')
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n')
process.exit(failures ? 1 : 0)
