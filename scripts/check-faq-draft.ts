/**
 * Does the FAQ drafter stay out of the way of the FAQ the site already has?
 *
 *   npx tsx scripts/check-faq-draft.ts
 *
 * WHY THIS IS WORTH A SCRIPT, AND WHY IT IS NOT THE SAME SCRIPT AS THE STORY
 * SECTIONS. The claim rules are shared (`copy-claims.ts`, covered by
 * check-story-sections.ts). What is unique here is that THE FAQ IS NOT EMPTY
 * WHEN THE FIELD IS EMPTY: site-faq.ts already answers up to four questions on
 * every site, from copy that has been compliance-reviewed, and the deductible
 * answer is built per state from insurance-rules.ts.
 *
 * withDefaultFaq puts a shop's own questions first and fills in behind them,
 * dropping any default the shop has already asked. So a draft that wanders
 * onto one of those four topics breaks the FAQ in one of two silent ways:
 *
 * - SAME WORDING: the dedupe fires and throws away the REVIEWED answer,
 *   leaving an unreviewed one about insurance on a live site.
 * - A PARAPHRASE: the dedupe misses, and the page asks the same question twice
 *   and answers it twice, once reviewed and once not — worse than either.
 *
 * Neither shows up as an error anywhere. The only symptom is a FAQ that reads
 * slightly oddly, on one shop's site, months later.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import { MAX_DRAFT_FAQS, faqPrompt, screenFaq, type FaqInput } from '@/lib/faq-draft'
import { defaultFaq } from '@/lib/site-faq'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const FULL: FaqInput = {
  businessName: 'Auto Glass Kings',
  city: 'Huntington Beach',
  state: 'CA',
  marketArea: 'Orange County',
  hasShopLocation: true,
  offersMobileService: true,
  filesInsuranceClaims: true,
  smsCapable: true,
  services: {
    offersWindshieldReplacement: true,
    offersWindshieldRepair: true,
    offersRockChipRepair: true,
    offersSideWindowRepair: true,
    offersBackWindowRepair: true,
    offersSunroofRepair: true,
    offersAdasCalibration: true,
  },
  existingVoice: [],
  existingQuestions: [],
}

const one = (q: string, a: string) => [{ q, a }]
const kept = (q: string, a: string, input = FULL) => screenFaq(one(q, a), input).kept.length === 1
const reasonFor = (q: string, a: string, input = FULL) =>
  screenFaq(one(q, a), input).dropped[0]?.reason || ''

console.log('--- questions worth asking, which must survive ---')
{
  const good: Array<[string, string]> = [
    [
      'What do you need from me to give a price?',
      'The year, make and model, which piece of glass it is, and a photo of the damage if you can manage one. The vehicle tells us what the glass costs and whether there is anything mounted behind it that matters. With those we can give you a real number rather than a range.',
    ],
    [
      'Is it safe to drive as soon as the work is done?',
      'Not immediately after a replacement. The adhesive that bonds the glass to the body has to reach enough strength to hold it, and your installer will tell you the exact figure for the product used on your job before they hand the keys back. On a repair there is nothing to wait for.',
    ],
    [
      'Can I run it through a car wash afterwards?',
      'Give it a few days and skip the high-pressure jets over the edge of the glass and the trim. Rain is fine. A pressure washer aimed straight at a fresh bond is the one thing worth avoiding, along with slamming the doors, which spikes the pressure inside the car.',
    ],
    [
      'The back glass shattered everywhere. What happens to all that?',
      'Tempered glass is built to break into blunt fragments rather than shards, which is safer and much messier. Those fragments get everywhere — seat rails, door cards, the boot. We clear out what we can reach when we fit the new panel, and you will still find the odd piece for a while.',
    ],
    [
      'Do you come to me or do I come to you?',
      'Either. Our mobile unit can meet you where the car is parked, and there is a shop to bring it to if that suits better. Which one is easier usually depends on the job and where the car is sitting.',
    ],
    [
      'What makes a crack impossible to repair?',
      'Length, position and depth. Damage longer than a dollar bill, sitting in the driver’s line of sight, running out to the edge of the glass or through to the inner layer is past repairing — the glass has lost the integrity a repair depends on. At that point it comes out.',
    ],
  ]
  for (const [q, a] of good) {
    check(`kept: ${q}`, kept(q, a), reasonFor(q, a))
  }
}

console.log('\n--- THE POINT: the four the site already answers ---')
{
  // Verbatim first. These dedupe in withDefaultFaq, which means the REVIEWED
  // answer is the one that loses — the worst of the two outcomes.
  for (const item of defaultFaq({ state: 'CA', offersAdasCalibration: true, offersWindshieldRepair: true })) {
    const reason = reasonFor(item.q, 'Some unreviewed answer about it.')
    check(`dropped verbatim: ${item.q}`, reason !== '', 'it was kept, and would replace the reviewed answer')
  }

  // Then the paraphrases, which is the case the dedupe CANNOT catch.
  const paraphrases: Array<[string, RegExp]> = [
    ['Will my insurance rates go up if I claim?', /rates/],
    ['Will this affect my premium?', /rates/],
    ['Does my insurance cover a new windshield?', /insurance versus/],
    // Either reason is right and both drop it: the claim screen runs first and
    // "cheaper" is a price claim before it is a taken topic.
    ['Is it cheaper to pay cash?', /insurance versus|price or cost/],
    ['What is my out-of-pocket cost?', /insurance versus/],
    ['Can a chip be repaired or does the glass need replacing?', /repair versus/],
    ['Can it be repaired?', /repair versus/],
    ['Does my car need a recalibration after the glass is replaced?', /recalibration/],
    ['What about the camera behind the windshield?', /recalibration/],
  ]
  for (const [q, want] of paraphrases) {
    const reason = reasonFor(q, 'An answer that reads perfectly well.')
    check(`dropped paraphrase: ${q}`, reason !== '', 'it was kept, so the page now asks this twice')
    check(`  and names the topic (${want})`, want.test(reason), reason)
  }

  // Judged on the QUESTION, not the answer: an answer that happens to mention
  // a camera in passing is not an answer to the recalibration question, and
  // dropping it would throw away good copy for no gain.
  check(
    'a passing mention in an ANSWER is not a topic collision',
    kept(
      'What do you need from me to give a price?',
      'The year, make and model tells us whether there is a camera mounted behind the glass, which changes what the job involves.'
    ),
    reasonFor(
      'What do you need from me to give a price?',
      'The year, make and model tells us whether there is a camera mounted behind the glass, which changes what the job involves.'
    )
  )
}

console.log('\n--- a topic stops being taken when the site stops answering it ---')
{
  // The defaults are conditional: no ADAS, no recalibration answer. The
  // screen has to follow site-faq.ts rather than hold a list of its own.
  const noAdas: FaqInput = {
    ...FULL,
    services: { ...FULL.services, offersAdasCalibration: false },
  }
  const q = 'Does my car need a recalibration after the glass is replaced?'
  check(
    'still dropped with ADAS off, because the shop does not do it at all',
    !kept(q, 'An answer about recalibration.', noAdas),
    'a shop that does not calibrate must not answer questions about calibrating'
  )
  // And the repair default disappears when the shop only replaces.
  const replaceOnly: FaqInput = {
    ...FULL,
    services: { ...FULL.services, offersWindshieldRepair: false, offersRockChipRepair: false },
  }
  const defaults = defaultFaq({
    state: 'CA',
    offersAdasCalibration: false,
    offersWindshieldRepair: false,
  })
  check(
    'the site drops its repair answer for a replace-only shop',
    !defaults.some((f) => /repaired instead/.test(f.q)),
    JSON.stringify(defaults.map((f) => f.q))
  )
  check(
    'and the drafter still refuses to write one',
    !kept('Can my windshield be repaired?', 'An answer about repairing.', replaceOnly)
  )
}

console.log('\n--- the shared claim rules apply here too ---')
{
  const bans: Array<[string, string, RegExp]> = [
    ['How long have you been doing this?', 'We have been fixing glass here since 1998.', /how long/],
    ['How fast can you do it?', 'Most jobs are finished same-day.', /timeframe/],
    ['How long until I can drive?', 'About 60 minutes for the adhesive to cure.', /timeframe/],
    ['What does it cost?', 'Most customers pay nothing out of pocket after the deductible.', /price or cost/],
    ['Are you certified?', 'Every technician is AGSC certified.', /certification/],
    ['Is the work guaranteed?', 'Every installation carries a lifetime warranty.', /warranty/],
    ['Is it illegal to drive with a crack?', 'In California a cracked windshield is illegal.', /law/],
    ['Will it fail inspection?', 'A crack that size will fail an inspection.', /law/],
    ['How do I reach you?', 'Easiest way to find out is just to call: (949) 775-1661.', /phone number/],
    ['Where do I send photos?', 'Email them to quotes@example.com.', /address or a link/],
  ]
  for (const [q, a, want] of bans) {
    const reason = reasonFor(q, a)
    check(`dropped: ${q}`, reason !== '', 'it was kept')
    check(`  and says why (${want})`, want.test(reason), reason)
  }
  // THE ONE THE ROGUE-NUMBER CHECK EXISTS FOR. A number a model writes is
  // either invented or somebody else's, and it is a paid click landing on a
  // line nothing records — the daily sweep would file it tomorrow morning.
  check(
    'a phone number is never draftable, however it is written',
    !kept('Can I call?', 'Reach us on 949-775-1661 any time.') &&
      !kept('Can I call?', 'Reach us on (949) 775 1661.')
  )
}

console.log('\n--- the gated flags, in FAQ form ---')
{
  const noMobile: FaqInput = { ...FULL, offersMobileService: false }
  check(
    'a mobile answer is dropped for a shop with no mobile unit',
    !kept('Do you come to me?', 'Our mobile unit meets you at home or at work.', noMobile)
  )
  const noSms: FaqInput = { ...FULL, smsCapable: false }
  check(
    'a text-us answer is dropped for a landline',
    !kept('How do I send a photo?', 'Text us a photo of the damage.', noSms)
  )
  const noShop: FaqInput = { ...FULL, hasShopLocation: false }
  check(
    'an answer pointing at premises is dropped when there are none',
    !kept('Can I wait while you do it?', 'There is a waiting room at our shop.', noShop)
  )
}

console.log('\n--- a second press adds rather than repeats ---')
{
  const already: FaqInput = {
    ...FULL,
    existingQuestions: ['What do you need from me to give a price?'],
  }
  check(
    'a question already in the field is dropped',
    !kept('What do you need from me to give a price?', 'An answer.', already)
  )
  check(
    'and the prompt tells the model what is already there',
    faqPrompt(already).includes('ALSO ALREADY IN THE FAQ'),
  )
  const res = screenFaq(
    [
      { q: 'Do I need to be there?', a: 'Somebody with the keys does, and that is all.' },
      { q: 'Do I need to be there?', a: 'A duplicate, which should not survive twice.' },
      { q: '', a: 'No question at all.' },
    ],
    FULL
  )
  check('a repeated question is dropped', res.dropped.some((d) => /repeats a question/.test(d.reason)))
  check('an empty one is reported', res.dropped.some((d) => /came back empty/.test(d.reason)))
  check('and the good one survives', res.kept.length === 1)

  const many = Array.from({ length: 20 }, (_, i) => ({
    q: `Question number ${i} about glass`,
    a: 'Tempered glass breaks into blunt fragments rather than shards.',
  }))
  check(`no more than ${MAX_DRAFT_FAQS} kept`, screenFaq(many, FULL).kept.length === MAX_DRAFT_FAQS)
}

console.log('\n--- the prompt ---')
{
  const prompt = faqPrompt(FULL)
  // The defaults are read from site-faq.ts rather than restated here, so a
  // fifth default cannot appear on the site and be invisible to the drafter.
  for (const item of defaultFaq({ state: 'CA', offersAdasCalibration: true, offersWindshieldRepair: true })) {
    check(`the prompt lists "${item.q.slice(0, 34)}…" as taken`, prompt.includes(item.q))
  }
  check('it says a rephrasing is worse than a repeat', /rephrasing is worse/.test(prompt))
  check('it names the area the headlines use', prompt.includes('Orange County'))
  for (const word of ['deductible', 'same day', 'phone number', 'the law', 'warranty']) {
    check(`the prompt names "${word}" as forbidden`, prompt.toLowerCase().includes(word.toLowerCase()))
  }
  // The honest answer to "when can I drive?" involves a duration nobody here
  // may state, so the prompt has to say what to do instead of just "no".
  check(
    'it says what to do about cure time instead of only banning it',
    /installer gives you the exact figure/.test(prompt)
  )
  check('it asks for JSON only', /Return ONLY a JSON array/.test(prompt))

  const lean = faqPrompt({ ...FULL, offersMobileService: false, smsCapable: false, filesInsuranceClaims: false })
  check('an off flag is a prohibition, not an omission', /NO mobile service/.test(lean))
  check('so is SMS', /CANNOT receive texts/.test(lean))
  check('so is claim filing', /do NOT file claims/.test(lean))
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
