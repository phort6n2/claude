/**
 * What a model is allowed to put back on a shop's live page.
 *
 * Run: npx tsx scripts/check-premises-rewrite.ts
 *
 * THE SCREEN IS THE WHOLE FEATURE. A button that rewrites copy is a button
 * that writes model prose onto a real business's public website, and the two
 * ways it goes wrong are opposite:
 *
 * - Too lenient, and a rewrite buys its way out of one false claim by making
 *   another. "Come to our shop" becomes "we come to you" for a shop with no
 *   mobile unit, or "text us a photo" to a landline, or a timing promise. Each
 *   reads beautifully, passes a premises check, and breaks § 2.
 * - Too eager, and every rewrite is thrown away, so the button reads as broken
 *   and the sentences stay exactly as they were — the state it exists to fix.
 *
 * Nothing here calls the API. The screen is pure, which is the point: it can
 * be held against the exact answers a model might give without spending a
 * request or needing a key.
 */

import { screenRewrites, replaceSentence, type RewriteTarget } from '../src/lib/premises-rewrite'
import type { ClaimContext } from '../src/lib/copy-claims'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

/** MAG Mobile: no premises, mobile unit, landline, does not file claims. */
const MAG: ClaimContext = {
  hasShopLocation: false,
  offersMobileService: true,
  filesInsuranceClaims: false,
  smsCapable: false,
  services: {
    offersWindshieldReplacement: true,
    offersWindshieldRepair: true,
    offersRockChipRepair: true,
    offersSideWindowRepair: true,
    offersBackWindowRepair: false,
    offersSunroofRepair: false,
    offersAdasCalibration: true,
  },
}

const TARGET: RewriteTarget = {
  id: 's1',
  sentence: 'You can bring the vehicle to our shop in Orlando, or we can send the mobile unit back out to you.',
  where: 'FAQ answer 8',
  claim: 'our shop',
}

const screen = (rewrite: string, context: ClaimContext = MAG) =>
  screenRewrites([{ id: 's1', rewrite }], [TARGET], context)

console.log('\nA good rewrite gets through')
{
  const r = screen('We come to the vehicle wherever it is parked, at home, at work or roadside.')
  if (r.proposals.length === 1) pass('accepted')
  else fail(`a clean rewrite was rejected: ${r.rejected[0]?.reason}`)
}

console.log('\nBuying out of one false claim with another')
{
  // The whole risk of the feature, in one line each.
  const traps: Array<[string, string, ClaimContext]> = [
    ['a timing promise', 'We come to you and most jobs are done the same day.', MAG],
    ['an hour', 'We can usually be with you within the hour.', MAG],
    ['a text invitation to a landline', 'Send us a text with a photo of the damage.', MAG],
    [
      'mobile service they do not offer',
      'We come to you wherever the vehicle is parked.',
      { ...MAG, offersMobileService: false },
    ],
    [
      'handling the claim when they do not',
      'We handle the insurance claim for you from start to finish.',
      MAG,
    ],
    ['a phone number', 'Call us on (407) 555-0134 and we will sort it.', MAG],
    ['a service they do not offer', 'We also replace back glass at your kerbside.', MAG],
  ]
  for (const [label, rewrite, context] of traps) {
    const r = screen(rewrite, context)
    if (r.proposals.length === 0 && r.rejected.length === 1)
      pass(`${label}: rejected — ${r.rejected[0].reason}`)
    else fail(`${label} was ACCEPTED: "${rewrite}"`)
  }
}

console.log('\nStill pointing at premises')
{
  for (const rewrite of [
    'You can still drop the vehicle off with us.',
    'Come by and we will take a look.',
    'Bring it to us while it is small.',
    'Our Orlando shop can fit you in.',
  ]) {
    const r = screen(rewrite)
    if (r.proposals.length === 0) pass(`rejected: ${rewrite}`)
    else fail(`a premises claim survived the screen: ${rewrite}`)
  }
}

console.log('\nThe answers that are not really answers')
{
  const empty = screen('')
  if (empty.rejected[0]?.reason.includes('empty')) pass('an empty rewrite is rejected')
  else fail('an empty rewrite was not caught')

  const same = screen(TARGET.sentence)
  // Applying an identical "rewrite" would resolve the finding tomorrow while
  // the sentence still reads the same — the queue lying, which it must never do.
  if (same.rejected[0]?.reason.includes('unchanged')) pass('an unchanged rewrite is rejected')
  else fail('a rewrite identical to the original was accepted')

  const essay = screen(
    'We come to the vehicle wherever it is parked. ' +
      'Our technicians carry every tool they need. ' +
      'We work across the whole region and have done for a long time. ' +
      'You will always speak to somebody who knows the job.'
  )
  if (essay.proposals.length === 0) pass('a paragraph in place of a sentence is rejected')
  else fail('a four-sentence expansion was accepted as a one-sentence fix')

  // A sentence the model skipped entirely has to be reported, or three in and
  // two out reads as the button half working.
  const missing = screenRewrites([], [TARGET], MAG)
  if (missing.rejected[0]?.reason.includes('returned nothing')) pass('a skipped sentence is named')
  else fail('a sentence the model ignored vanished silently')
}

console.log('\nThe same screen runs on the way back in')
{
  /* The apply path re-screens what the BROWSER sends. Without that, this is a
     suggestion box wired to a live website: a caller could post any text it
     liked as the "approved" rewrite. */
  const smuggled = screenRewrites(
    [{ id: 's1', rewrite: 'Drop in any time — same day service at our Orlando shop.' }],
    [TARGET],
    MAG
  )
  if (smuggled.proposals.length === 0) pass('text posted straight to apply is screened too')
  else fail('the apply path accepted text that the propose path would have rejected')

  // An id that was never proposed must not be smuggled in alongside good ones.
  const unknown = screenRewrites([{ id: 'made-up', rewrite: 'anything at all' }], [TARGET], MAG)
  if (unknown.proposals.length === 0) pass('an unknown id is ignored')
  else fail('a rewrite for an id nobody proposed was accepted')
}

console.log('\nWriting it back')
{
  const field = `Some earlier text. ${TARGET.sentence} And some after.`
  const ok = replaceSentence(field, TARGET.sentence, 'We come to you.')
  if (ok.ok && ok.text === 'Some earlier text. We come to you. And some after.')
    pass('the sentence is replaced in place, the rest untouched')
  else fail('the replacement did not land correctly')

  /* EXACT MATCH ONLY. Between the proposal and the press somebody may have
     edited the same paragraph; a fuzzy replace would throw their edit away
     and say nothing. Missing is a normal outcome and is reported as one. */
  const moved = replaceSentence('Somebody has since rewritten this entirely.', TARGET.sentence, 'x')
  if (!moved.ok && moved.reason.includes('no longer')) pass('an edited-since sentence is reported, not forced')
  else fail('a missing sentence was not reported')

  const empty = replaceSentence(null, TARGET.sentence, 'x')
  if (!empty.ok) pass('an empty field is reported rather than written to')
  else fail('wrote into a null field')
}

console.log(
  failures === 0
    ? '\nAll premises-rewrite checks passed.'
    : `\n${failures} premises-rewrite check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
