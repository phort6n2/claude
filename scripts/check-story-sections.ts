/**
 * Does the story-section screen catch what it has to, and leave alone what it
 * must?
 *
 *   npx tsx scripts/check-story-sections.ts
 *
 * WHY THIS IS WORTH A SCRIPT. This is the one button in the admin that asks a
 * model to write prose about a real business, and §2's first rule is never
 * invent a fact about one. The prompt forbids the inventions; the screen is
 * what makes that a guarantee rather than an instruction, and the screen is
 * the only half that can be tested without credentials.
 *
 * BOTH DIRECTIONS ARE FAILURES, and they fail in opposite ways:
 *
 * - TOO LENIENT and a fluent invention — "serving the area since 1998",
 *   "a State Farm preferred shop", "same-day mobile service" — reaches a real
 *   shop's live website in a regulated trade. Nothing goes red. The shop reads
 *   it, assumes somebody checked, and it sits there.
 * - TOO EAGER and every draft is thrown away, so the button reads as broken
 *   and the field stays empty, which is the exact state it was built to fix.
 *
 * The gated cases are the ones that matter most: a claim that is perfectly
 * true for one shop on this platform and false for the next. Those are the
 * flags §2 gates the template on, and the story field is free text that no
 * flag guards at render time.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import {
  MAX_DRAFT_SECTIONS,
  screenStory,
  storyFacts,
  storyPrompt,
  type StoryInput,
} from '@/lib/story-sections'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/** A shop with everything switched on, so only the universal rules apply. */
const FULL: StoryInput = {
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
  serviceAreas: ['Costa Mesa', 'Fountain Valley'],
  existingVoice: [],
}

const one = (heading: string, body: string) => [{ heading, body }]
const kept = (heading: string, body: string, input = FULL) =>
  screenStory(one(heading, body), input).kept.length === 1
const reasonFor = (heading: string, body: string, input = FULL) =>
  screenStory(one(heading, body), input).dropped[0]?.reason || ''

console.log('--- copy that is allowed through ---')
{
  // Trade knowledge and glass physics, which is where the substance is meant
  // to come from: public facts about the work, not claims about the business.
  const good: Array<[string, string]> = [
    [
      'Why a windshield is more than a window',
      'A modern windshield is bonded into the body and carries part of the roof load. In a rollover it helps keep the cabin from collapsing, and on most vehicles the passenger airbag deploys against it rather than straight at the passenger. That is why the bond matters as much as the glass: adhesive has to cure before the car is safe to drive, and your installer will tell you how long that is for the product used on your job.',
    ],
    [
      'What a chip does if you leave it',
      'A chip is a break in the outer layer with air trapped underneath. Heat, cold and a rough road all flex the glass around it, and the break grows along the path of least resistance until it reaches the edge. Caught early, the damage can often be filled and the glass kept. Once a crack runs into the driver’s line of sight or out to the frame, the windshield has to come out.',
    ],
    [
      'Glass work across Orange County',
      'We work across Orange County, from the coast through Costa Mesa and Fountain Valley. Our mobile unit comes to you, so the car can stay where it is parked while the work is done, and there is a shop to bring it to when that suits better.',
    ],
    [
      'How a job goes',
      'Tell us the vehicle and what the damage looks like. We will tell you whether the glass can be saved or has to be replaced, what the work involves, and what your coverage means for it. Everything is cut out, the frame is cleaned and prepped, and the new glass is set and checked before the car goes back on the road.',
    ],
  ]
  for (const [h, b] of good) {
    check(`kept: ${h}`, kept(h, b), reasonFor(h, b))
  }
}

