/**
 * The Speedy location patch's promises about itself.
 *
 *   npx tsx scripts/check-speedy-locations.ts
 *
 * Every page's copy passes the same compliance screen the bulk city drafter
 * uses, under flags no more generous than the ones the patch asserts (no SMS,
 * no claim handling); every page clears the indexing bar; and every live ad
 * address that had nothing behind it now RENDERS a page at that address — a
 * city page, a service page or alias, the claims page or the home page. No
 * redirects, at the owner's call.
 */
import { claimProblem } from '../src/lib/copy-claims'
import { CITY_CONTENT_MIN_WORDS } from '../src/lib/city-content'
import { citySlug, LOCATION_PAGE_LIMIT } from '../src/lib/site-locations'
import { getServicePage, serviceHeading, SERVICE_ALIASES, FLAT_SERVICE_PATHS } from '../src/lib/site-services'
import { cityFromPath, HOME_ALIASES } from '../src/lib/site-paths'
import { programForPath } from '../src/lib/insurance-programs'
import { SPEEDY_2026_10_LOCATIONS as P } from '../src/lib/content-patches/speedy-2026-10-locations'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

console.log('\nTHE FLAGS THE COPY LEANS ON ARE ASSERTED')
const asserted = new Set((P.clientFields || []).filter((f) => f.from === true && f.to === true).map((f) => f.field))
for (const f of ['offersMobileService', 'offersWindshieldRepair', 'offersRockChipRepair', 'offersAdasCalibration'] as const) {
  check(asserted.has(f), `${f} must be on, or the patch refuses`)
}

console.log('\nEVERY PAGE PASSES THE CLAIM SCREEN')
const claims = {
  hasShopLocation: true,
  offersMobileService: true,
  filesInsuranceClaims: false,
  smsCapable: false,
  services: {
    offersWindshieldRepair: true,
    offersWindshieldReplacement: true,
    offersSideWindowRepair: false,
    offersBackWindowRepair: false,
    offersSunroofRepair: false,
    offersRockChipRepair: true,
    offersAdasCalibration: true,
  },
}
for (const c of P.cityContent || []) {
  const problem = claimProblem(`${c.heading}\n${c.body}`, claims)
  check(!problem, `${c.city}${problem ? ` — ${problem.reason}: "${problem.match}"` : ''}`)
}

console.log('\nNO SHOP IN THESE CITIES, NO NUMBER, NO TIMING')
for (const c of P.cityContent || []) {
  const t = `${c.heading} ${c.body}`
  check(!/\bshop\b|\bvisit us\b|\bour (location|store|address)\b/i.test(t), `${c.city}: names no premises`)
  check(!/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(t), `${c.city}: no phone number`)
  check(!/same[- ]day|today|minutes?|hours?|\bfast\b|quick/i.test(t), `${c.city}: no timing`)
}

console.log('\nEVERY PAGE IS INDEXABLE AND EVERY AREA HAS ITS COPY')
for (const c of P.cityContent || []) {
  check(words(c.body) >= CITY_CONTENT_MIN_WORDS, `${c.city}: ${words(c.body)} words (≥ ${CITY_CONTENT_MIN_WORDS})`)
}
const copyFor = new Set((P.cityContent || []).map((c) => c.city.toLowerCase()))
for (const area of P.serviceAreasAdd || []) check(copyFor.has(area.toLowerCase()), `${area} has page copy`)
check((P.serviceAreasAdd || []).length < LOCATION_PAGE_LIMIT, 'well under the page limit')

console.log('\nEVERY LIVE AD ADDRESS RESOLVES (enabled AGMP ads, asset groups and sitelinks, 2026-10-30)')
const LIVE = [
  // speedywindshield.com
  '/windshield-repair', '/windshield-crack-repair', '/windshield-replacement', '/rock-chip-repair',
  '/auto-glass-replacement', '/car-window-repair', '/car-window-replacement', '/auto-glass-repair',
  '/windshield-chip-repair', '/home', '/mobile-service', '/free-quote', '/door-glass-repair',
  // la.speedywindshield.com
  '/adas-calibration', '/insurance-claims', '/auto-glass-repair-irvine', '/auto-glass-repair-orange-county',
  '/mobile-auto-glass', '/auto-glass-repair-los-angeles-county',
  // insurance.speedywindshield.com
  '/',
]
const cities = new Set([...(P.serviceAreasAdd || []), 'San Diego'].map(citySlug))
const answers = (path: string): string | null => {
  if (path === '/') return 'home'
  const bare = path.slice(1)
  const city = cityFromPath(bare)
  if (city) return cities.has(city) ? `city page (${city})` : null
  if (getServicePage(bare)) return `${serviceHeading(bare)} (${getServicePage(bare)!.slug})`
  if (programForPath(bare) && P.insuranceProgram?.programKey === programForPath(bare)!.key) return 'claims page'
  if (HOME_ALIASES.has(bare)) return 'home page'
  return null
}
check(!(P.redirects || []).length, 'the patch adds NO redirects — every address renders a page')
for (const path of LIVE) {
  const a = answers(path)
  check(!!a, `${path} → ${a || 'NOTHING'}`)
}

console.log('\nREPLACED GLASS IS NEVER HEADED "REPAIR", WHATEVER THE ADDRESS SAYS')
for (const [slug, a] of Object.entries(SERVICE_ALIASES)) {
  if (a.service === 'side-window-replacement') check(!/repair/i.test(a.name), `/${slug} → "${a.name}"`)
}

console.log('\nNEW ALIASES YIELD TO OTHER SHOPS\' KEPT PAGES (not rewritten in middleware)')
for (const slug of ['mobile-service', 'car-window-replacement', 'car-window-repair', 'door-glass-repair']) {
  check(!FLAT_SERVICE_PATHS.includes(slug), `/${slug} is served by the catch-all, after kept pages`)
}
for (const slug of ['auto-glass-replacement', 'windshield-crack-repair']) {
  check(FLAT_SERVICE_PATHS.includes(slug), `/${slug} still rewritten in middleware, as before`)
}

console.log('\nRIVERSIDE COUNTY: THE COUNTY AND ITS TEN LARGEST CITIES (2020 census)')
const TEN = ['Riverside', 'Moreno Valley', 'Corona', 'Murrieta', 'Temecula', 'Jurupa Valley', 'Menifee', 'Hemet', 'Indio', 'Perris']
for (const c of ['Riverside County', ...TEN]) check(copyFor.has(c.toLowerCase()), `${c} → /auto-glass-repair-${citySlug(c)}`)

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll checks passed.')
