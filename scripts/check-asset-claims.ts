/**
 * Do the ad assets say things this app knows to be untrue?
 *
 *   npx tsx scripts/check-asset-claims.ts
 *
 * WHY THIS IS WORTH A SCRIPT. The asset audit next door COUNTS assets and has
 * never read a word of them, so an account passes coverage with a full set of
 * sitelinks and callouts advertising work the shop does not do, a warranty the
 * site never defines, and a phone number nothing records. Nothing in Google's
 * interface objects to any of it — the assets are approved and eligible.
 *
 * THE HARD PART IS NOT FINDING CLAIMS, IT IS NOT CRYING WOLF. An operator
 * wrote this copy for one named shop, so "same-day appointments" may be
 * perfectly true and `copy-claims.ts`-style bans would file dozens of findings
 * nobody can act on. Every rule here needs a fact on OUR side that
 * contradicts the ad, and the fixture below is MAG Mobile's real asset list —
 * the whole thing, verbatim — because the most valuable property of this check
 * is what it stays SILENT about.
 *
 * There is no test runner in this repo. This is a script on purpose.
 */
import {
  assetClaimProblems,
  evaluateAssetClaims,
  type AdCopyLine,
  type ClaimFacts,
} from '@/lib/google-ads-asset-claims'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/** MAG Mobile as the client record has them: Florida, mobile, everything on. */
const MAG: ClaimFacts = {
  state: 'FL',
  serviceAreas: [
    'Orlando',
    'Kissimmee',
    'Sanford',
    'Deltona',
    'Apopka',
    'Winter Park',
    'Clermont',
    'Leesburg',
  ],
  shopCities: [],
  offersMobileService: true,
  filesInsuranceClaims: true,
  smsCapable: true,
  hasWarrantyTerms: true,
  services: {
    offersWindshieldReplacement: true,
    offersWindshieldRepair: true,
    offersRockChipRepair: true,
    offersSideWindowRepair: true,
    offersBackWindowRepair: true,
    offersSunroofRepair: true,
    offersAdasCalibration: true,
  },
  knownPhones: ['(689) 366-6860'],
  medianResponseMinutes: null,
}

