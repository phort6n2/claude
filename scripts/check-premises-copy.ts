/**
 * Editorial copy that sends a service-area business's customers to a shop.
 *
 * Run: npx tsx scripts/check-premises-copy.ts
 *
 * BOTH DIRECTIONS, and the silent one is the expensive one. Too eager and this
 * files a finding against the thirteen clients who DO have a unit somebody can
 * drive to — "drop the car off" is simply true for them — which turns the
 * queue permanently red and teaches people to scroll past it, including on the
 * morning it is real. Too lenient and a sentence nobody wrote for this shop
 * keeps telling their customers to turn up at an address where there is
 * nothing, which is the one § 2 failure that ends with somebody standing in a
 * car park.
 *
 * The fixture is NorthStar's real copy, verbatim, because the provenance is
 * the point: their own previous website, rendered in full, contains no
 * premises word anywhere. Every one of these sentences was written by the
 * importer for a business that has no premises.
 */

import {
  evaluatePremisesCopy,
  findPremisesClaims,
  PREMISES_COPY_CHECK,
  type PremisesCopyHit,
} from '../src/lib/premises-copy-health'
import { claimProblem } from '../src/lib/copy-claims'
import type { ScannedField } from '../src/lib/rogue-numbers'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

/** NorthStar's own stored copy, as it is on the live site today. */
const NORTHSTAR: ScannedField[] = [
  {
    where: 'FAQ answer 1',
    text:
      'What do you need from me to give me a quote? The vehicle year, make and model, which glass is broken, ' +
      'any options like rain sensor, heated wiper park, embedded antenna, acoustic glass, tint band — and where ' +
      "you'd like the work done, at our Little Elm shop or at your home or workplace.",
  },
  {
    where: 'FAQ answer 4',
    text:
      'Will a chip spread? A chip in the driver\'s line of sight, a crack reaching the edge, or damage tied to a ' +
      'camera or sensor are all things we want to see rather than have you live with. You can come to the shop in ' +
      "Little Elm or we can meet you where the vehicle is. Don't wait it out — call us and describe what you're noticing.",
  },
  {
    where: 'the story section “Chip repair”',
    text:
      'If it can be repaired, that is usually the cheapest way out. Bring it to us while it is small.',
  },
]

console.log('\nNorthStar’s real copy — a service-area business')
{
  const { judged, drafts } = evaluatePremisesCopy({
    hasShopLocation: false,
    fields: NORTHSTAR,
  })
  if (judged) pass('judged, so the finding can auto-resolve when the copy is fixed')
  else fail('a service-area business was not judged')
  if (drafts.length === 1) pass('ONE finding for three sentences — one thing to sit down and fix')
  else fail(`expected one finding, got ${drafts.length}`)

  const draft = drafts[0]
  if (draft?.check === PREMISES_COPY_CHECK) pass(`check is ${PREMISES_COPY_CHECK}`)
  else fail(`wrong check name: ${draft?.check}`)
  // A customer acts on this today, and the claim is ours, not theirs.
  if (draft?.severity === 'ALERT') pass('ALERT: somebody drives somewhere and finds nothing')
  else fail(`expected ALERT, got ${draft?.severity}`)

  const hits = (draft?.evidence as { occurrences: PremisesCopyHit[] }).occurrences
  if (hits.length === 3) pass('all three sentences are in the evidence')
  else fail(`expected 3 occurrences, got ${hits.length}`)
  // The field name is what makes it fixable — it names the box to open.
  for (const where of ['FAQ answer 1', 'FAQ answer 4', 'the story section “Chip repair”']) {
    if (hits.some((h) => h.where === where)) pass(`names ${where}`)
    else fail(`the finding does not say where to look: ${where} missing`)
  }
  // "Bring it to us" is the one the drafters' own screen used to miss.
  if (hits.some((h) => /bring it/i.test(h.claim))) pass('catches “Bring it to us”')
  else fail('missed “Bring it to us” — the phrase copy-claims had drifted past')
}

