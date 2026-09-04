/**
 * The rogue-number detector, against the copy that produced it.
 *
 *   npx tsx scripts/check-rogue-numbers.ts
 *
 * A phone-number regex over free text is a heuristic, and the failure that
 * matters is the FALSE positive: a compliance line flagged as a leak teaches
 * an operator to ignore the check. So every trap that is not a phone number
 * is in here too — a year range, a price, a ZIP+4, a VIN, a date, a ten-digit
 * order id — beside the real case that started this, an FAQ answer on a live
 * site ending "just to call: (949) 775-1661".
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real functions and exits non-zero when one of them is wrong.
 */
import { findRogueNumbers, evaluateRogueNumbers, editorialFields } from '@/lib/rogue-numbers'

const site = '+17145821740'

const cases: Array<[string, string, boolean]> = [
  // [label, text, expected to flag]
  ['the real AGK FAQ answer', "We cover most of north county — same day in most cases, sometimes next morning if it's late. Easiest way to find out is just to call: (949) 775-1661.", true],
  ['the site number, formatted', 'Call us on (714) 582-1740 any time.', false],
  ['the site number, dotted', 'Reach us: 714.582.1740', false],
  ['the site number with +1', 'Call +1 714-582-1740', false],
  ['an old line, dashes', 'Our old shop line was 949-775-3791 for years.', true],
  ['a toll-free insurer number', 'Your insurer can be reached at 1-800-421-3535.', true],
  ['a year range', 'Serving drivers since 2004-2019 across the county.', false],
  ['a price', 'Windshields from $249.00 to $1,150.00 fitted.', false],
  ['a ZIP+4', 'Our address is 92649-1234.', false],
  ['a bare 10-digit order id', 'Reference 4155550199 on your invoice.', false],
  ['a VIN fragment', 'VIN 1HGCM82633A004352 decoded.', false],
  ['a date', 'Fitted on 03/14/2026 at the shop.', false],
]

let bad = 0
for (const [label, text, expected] of cases) {
  const hits = findRogueNumbers([{ where: 'test', text }], [site])
  const flagged = hits.length > 0
  const mark = flagged === expected ? 'ok  ' : 'FAIL'
  if (flagged !== expected) bad++
  console.log(`${mark} ${label}${flagged ? ` -> ${hits.map((h) => h.number).join(', ')}` : ''}`)
}

// One number repeated in one field is one row.
const repeated = findRogueNumbers(
  [{ where: 'FAQ answer 1', text: 'Call 949-775-1661. Yes, 949-775-1661. Really, (949) 775-1661.' }],
  [site]
)
console.log(repeated.length === 1 ? 'ok   repeated number collapses to one row' : `FAIL repeated -> ${repeated.length}`)
if (repeated.length !== 1) bad++

// End to end, shaped like a real client.
const finding = evaluateRogueNumbers({
  fields: editorialFields({
    content: {
      warrantyText: 'Lifetime workmanship warranty on every install.',
      footerBlurb: 'Family owned since 2018.',
      faq: [{ q: 'Do you come to me?', a: 'Yes — call (949) 775-1661 to arrange it.' }],
      chapters: [{ heading: 'Our story', body: 'We started in a driveway.' }],
    },
    cityContent: [{ city: 'Irvine', body: 'Irvine customers can reach the shop on 949.518.1707.' }],
    keptPages: [{ path: '/insurance-claims', bodyHtml: '<p>We bill your insurer directly.</p>' }],
  }),
  siteNumber: site,
})
console.log('\n--- finding ---')
console.log(finding[0]?.title)
console.log(finding[0]?.detail)
console.log(JSON.stringify(finding[0]?.evidence, null, 1).slice(0, 700))
console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
