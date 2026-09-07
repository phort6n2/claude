/**
 * The branded / non-branded rule, against the names that break it.
 *
 *   npx tsx scripts/check-brand-terms.ts
 *
 * WHY THIS IS WORTH A SCRIPT. "How many of these people did not already know
 * your name" is the one figure on the Traffic page that answers the standing
 * objection to an SEO invoice, and it is decided entirely by a word list.
 * Get the list wrong in one direction and every generic search counts as
 * branded, so the panel reports that nobody new ever finds them. Get it wrong
 * in the other and searches for the shop's own name are counted as strangers,
 * which flatters the service — the failure nobody would report.
 *
 * Almost every client here is "<something> Auto Glass", so the trade-word
 * list is not a nicety: without it the split does not exist.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real functions and exits non-zero when one of them is wrong.
 */
import { defaultBrandTerms, isBrandedQuery, foldTerm } from '@/lib/site-analytics'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

// Real shop names, including the ones whose distinctive word is a common one.
const SHOPS: Array<{ name: string; site?: string }> = [
  { name: 'Auto Glass Kings', site: 'autoglasskings.com' },
  { name: 'Precision Auto Glass' },
  { name: "Bob's Windshield Repair" },
  { name: 'A-1 Auto Glass' },
  { name: 'Auto Glass Now' },
  { name: 'Safelite' },
]

console.log('--- a shop is never branded on trade vocabulary alone ---')
/* THE ONE THAT MATTERS. If "auto glass" counts as this shop's name, the
   non-branded number — the whole point of the panel — reads zero forever. */
const GENERIC = [
  'auto glass repair near me',
  'windshield replacement cost',
  'mobile auto glass',
  'car window replacement',
  'cheap windshield repair',
  'same day auto glass service',
]
for (const { name, site } of SHOPS) {
  const terms = defaultBrandTerms(name, site)
  for (const q of GENERIC) {
    check(
      `${name}: "${q}" is a stranger`,
      !isBrandedQuery(q, terms),
      `terms were ${JSON.stringify(terms)}`
    )
  }
}

console.log('\n--- a search for the shop BY NAME is caught, however it is typed ---')
/* The dangerous direction. A miss here counts somebody who already knew the
   business as a stranger the SEO won, which is the error that flatters us. */
const NAMED: Array<[string, string | undefined, string]> = [
  ['Auto Glass Kings', 'autoglasskings.com', 'auto glass kings'],
  ['Auto Glass Kings', 'autoglasskings.com', 'autoglasskings'],
  ['Auto Glass Kings', 'autoglasskings.com', 'auto glass kings huntington beach'],
  ['Auto Glass Kings', 'autoglasskings.com', 'kings auto glass'],
  ['Auto Glass Kings', 'autoglasskings.com', 'autoglasskings.com'],
  ['Precision Auto Glass', undefined, 'precision auto glass'],
  ['Precision Auto Glass', undefined, 'precision autoglass near me'],
  ["Bob's Windshield Repair", undefined, 'bobs windshield repair'],
  ["Bob's Windshield Repair", undefined, "bob's windshield"],
  // Punctuation and spacing are exactly what people get wrong, and the folded
  // comparison exists for this row.
  ['A-1 Auto Glass', undefined, 'a1 auto glass'],
  ['A-1 Auto Glass', undefined, 'a 1 autoglass'],
  ['Safelite', undefined, 'safelite'],
  ['Safelite', undefined, 'safelite windshield replacement'],
]
for (const [name, site, query] of NAMED) {
  const terms = defaultBrandTerms(name, site)
  check(
    `${name}: "${query}" is their own name`,
    isBrandedQuery(query, terms),
    `terms were ${JSON.stringify(terms)}`
  )
}

console.log('\n--- the derived defaults do not contain trade words on their own ---')
for (const { name, site } of SHOPS) {
  const terms = defaultBrandTerms(name, site)
  const loose = terms.filter((t) => t.split(/\s+/).length === 1 && t.length < 4)
  check(`${name}: no term shorter than four characters`, loose.length === 0, loose.join(', '))
  check(`${name}: produced at least one term`, terms.length > 0)
}

console.log('\n--- an empty or junk value never classifies anything ---')
check('no terms means nothing is branded', !isBrandedQuery('auto glass kings', []))
check('an empty query is not branded', !isBrandedQuery('', ['kings']))
check('a punctuation-only term is ignored', !isBrandedQuery('auto glass', ['---']))
check('folding strips everything but letters and digits', foldTerm("A-1 Bob's #2") === 'a1bobs2')

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