/** MAG's live asset list, as pasted out of the Google Ads interface. */
const MAG_ASSETS: AdCopyLine[] = [
  { where: 'Structured snippet (Service catalog)', text: 'Orlando' },
  { where: 'Structured snippet (Service catalog)', text: 'Kissimmee' },
  { where: 'Structured snippet (Service catalog)', text: 'Sanford' },
  { where: 'Structured snippet (Service catalog)', text: 'Deltona' },
  { where: 'Structured snippet (Service catalog)', text: 'Apopka' },
  { where: 'Structured snippet (Service catalog)', text: 'Winter Park' },
  { where: 'Structured snippet (Service catalog)', text: 'Clermont' },
  { where: 'Structured snippet (Service catalog)', text: 'Leesburg' },
  { where: 'Structured snippet (Services)', text: 'Windshield Replacement' },
  { where: 'Structured snippet (Services)', text: 'Rock Chip Repair' },
  { where: 'Structured snippet (Services)', text: 'Side Window Replacement' },
  { where: 'Structured snippet (Services)', text: 'Back Glass Replacement' },
  { where: 'Structured snippet (Services)', text: 'Sunroof Repair' },
  { where: 'Structured snippet (Services)', text: 'ADAS Calibration' },
  { where: 'Sitelink “Windshield Replacement”', text: 'Windshield Replacement' },
  { where: 'Sitelink “Windshield Replacement” line 1', text: 'Mobile, same day service' },
  { where: 'Sitelink “Windshield Replacement” line 2', text: '$0 with most FL insurance' },
  { where: 'Sitelink “Windshield Repair”', text: 'Windshield Repair' },
  { where: 'Sitelink “Windshield Repair” line 1', text: 'Chips and cracks repaired' },
  { where: 'Sitelink “Windshield Repair” line 2', text: 'Done in about 30 minutes' },
  { where: 'Sitelink “Back Glass Replacement”', text: 'Back Glass Replacement' },
  { where: 'Sitelink “Back Glass Replacement” line 1', text: 'Rear windshield and defroster' },
  { where: 'Sitelink “Back Glass Replacement” line 2', text: 'Cars, trucks and SUVs' },
  { where: 'Sitelink “Rock Chip Repair”', text: 'Rock Chip Repair' },
  { where: 'Sitelink “Rock Chip Repair” line 1', text: 'Fix it before it spreads' },
  { where: 'Sitelink “Rock Chip Repair” line 2', text: 'Often covered by insurance' },
  { where: 'Sitelink “Auto Glass Orlando”', text: 'Auto Glass Orlando' },
  { where: 'Sitelink “Auto Glass Orlando” line 1', text: 'Mobile service in Orlando' },
  { where: 'Sitelink “Auto Glass Orlando” line 2', text: 'Same-day appointments' },
  { where: 'Sitelink “Sunroof Repair”', text: 'Sunroof Repair' },
  { where: 'Sitelink “Sunroof Repair” line 1', text: 'Leaking or stuck sunroofs' },
  { where: 'Sitelink “Sunroof Repair” line 2', text: 'Glass, tracks and seals' },
  { where: 'Sitelink “ADAS Calibration”', text: 'ADAS Calibration' },
  { where: 'Sitelink “ADAS Calibration” line 1', text: 'Done in your driveway' },
  { where: 'Sitelink “ADAS Calibration” line 2', text: 'No dealership trip needed' },
  { where: 'Sitelink “Get A Free Quote”', text: 'Get A Free Quote' },
  { where: 'Sitelink “Get A Free Quote” line 1', text: 'Text back in 5 minutes' },
  { where: 'Sitelink “Get A Free Quote” line 2', text: 'No obligation, no pressure' },
  { where: 'Sitelink “Side Window Replacement”', text: 'Side Window Replacement' },
  { where: 'Sitelink “Side Window Replacement” line 1', text: 'Door and quarter glass' },
  { where: 'Sitelink “Side Window Replacement” line 2', text: 'Break-in cleanup included' },
  { where: 'Sitelink “Auto Glass Kissimmee”', text: 'Auto Glass Kissimmee' },
  { where: 'Sitelink “Auto Glass Kissimmee” line 1', text: 'Mobile service in Kissimmee' },
  { where: 'Sitelink “Auto Glass Kissimmee” line 2', text: 'Same-day appointments' },
  { where: 'Callout', text: 'OEM-Quality Glass' },
  { where: 'Callout', text: 'Same-Day Appointments' },
  { where: 'Callout', text: 'Open 7 Days A Week' },
  { where: 'Callout', text: '$0 With Most FL Insurance' },
  { where: 'Callout', text: 'We File Your Claim Free' },
  { where: 'Callout', text: 'Lifetime Warranty' },
  { where: 'Callout', text: 'We Come To You' },
  { where: 'Callout', text: 'ADAS Calibration Included' },
  { where: 'Call asset', text: '(689) 366-6860' },
]

console.log('--- MAG as configured: the whole list should pass ---')
{
  const problems = assetClaimProblems(MAG_ASSETS, MAG)
  check(
    'nothing is flagged',
    problems.length === 0,
    problems.map((p) => `${p.where}: ${p.text} → ${p.problem.slice(0, 70)}`).join(' | ')
  )
  // THE WHOLE DESIGN IN ONE ASSERTION. Their copy is full of timing and price
  // language, and an operator wrote every word of it for this one shop. A
  // check that fired on "same day service" would be filing findings against
  // the truth, and the account would be red forever.
  check(
    'a timing promise alone is not a finding',
    assetClaimProblems([{ where: 'Callout', text: 'Same-Day Appointments' }], MAG).length === 0
  )
  check(
    'nor is "Done in about 30 minutes"',
    assetClaimProblems([{ where: 'Sitelink line', text: 'Done in about 30 minutes' }], MAG).length === 0
  )
  check(
    'nor "OEM-Quality Glass", which is the careful wording',
    assetClaimProblems([{ where: 'Callout', text: 'OEM-Quality Glass' }], MAG).length === 0
  )
}

