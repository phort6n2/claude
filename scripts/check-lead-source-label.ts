/**
 * The readable `source` sent to a shop's CRM (lib/lead-source-label.ts).
 *
 *   npx tsx scripts/check-lead-source-label.ts
 *
 * The silent case first: a call to the default number with nothing else known
 * is "Phone call", never an ad platform — that number is everyone's.
 */
import { callSourceLabel, leadSourceLabel } from '../src/lib/lead-source-label'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

console.log('\nCALLS: NEVER A GUESS')
check(callSourceLabel({ showTo: null }) === 'Phone call', 'default number, nothing known → Phone call')
check(callSourceLabel({ showTo: null }, null) === 'Phone call', '…and with an explicit null')
check(callSourceLabel({ showTo: null }, { trafficSource: 'unknown' }) === 'Phone call', 'an earlier lead that knew nothing does not overwrite it')
check(callSourceLabel({ showTo: null }, { trafficSource: null }) === 'Phone call', '…nor one with no source at all')
check(callSourceLabel({ showTo: 'meta' }) === 'Facebook Ads', 'the Meta number → Facebook Ads')
check(callSourceLabel({ showTo: 'microsoft' }) === 'Microsoft Ads', 'the Microsoft number → Microsoft Ads')
check(
  callSourceLabel({ showTo: null }, { trafficSource: 'google', trafficMedium: 'paid' }) === 'Google Ads',
  'a form from a Google ad earlier today, then a call → Google Ads'
)
check(
  callSourceLabel({ showTo: 'meta' }, { trafficSource: 'google', trafficMedium: 'paid' }) === 'Facebook Ads',
  'the number dialled beats the earlier form'
)

console.log('\nFORMS')
const cases: Array<[string | null, string | null, string]> = [
  ['google', 'paid', 'Google Ads'],
  ['google', 'organic', 'Google (organic)'],
  ['microsoft', 'paid', 'Microsoft Ads'],
  ['microsoft', 'organic', 'Bing (organic)'],
  ['meta', 'paid', 'Facebook Ads'],
  ['meta', 'social', 'Facebook'],
  ['direct', 'none', 'Direct'],
  ['other', 'referral', 'Referral'],
  ['other', 'social', 'Social media'],
  ['other', 'email', 'Email'],
  ['other', 'paid', 'Other ads'],
  ['other', null, 'Other website'],
  ['unknown', null, 'Website'],
  [null, null, 'Website'],
  ['GOOGLE', 'PAID', 'Google Ads'],
]
for (const [s, m, want] of cases) {
  const got = leadSourceLabel({ trafficSource: s, trafficMedium: m })
  check(got === want, `${s}/${m} → ${want}${got === want ? '' : ` (got ${got})`}`)
}

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll checks passed.')