console.log('\nThe same copy on a shop that HAS premises')
{
  const { judged, drafts } = evaluatePremisesCopy({
    hasShopLocation: true,
    fields: NORTHSTAR,
  })
  if (drafts.length === 0) pass('silent — every one of those sentences is simply true')
  else fail(`fired on a client with premises: ${drafts[0]?.title}`)
  /* NOT judged, deliberately. Saying the check "ran" for a client it does not
     apply to would resolve a finding filed while the tick was on — and
     un-ticking the box does not fix the sentence, it only stops us looking. */
  if (!judged) pass('not judged, so un-ticking the box cannot resolve a live finding')
  else fail('a client with premises was judged, which would auto-resolve real findings')
}

console.log('\nCopy a service-area business may keep')
{
  const allowed: ScannedField[] = [
    { where: 'the warranty text', text: 'Your choice of repair shop is yours to make.' },
    {
      where: 'the footer blurb',
      text: 'Professional mobile auto glass service in the DFW area. We come to you.',
    },
    {
      where: 'the story section “How we work”',
      text: 'The glass is bonded into the body, so the fit matters more than the badge on the box.',
    },
    { where: 'the Frisco city copy', text: 'Fast-moving traffic on the Dallas North Tollway throws stones.' },
    { where: 'FAQ answer 2', text: 'We meet you at home, at work, or wherever the vehicle is parked.' },
  ]
  const { drafts } = evaluatePremisesCopy({ hasShopLocation: false, fields: allowed })
  if (drafts.length === 0) pass('silent on all five')
  else
    fail(
      `fired on copy a service-area business needs: ${JSON.stringify(
        (drafts[0].evidence as { occurrences: unknown }).occurrences
      )}`
    )

  // The statutory sentence is the one that must never trip: it is the
  // customer's legal right and says nothing about our premises.
  const statutory = findPremisesClaims([
    { where: 'x', text: 'Your choice of repair shop is yours to make.' },
  ])
  if (statutory.length === 0) pass('the statutory repair-shop sentence survives')
  else fail(`fired on the reviewed statutory sentence: ${statutory[0].claim}`)
}

console.log('\nEmpty and missing fields')
{
  for (const [label, fields] of [
    ['no fields at all', []],
    ['empty strings', [{ where: 'the warranty text', text: '' }]],
    ['nulls', [{ where: 'the footer blurb', text: null }]],
  ] as Array<[string, ScannedField[]]>) {
    const { judged, drafts } = evaluatePremisesCopy({ hasShopLocation: false, fields })
    if (drafts.length === 0 && judged) pass(`${label}: nothing filed, still judged`)
    else fail(`${label}: ${drafts.length} finding(s), judged=${judged}`)
  }
  // HTML is stripped before screening: a kept page is markup, and a premises
  // word inside an attribute is still on the page.
  const html = findPremisesClaims([
    { where: 'the kept page /about', text: '<p>You can <b>come by</b> any time.</p>' },
  ])
  if (html.length === 1) pass('markup is stripped before the screen reads it')
  else fail('a premises claim inside markup was missed')
}

console.log('\nThe drafters share the SAME list (copy-claims)')
{
  const context = {
    hasShopLocation: false,
    offersMobileService: true,
    filesInsuranceClaims: false,
    smsCapable: false,
    services: {} as never,
  }
  /* These four are exactly what copy-claims' own narrower copy of the list let
     through before it was pointed at PREMISES_WORDS. A rule that protects the
     sweep and not the drafters just means the next invented sentence is
     written tomorrow instead of last year. */
  for (const text of [
    'Bring it to us while it is small.',
    'Visit us at the address below.',
    'In-shop calibration is included.',
    'The cover this shop offers, in their own words.',
  ]) {
    const problem = claimProblem(text, context)
    if (problem) pass(`a drafter cannot write: ${text}`)
    else fail(`copy-claims would ACCEPT for a service-area business: ${text}`)
  }
  // And it still must not refuse the statutory line or honest mobile copy.
  for (const text of [
    'Your choice of repair shop is yours to make.',
    'We come to you, wherever the vehicle is.',
  ]) {
    const problem = claimProblem(text, context)
    if (!problem) pass(`a drafter may still write: ${text}`)
    else fail(`copy-claims refuses copy it should allow: ${text} (${problem.reason})`)
  }
}

console.log(
  failures === 0
    ? '\nAll premises-copy checks passed.'
    : `\n${failures} premises-copy check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
