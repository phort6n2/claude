/**
 * The mobile service page: there for a shop with the Mobile service box
 * ticked, absent for everyone else, and true for every shop it renders for.
 *
 * Run: npx tsx scripts/check-mobile-service-page.ts
 *
 * The silent cases come first, because they are the ones nothing else would
 * notice: a page that appears for a shop with no mobile unit advertises work
 * they do not do; a slug added to middleware replaces a shop's own kept page
 * at that address with ours, and says nothing; a form that arrives with
 * "Mobile Auto Glass Service" chosen writes a lead that never says what is
 * broken. None of those throws or renders anything wrong-looking.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  SERVICE_PAGES,
  GLASS_SERVICE_PAGES,
  FLAT_SERVICE_PATHS,
  getServicePage,
  sectionsFor,
  servicesForClient,
  type ServiceFlag,
  type GlassServiceFlag,
} from '../src/lib/site-services'
import { MIDDLEWARE_FLAT_PATHS, keptPathProblem, servicePath } from '../src/lib/site-paths'
import { offeredServices } from '../src/lib/story-sections'
import { claimProblem } from '../src/lib/copy-claims'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)
const check = (ok: boolean, msg: string) => (ok ? pass(msg) : fail(msg))

const SLUG = 'mobile-auto-glass'
const GLASS: GlassServiceFlag[] = [
  'offersWindshieldReplacement',
  'offersWindshieldRepair',
  'offersRockChipRepair',
  'offersSideWindowRepair',
  'offersBackWindowRepair',
  'offersSunroofRepair',
  'offersAdasCalibration',
]
const glass = (on: boolean, except: Partial<Record<GlassServiceFlag, boolean>> = {}) =>
  Object.fromEntries(GLASS.map((f) => [f, except[f] ?? on])) as Record<GlassServiceFlag, boolean>
const flags = (mobile: boolean, services = glass(true)): Record<ServiceFlag, boolean> => ({
  ...services,
  offersMobileService: mobile,
})

const page = getServicePage(SLUG)

console.log('\nABSENT WHERE IT SHOULD BE ABSENT')
{
  check(
    !servicesForClient(flags(false)).some((s) => s.slug === SLUG),
    'no mobile box → no mobile page, grid card, sitemap entry or cutover row'
  )
  check(
    !FLAT_SERVICE_PATHS.includes(SLUG) && !MIDDLEWARE_FLAT_PATHS.has(SLUG),
    'not rewritten in middleware — the catch-all resolves it after kept pages and redirects'
  )
  check(
    keptPathProblem(`/${SLUG}`) === null,
    'a shop that KEPT its own /mobile-auto-glass page is not told it can never be seen'
  )
  check(page?.preselect === false, 'the quote form arrives with no glass type chosen')
  check(
    !GLASS_SERVICE_PAGES.some((s) => s.slug === SLUG),
    'not a kind of glass: the drafters keep mobile as its own fact, not in their services map'
  )
  check(
    !offeredServices(glass(true)).some((n) => n.includes('mobile')),
    'the story prompt\'s "work they do" list does not restate mobile beside its own line'
  )
  // Adding `requires` must not change a single word on any other page.
  for (const other of SERVICE_PAGES.filter((s) => s.slug !== SLUG)) {
    const none = sectionsFor(other, {})
    if (none.length !== other.sections.length) {
      fail(`${other.slug}: lost a section to a flag it never asked for`)
    }
  }
  pass('every other service page renders all of its sections, whatever the flags')
}

console.log('\nPRESENT WHERE IT SHOULD BE')
{
  check(!!page && page.flag === 'offersMobileService', 'the page exists and is gated on the mobile box')
  check(
    servicesForClient(flags(true, glass(false))).some((s) => s.slug === SLUG),
    'a mobile shop gets it even with no other service ticked'
  )
  check(servicePath(SLUG) === `/${SLUG}`, 'linked at its flat address, the one an old site would have used')

  // The grid and its icons are keyed by slug in a component module; read the
  // source rather than rendering it. A slug missing from GRID_PRIORITY sorts
  // FIRST (indexOf is -1), which is the quiet way a new page takes over the
  // top of every shop's grid.
  const body = readFileSync(join(__dirname, '..', 'src/components/sites/site-body.tsx'), 'utf8')
  const priority = body.match(/const GRID_PRIORITY = \[([\s\S]*?)\]/)?.[1] || ''
  const order = [...priority.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
  for (const s of SERVICE_PAGES) {
    if (!order.includes(s.slug)) fail(`${s.slug} is missing from GRID_PRIORITY — it would sort first`)
  }
  check(order.indexOf(SLUG) > -1 && order.indexOf(SLUG) < 6, 'mobile sits inside the six-card grid')
  check(/'mobile-auto-glass':\s*Truck/.test(body), 'the card has its own icon, not the fallback tick')
}

console.log('\nEVERY SENTENCE IS TRUE FOR EVERY SHOP IT RENDERS FOR')
{
  if (!page) {
    fail('no page to read')
  } else {
    const noPromise = (text: string, services: Record<GlassServiceFlag, boolean>, label: string) => {
      // The strictest shop that can see this text: a service-area business,
      // no texting, not filing claims, and only the services the text needs.
      const hit = claimProblem(text, {
        hasShopLocation: false,
        offersMobileService: true,
        filesInsuranceClaims: false,
        smsCapable: false,
        services,
      })
      if (hit) fail(`${label}: ${hit.reason} ("${hit.match}")`)
      else pass(`${label} passes the drafters' claim screen for a no-shop, chips-only mobile unit`)
    }
    noPromise(`${page.name}. ${page.short} ${page.heroLine}`, glass(false), 'name, card and hero')
    for (const s of page.sections) {
      const services = glass(false, s.requires ? { [s.requires]: true } : {})
      noPromise(`${s.heading}. ${s.body}`, services, `"${s.heading}"`)
    }

    const chipsOnly = sectionsFor(page, { ...glass(false), offersRockChipRepair: true })
    check(
      !chipsOnly.some((s) => /adhesive|calibrat/i.test(s.body)),
      'a chips-only mobile unit is not told about windshield adhesive or camera calibration'
    )
    const everything = sectionsFor(page, glass(true))
    check(everything.length === page.sections.length, 'a full-service mobile shop gets every section')
  }
}

console.log(
  failures === 0
    ? '\nAll mobile service page checks passed.'
    : `\n${failures} mobile service page check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
