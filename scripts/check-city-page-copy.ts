/**
 * What a city page's H1, lead-in and meta description say the shop does, and
 * the AGS city-page patch's promises about itself.
 *
 *   npx tsx scripts/check-city-page-copy.ts
 *
 * Silent cases first: a shop with a repair service ticked keeps the headline
 * it always had, word for word.
 */
import { cityHeadline, cityMetaDescription, windshieldWork } from '../src/lib/city-page-copy'
import { claimProblem } from '../src/lib/copy-claims'
import { AGS_2026_10_CITIES } from '../src/lib/content-patches/ags-2026-10-cities'
import { CONTENT_PATCHES } from '../src/lib/content-patches'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

const both = { offersWindshieldRepair: true, offersRockChipRepair: true, offersWindshieldReplacement: true }

console.log('\nA SHOP THAT REPAIRS KEEPS ITS HEADLINE')
check(cityHeadline(windshieldWork(both), 'Dallas') === 'Windshield repair and replacement in Dallas', 'both ticked: unchanged H1')
check(
  windshieldWork({ ...both, offersWindshieldRepair: false }) === 'repair and replacement',
  'rock chip repair alone still counts as repair (same resin injection)'
)
check(
  windshieldWork({ ...both, offersRockChipRepair: false }) === 'repair and replacement',
  'windshield repair alone still counts as repair'
)
check(
  windshieldWork({ offersWindshieldRepair: false, offersRockChipRepair: false, offersWindshieldReplacement: false }) === 'repair and replacement',
  'a half-filled record (nothing ticked) reads as it always did'
)

console.log('\nA REPLACEMENT-ONLY SHOP NEVER SAYS "REPAIR"')
const ags = { offersWindshieldRepair: false, offersRockChipRepair: false, offersWindshieldReplacement: true }
const work = windshieldWork(ags)
check(cityHeadline(work, 'Port Moody') === 'Windshield Replacement in Port Moody', 'H1 is "Windshield Replacement in Port Moody"')
const desc = cityMetaDescription({
  work,
  area: 'Coquitlam',
  state: 'BC',
  mobile: true,
  networkLabel: 'ICBC Repair Network',
  rating: { rating: 4.9, reviewCount: 553 },
  businessName: 'AGS Affordable Glass Services',
  phone: '(778) 907-9359',
})
check(
  desc === 'Mobile windshield replacement in Coquitlam, BC. ICBC Repair Network shop, 4.9 stars on Google. Free quotes from AGS Affordable Glass Services. Call (778) 907-9359.',
  `meta description: ${desc}`
)
check(!/\brepair\b(?! Network)/i.test(desc), 'no "repair" in it but the network’s own name')
check(!/warrant|minute|same[- ]day|\bfast\b/i.test(desc), 'no warranty name (terms cannot fit) and no timing promise')

console.log('\nEVERY TRUST CLAUSE NEEDS ITS FACT')
const bare = cityMetaDescription({ work: 'repair and replacement', area: 'Dallas', state: 'TX', mobile: false, networkLabel: null, rating: null, businessName: 'X Auto Glass', phone: '(214) 555-0100' })
check(bare === 'Windshield repair and replacement in Dallas, TX. Free quotes from X Auto Glass. Call (214) 555-0100.', 'no network, no feed: no trust clause at all')
check(!/stars/.test(cityMetaDescription({ work, area: 'A', state: 'BC', mobile: false, networkLabel: null, rating: { rating: 0, reviewCount: 0 }, businessName: 'X', phone: '' })), 'an empty feed row shows no rating')
check(!/Call/.test(cityMetaDescription({ work, area: 'A', state: 'BC', mobile: false, networkLabel: null, rating: null, businessName: 'X', phone: '' })), 'no number, no "Call"')

console.log('\nTHE AGS CITY PATCH')
check(CONTENT_PATCHES['ags-2026-10-cities'] === AGS_2026_10_CITIES, 'registered, so the Maintenance button can find it')
const rows = AGS_2026_10_CITIES.cityText || []
check(rows.map((r) => r.city).join('|') === 'Coquitlam|Port Coquitlam|Port Moody', 'the three cities, one row each')
check(rows.every((r) => /\bchip/i.test(r.from)), 'each replaces a sentence that mentions a chip')
check(rows.every((r) => !/\bchip|\brepair/i.test(r.to)), 'no replacement mentions a chip or a repair')
check(rows.every((r) => /crack/i.test(r.to) && /replac|new windshield/i.test(r.to)), 'each says a crack spreads and means replacement')
check(
  AGS_2026_10_CITIES.clientFields?.every((f) => f.from === false && f.to === false) ?? false,
  'asserts both repair flags are still off (so the headline matches the copy)'
)
const ctx = {
  hasShopLocation: true,
  offersMobileService: true,
  filesInsuranceClaims: true,
  smsCapable: false,
  services: {
    offersWindshieldReplacement: true,
    offersWindshieldRepair: false,
    offersRockChipRepair: false,
    offersSideWindowRepair: true,
    offersBackWindowRepair: true,
    offersSunroofRepair: false,
    offersAdasCalibration: true,
  },
}
for (const r of rows) {
  const p = claimProblem(r.to, ctx)
  check(!p, `${r.city}: passes the drafters' claim screen${p ? ` — ${p.reason} ("${p.match}")` : ''}`)
}
check(!/\[[A-Z_]+\]/.test(JSON.stringify(AGS_2026_10_CITIES)), 'no [PLACEHOLDER] left anywhere in the patch')

console.log(failures ? `\n${failures} FAILED` : '\nAll city-page copy checks passed')
process.exit(failures ? 1 : 0)