console.log('\n--- the Florida deductible claim, which is the subtle one ---')
{
  // FL law removes the deductible on a WINDSHIELD, so the callout stands.
  check(
    '"$0 With Most FL Insurance" is fine in Florida',
    assetClaimProblems([{ where: 'Callout', text: '$0 With Most FL Insurance' }], MAG).length === 0
  )
  // The same words in a state with no such law are the §2 offer.
  const texas: ClaimFacts = { ...MAG, state: 'TX' }
  const inTexas = assetClaimProblems([{ where: 'Callout', text: '$0 with most insurance' }], texas)
  check('the same claim in Texas is an ALERT', inTexas[0]?.severity === 'ALERT', JSON.stringify(inTexas))
  check(
    'and it cites the rule rather than the phrase',
    /no automatic no-deductible rule/.test(inTexas[0]?.problem || ''),
    inTexas[0]?.problem
  )

  /* THE HALF OF THE STATE RULE THAT GETS LOST, and nothing but this pairing
     could catch it: Florida's statute covers the windshield specifically, so
     the identical callout attached to back glass is wrong — and in MAG's own
     list the windshield sitelink and the back-glass sitelink sit next to each
     other reading the same way. */
  const backGlass = assetClaimProblems(
    [{ where: 'Sitelink “Back Glass Replacement” line 2', text: '$0 with most FL insurance' }],
    MAG
  )
  check('a $0 claim on BACK GLASS in Florida is caught', backGlass.length === 1, JSON.stringify(backGlass))
  check(
    'and it explains the statute is windshield-only',
    /WINDSHIELD/.test(backGlass[0]?.problem || ''),
    backGlass[0]?.problem
  )
  check(
    'while the same claim on the windshield sitelink is not',
    assetClaimProblems(
      [{ where: 'Sitelink “Windshield Replacement” line 2', text: '$0 with most FL insurance' }],
      MAG
    ).length === 0
  )
}

console.log('\n--- the per-shop flags, which is where ad copy escapes ---')
{
  const noClaims: ClaimFacts = { ...MAG, filesInsuranceClaims: false }
  const filed = assetClaimProblems([{ where: 'Callout', text: 'We File Your Claim Free' }], noClaims)
  check('"We File Your Claim Free" with the flag off is an ALERT', filed[0]?.severity === 'ALERT')
  check(
    'and it names the flag',
    /filesInsuranceClaims/.test(filed[0]?.problem || ''),
    filed[0]?.problem
  )

  const noMobile: ClaimFacts = { ...MAG, offersMobileService: false }
  check(
    '"We Come To You" with no mobile unit is flagged',
    assetClaimProblems([{ where: 'Callout', text: 'We Come To You' }], noMobile).length === 1
  )
  check(
    'so is "Mobile service in Orlando"',
    assetClaimProblems([{ where: 'Sitelink line', text: 'Mobile service in Orlando' }], noMobile).length === 1
  )
  check(
    'so is "Done in your driveway"',
    assetClaimProblems([{ where: 'Sitelink line', text: 'Done in your driveway' }], noMobile).length === 1
  )

  const noSms: ClaimFacts = { ...MAG, smsCapable: false }
  const texted = assetClaimProblems([{ where: 'Sitelink line', text: 'Text back in 5 minutes' }], noSms)
  check('"Text back in 5 minutes" to a landline is an ALERT', texted[0]?.severity === 'ALERT', JSON.stringify(texted))

  const noWarranty: ClaimFacts = { ...MAG, hasWarrantyTerms: false }
  const warranty = assetClaimProblems([{ where: 'Callout', text: 'Lifetime Warranty' }], noWarranty)
  check('"Lifetime Warranty" with no terms on the site is flagged', warranty.length === 1)
  check(
    'and it says where to put the terms',
    /Website tab/.test(warranty[0]?.problem || ''),
    warranty[0]?.problem
  )
  check(
    'and it stays quiet once the site states them',
    assetClaimProblems([{ where: 'Callout', text: 'Lifetime Warranty' }], MAG).length === 0
  )

  const noSunroof: ClaimFacts = {
    ...MAG,
    services: { ...MAG.services, offersSunroofRepair: false },
  }
  check(
    'a sunroof sitelink for a shop that does not do sunroofs is flagged',
    assetClaimProblems([{ where: 'Sitelink “Sunroof Repair”', text: 'Sunroof Repair' }], noSunroof).length === 1
  )
  const noAdas: ClaimFacts = {
    ...MAG,
    services: { ...MAG.services, offersAdasCalibration: false },
  }
  check(
    'so is an ADAS callout',
    assetClaimProblems([{ where: 'Callout', text: 'ADAS Calibration Included' }], noAdas).length === 1
  )
}