console.log('\n--- the inventions, every one of which reads perfectly ---')
{
  const bans: Array<[string, string, RegExp]> = [
    ['Serving drivers since 1998', 'We have been fixing glass here since 1998.', /how long/],
    ['Three decades of glass', 'Over 25 years of experience behind every job.', /how long/],
    ['A family business', 'We are a family-owned shop and we treat your car like ours.', /how long/],
    ['Back on the road today', 'Most jobs are finished same-day.', /timeframe/],
    ['Fast work', 'We get your glass replaced quickly and get you moving.', /timeframe/],
    ['Thirty minutes', 'A chip repair takes about 30 minutes.', /timeframe/],
    ['Always open', 'We answer the phone 24/7.', /timeframe/],
    ['What it costs', 'Most customers pay nothing out-of-pocket once the deductible is applied.', /price or cost/],
    ['Free replacement', 'Ask about a free windshield on a comprehensive policy.', /price or cost/],
    ['Your insurer', 'We are a State Farm preferred shop.', /insurer/],
    ['Approved work', 'Our work is approved by the major carriers.', /insurer/],
    ['Leave it to us', 'We handle the insurance claim from start to finish.', /claim/],
    ['Certified installers', 'Every technician is AGSC certified.', /certification/],
    ['Covered for life', 'Every installation carries a lifetime warranty.', /warranty/],
    ['What drivers say', 'We are the top-rated glass shop in the county.', /ratings/],
    ['In their words', '“These guys saved my afternoon and the price was unbeatable.”', /customer quote/],
    ['Our team', 'Our team of twelve installers covers the whole county.', /staff/],
    ['The right glass', 'We fit OEM glass on every vehicle.', /glass they use/],
    ['Any car', 'We carry glass for all makes and models.', /glass they use/],
  ]
  for (const [h, b, want] of bans) {
    const reason = reasonFor(h, b)
    check(`dropped: ${h}`, reason !== '', 'it was kept')
    check(`  and says why (${want})`, want.test(reason), reason)
  }
  // The reason has to carry the words that tripped it. "A section was removed"
  // is unactionable; the operator cannot tell a real rule from a bad regex.
  check(
    'the reason quotes the offending words',
    /“1998”|“since 1998”/.test(reasonFor('x', 'We have been here since 1998.')),
    reasonFor('x', 'We have been here since 1998.')
  )
}

console.log('\n--- the traps: words that look like a claim and are not ---')
{
  // Each of these cost a good paragraph while this screen was being written.
  // Being too eager here is how the button comes to look broken, and a broken
  // button leaves the field empty, which is the state it exists to fix.
  const traps: Array<[string, string]> = [
    // The single most useful sentence on the page, and "bonded" was reading as
    // the tradesman's "licensed and bonded".
    ['bonded into the body', 'The glass is bonded into the body and carries part of the roof load.'],
    ['an adhesive bond', 'The urethane bond is what makes the glass structural.'],
    ['recalibration, for a shop that calibrates', 'Cameras behind the glass need recalibration afterwards.'],
    ['insurance without a claim promise', 'We will tell you what your coverage means for the job before any work starts.'],
    ['the trade word repair', 'Some damage can be repaired and some cannot.'],
    ['weather and roads', 'Cold mornings and hot afternoons flex glass that already has a break in it.'],
    ['the word best outside a ranking', 'The best time to deal with a chip is the week you notice it.'],
  ]
  for (const [label, body] of traps) {
    check(`not a claim: ${label}`, kept('Heading', body), reasonFor('Heading', body))
  }
  // But the boilerplate pairing it was confused with still has to go.
  check(
    'and "licensed and bonded" is still caught',
    !kept('Who we are', 'We are licensed and bonded.'),
    'the tradesman boilerplate got through'
  )
}

console.log('\n--- the gated claims: true for one shop, false for the next ---')
{
  const noMobile: StoryInput = { ...FULL, offersMobileService: false }
  check(
    'mobile copy is dropped for a shop with no mobile unit',
    !kept('We come to you', 'Our mobile unit meets you at home or at work.', noMobile)
  )
  check(
    'and the same copy is fine for a shop that has one',
    kept('We come to you', 'Our mobile unit meets you at home or at work.', FULL)
  )

  const noShop: StoryInput = { ...FULL, hasShopLocation: false }
  check(
    'an invitation to the premises is dropped when there are none',
    !kept('Come by', 'Drop the car off at our shop and wait in the waiting room.', noShop)
  )

  const noSms: StoryInput = { ...FULL, smsCapable: false }
  check(
    'a text-us-a-photo path is dropped for a landline',
    !kept('Send a picture', 'Text us a photo of the damage and we will tell you what it needs.', noSms)
  )
  check(
    'and kept for a number that can receive one',
    kept('Send a picture', 'Text us a photo of the damage and we will tell you what it needs.', FULL)
  )

  // "We handle the claim" is banned for EVERY shop, flag or no flag: the one
  // that does deal with the carrier has that sentence already, in the
  // compliance-reviewed insurance band.
  check(
    'claim-handling stays banned even with filesInsuranceClaims on',
    !kept('Insurance', 'We file the claim for you.', FULL)
  )

  const noAdas: StoryInput = {
    ...FULL,
    services: { ...FULL.services, offersAdasCalibration: false },
  }
  check(
    'calibration copy is dropped for a shop that does not calibrate',
    !kept('Cameras and sensors', 'We recalibrate the forward camera after every replacement.', noAdas)
  )
  check(
    'and a shop that does keeps it',
    kept('Cameras and sensors', 'We recalibrate the forward camera after every replacement.', FULL)
  )

  const noSunroof: StoryInput = {
    ...FULL,
    services: { ...FULL.services, offersSunroofRepair: false },
  }
  check(
    'sunroof copy is dropped when sunroofs are off',
    !kept('Glass overhead', 'Cracked sunroof glass is replaced the same way.', noSunroof)
  )

  // THE TWO-FLAGS-ONE-JOB CASE. Rock chip repair and windshield repair are the
  // same resin injection, and the chip paragraph is the most useful thing on
  // the page. Screening it on either flag alone would throw it away over a
  // distinction the shop does not make itself.
  const chipOnlyRepair: StoryInput = {
    ...FULL,
    services: { ...FULL.services, offersRockChipRepair: false },
  }
  check(
    'a chip paragraph survives when windshield repair is still on',
    kept('What a chip does', 'A chip left alone spreads into a crack.', chipOnlyRepair),
    reasonFor('What a chip does', 'A chip left alone spreads into a crack.', chipOnlyRepair)
  )
  const noRepairAtAll: StoryInput = {
    ...FULL,
    services: {
      ...FULL.services,
      offersRockChipRepair: false,
      offersWindshieldRepair: false,
    },
  }
  check(
    'and is dropped when the shop repairs nothing, only replaces',
    !kept('What a chip does', 'A chip left alone spreads into a crack.', noRepairAtAll)
  )
}

