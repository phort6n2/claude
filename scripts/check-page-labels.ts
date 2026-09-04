/**
 * The footer-label and heading rules, against the titles that produced them.
 *
 *   npx tsx scripts/check-page-labels.ts
 *
 * These are heuristics over other people's SEO titles, so they will need
 * adjusting as more shops come off more old sites — and a heuristic without a
 * list of what it is supposed to do regresses silently. Every case below is
 * either a real title from a live cutover or a trap one of these rules fell
 * into: "Repair or Replace" losing its last word to a state code, and
 * "Auto Glass: <cities>" losing its subject to a colon split.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real functions and exits non-zero when one of them is wrong.
 */

import { shortLabel, stripSeoTail } from '../src/lib/site-pages'

const BIZ = 'Collision Auto Glass & Calibration'
const cases: Array<[string, string, string]> = [
  // title, expected heading, expected footer label
  ['Auto Glass Insurance Claims | Portland Metro, Oregon', 'Auto Glass Insurance Claims', 'Insurance Claims'],
  ['Auto Glass Repair Hillsboro OR | Collision Auto Glass', 'Auto Glass Repair Hillsboro', 'Repair Hillsboro'],
  ['Auto Glass Repair Lake Oswego OR | Collision Auto Glass', 'Auto Glass Repair Lake Oswego', 'Repair Lake Oswego'],
  ['Auto Glass: Tualatin, Tigard & Lake Oswego | Oregon', 'Auto Glass: Tualatin, Tigard & Lake Oswego', 'Tualatin, Tigard & Lake Oswego'],
  // the trap the two state patterns exist for
  ['Repair or Replace', 'Repair or Replace', 'Repair or Replace'],
  ['Windshield Chip Repair in Oregon', 'Windshield Chip Repair', 'Windshield Chip Repair'],
  // degenerate inputs must never lose the page's identity
  ['Auto Glass', 'Auto Glass', 'Auto Glass'],
  ['Collision Auto Glass & Calibration', 'Collision Auto Glass & Calibration', 'Collision Auto Glass & Calibration'],
  ['', '', ''],
  // Auto Glass Kings' kept pages, which are the reason the sales-word rules
  // exist: eight footer links that all began "Fast" and all ended "Service",
  // so the words telling them apart were in the middle.
  ['Fast Auto Glass Repair Service', 'Fast Auto Glass Repair Service', 'Auto Glass Repair'],
  ['Fast Auto Glass Replacement Service', 'Fast Auto Glass Replacement Service', 'Auto Glass Replacement'],
  ['Fast Back Glass Repair Service', 'Fast Back Glass Repair Service', 'Back Glass Repair'],
  ['Fast Car Window Repair Service', 'Fast Car Window Repair Service', 'Car Window Repair'],
  ['Fast Door Glass Repair Service', 'Fast Door Glass Repair Service', 'Door Glass Repair'],
  ['Affordable Windshield Replacement Near Me', 'Affordable Windshield Replacement Near Me', 'Windshield Replacement'],
  // NOT stripped: mobile is a different job, and a free quote is the offer.
  ['Mobile Auto Glass Service', 'Mobile Auto Glass Service', 'Mobile Auto Glass'],
  ['Free Auto Glass Quote', 'Free Auto Glass Quote', 'Free Auto Glass Quote'],
  // The leading "Auto Glass" comes off only when a subject survives it.
  ['Auto Glass Repair', 'Auto Glass Repair', 'Auto Glass Repair'],
  // A page that is nothing but the pitch keeps its words rather than emptying.
  ['Fast Service', 'Fast Service', 'Fast Service'],
  // long one gets cut on a word boundary
  ['Everything You Ever Wanted To Know About Laminated Windshield Glass', 'Everything You Ever Wanted To Know About Laminated Windshield Glass', 'Everything You Ever Wanted To Know…'],
]

let bad = 0
for (const [title, wantHeading, wantLabel] of cases) {
  const h = stripSeoTail(title, BIZ)
  const l = shortLabel(title, BIZ)
  const ok = h === wantHeading && l === wantLabel
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${JSON.stringify(title)}`)
  if (!ok) {
    if (h !== wantHeading) console.log(`        heading: got ${JSON.stringify(h)} want ${JSON.stringify(wantHeading)}`)
    if (l !== wantLabel) console.log(`        label:   got ${JSON.stringify(l)} want ${JSON.stringify(wantLabel)}`)
  }
}
console.log(bad === 0 ? '\nall pass' : `\n${bad} failing`)
if (bad > 0) process.exit(1)