console.log('\n--- the phone number, which is the rogue-number bug in the ad account ---')
{
  const wrong = assetClaimProblems([{ where: 'Call asset', text: '(949) 775-1661' }], MAG)
  check('a number that is not theirs is an ALERT', wrong[0]?.severity === 'ALERT', JSON.stringify(wrong))
  check(
    'and it says why that matters — the call is not recorded',
    /does not record/.test(wrong[0]?.problem || ''),
    wrong[0]?.problem
  )
  check('their own number passes', assetClaimProblems([{ where: 'Call asset', text: '(689) 366-6860' }], MAG).length === 0)
  check(
    'any format of their own number passes',
    assetClaimProblems([{ where: 'Call asset', text: '+1 689-366-6860' }], MAG).length === 0
  )
  // A tracking number this app bought is theirs too — that is the whole point
  // of buying it.
  const tracked: ClaimFacts = { ...MAG, knownPhones: ['(689) 366-6860', '+14075550123'] }
  check(
    'a tracking number this app bought passes',
    assetClaimProblems([{ where: 'Call asset', text: '(407) 555-0123' }], tracked).length === 0
  )
}

console.log('\n--- a promise the shop is not keeping, by their own data ---')
{
  // The ONE timing claim worth checking, because it is measured rather than
  // judged: response-time.ts, median from Lead.firstTouchedAt.
  const slow: ClaimFacts = { ...MAG, medianResponseMinutes: 184 }
  const late = assetClaimProblems([{ where: 'Sitelink line', text: 'Text back in 5 minutes' }], slow)
  check('a 5-minute promise against a 184-minute median is flagged', late.length === 1, JSON.stringify(late))
  check('and both numbers are in the message', /5 minutes/.test(late[0]?.problem || '') && /184/.test(late[0]?.problem || ''))
  // Not eager: twice the promise is still a shop answering fast, and a
  // finding there would be argued with correctly.
  const ok = { ...MAG, medianResponseMinutes: 9 }
  check(
    'nine minutes against a five-minute promise is not a finding',
    assetClaimProblems([{ where: 'Sitelink line', text: 'Text back in 5 minutes' }], ok).length === 0
  )
  check(
    'and with no measurement it says nothing at all',
    assetClaimProblems([{ where: 'Sitelink line', text: 'Text back in 5 minutes' }], MAG).length === 0
  )
}

console.log('\n--- one finding per problem, not per asset ---')
{
  const noMobile: ClaimFacts = { ...MAG, offersMobileService: false }
  const problems = assetClaimProblems(MAG_ASSETS, noMobile)
  const drafts = evaluateAssetClaims(problems, { businessName: 'MAG Mobile Auto Glass' })
  check('several mobile assets produce ONE finding', drafts.length === 1, JSON.stringify(drafts.map((d) => d.title)))
  check('which counts them in the title', /\d+ ad assets/.test(drafts[0]?.title || ''), drafts[0]?.title)
  check(
    'and lists every one in the evidence',
    Array.isArray((drafts[0]?.evidence as { assets?: unknown[] })?.assets) &&
      ((drafts[0]?.evidence as { assets: unknown[] }).assets.length ?? 0) > 1
  )
  // The entity is the PROBLEM, so a condition that persists is one row whose
  // lastSeenAt moves rather than a fresh finding every week.
  check('the entity is stable across runs', drafts[0]?.entity === evaluateAssetClaims(problems, { businessName: 'MAG Mobile Auto Glass' })[0]?.entity)
  check('nothing wrong produces no findings', evaluateAssetClaims([], { businessName: 'x' }).length === 0)
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