console.log('\n--- the shape of the result ---')
{
  const sections = [
    { heading: 'Good one', body: 'A windshield is bonded into the body and carries load.' },
    { heading: 'Bad one', body: 'Serving the area since 1998.' },
    { heading: 'Good one', body: 'A duplicate heading, which should not survive twice.' },
    { heading: '', body: 'No heading at all.' },
    { heading: 'Third', body: 'Adhesive needs time to cure before the car is safe to drive.' },
    { heading: 'Fourth', body: 'Glass is cut out, the frame is cleaned, the new panel is set.' },
    { heading: 'Fifth', body: 'Road debris and temperature swings are what break glass.' },
  ]
  const res = screenStory(sections, FULL)
  check(`no more than ${MAX_DRAFT_SECTIONS} kept`, res.kept.length <= MAX_DRAFT_SECTIONS, `${res.kept.length}`)
  check('the invention is reported, not silently missing', res.dropped.some((d) => d.heading === 'Bad one'))
  check('a repeated heading is dropped', res.dropped.some((d) => /repeats a heading/.test(d.reason)))
  check('an empty section is reported', res.dropped.some((d) => /came back empty/.test(d.reason)))
  check(
    'every kept section has an empty photoUrl, which means the gallery fallback',
    res.kept.every((c) => c.photoUrl === '')
  )
  check('nothing kept is blank', res.kept.every((c) => c.heading.trim() && c.body.trim()))
  // Garbage in must not throw: this runs over whatever a model returned.
  const junk = screenStory(
    [{ heading: 5 as unknown as string }, {}, { body: null }] as Array<Record<string, unknown>>,
    FULL
  )
  check('junk from the model is dropped rather than thrown', junk.kept.length === 0 && junk.dropped.length === 3)
}

console.log('\n--- the prompt carries the facts and not the absences ---')
{
  const facts = storyFacts(FULL)
  check('it names the area the headlines use', facts.some((f) => /Orange County/.test(f)))
  check('it lists the work they do', facts.some((f) => /Work they do:/.test(f)))

  const lean: StoryInput = {
    ...FULL,
    marketArea: null,
    offersMobileService: false,
    hasShopLocation: false,
    filesInsuranceClaims: false,
    smsCapable: false,
    services: { ...FULL.services, offersSunroofRepair: false, offersAdasCalibration: false },
  }
  const leanFacts = storyFacts(lean).join('\n')
  check('with no market area it falls back to the city', /Huntington Beach, CA/.test(leanFacts))
  check('an off flag is stated as a prohibition, not omitted', /NO mobile service/.test(leanFacts))
  check('so is the claims flag', /do NOT file claims/.test(leanFacts))
  check('so is SMS', /CANNOT receive texts/.test(leanFacts))
  check('and services not offered are named as off limits', /must not be mentioned/.test(leanFacts))

  const prompt = storyPrompt(FULL)
  check('the prompt asks for the cap, not "some"', prompt.includes(`Write ${MAX_DRAFT_SECTIONS} sections`))
  for (const word of ['deductible', 'same day', 'certifications', 'warranty', 'OEM', 'years in business']) {
    check(`the prompt names "${word}" as forbidden`, prompt.toLowerCase().includes(word.toLowerCase()))
  }
  check('it asks for JSON only', /Return ONLY a JSON array/.test(prompt))
  check(
    'their own voice is included when there is some',
    storyPrompt({ ...FULL, existingVoice: ['We are a two-bay shop off Beach Blvd.'] }).includes(
      'two-bay shop'
    )
  )
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
