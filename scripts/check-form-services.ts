/**
 * The quote form's service options ARE the service pages' names.
 *
 * Run: npx tsx scripts/check-form-services.ts
 *
 * The silent case first: the service page preselects the form by matching its
 * own NAME against the option values, and nothing complains when no option
 * matches — the form simply arrives with nothing chosen. It did exactly that on
 * the side-window and back-glass pages for as long as the form said "Repair"
 * and the pages said "Replacement".
 *
 * And the wording: sunroof, side and back glass are REPLACED. A shop told us
 * so of their sunroof work, and "repair" on those promised a job nobody does.
 */

import {
  SERVICE_PAGES,
  GLASS_SERVICE_PAGES,
  formServiceNames,
  getServicePage,
  type ServiceFlag,
} from '../src/lib/site-services'
import { claimProblem } from '../src/lib/copy-claims'
import { buildWidgetConfig } from '../src/components/sites/site-body'

let failures = 0
const check = (ok: boolean, msg: string) => {
  if (ok) console.log(`  ✓ ${msg}`)
  else {
    failures++
    console.error(`  ✗ ${msg}`)
  }
}

const ALL = Object.fromEntries(SERVICE_PAGES.map((s) => [s.flag, true])) as Record<ServiceFlag, boolean>
const NONE = Object.fromEntries(SERVICE_PAGES.map((s) => [s.flag, false])) as Record<ServiceFlag, boolean>

console.log('\nEVERY PAGE THAT PRESELECTS FINDS ITS OPTION')
{
  const options = formServiceNames(ALL).map((o) => o.toLowerCase())
  for (const page of SERVICE_PAGES) {
    if (page.preselect === false) continue
    check(options.includes(page.name.toLowerCase()), `${page.slug} → "${page.name}" is an option`)
  }
}

console.log('\nONLY WHAT THE SHOP DOES, AND NEVER MOBILE')
{
  check(formServiceNames(NONE).length === 0, 'no services ticked, no options')
  check(
    !formServiceNames(ALL).some((o) => /mobile/i.test(o)),
    'mobile is a way of delivering the work, not an option for what is broken'
  )
  check(
    JSON.stringify(formServiceNames({ ...NONE, offersSunroofRepair: true })) ===
      JSON.stringify(['Sunroof Replacement']),
    'sunroof alone gives exactly "Sunroof Replacement"'
  )
  check(
    formServiceNames(ALL).length === GLASS_SERVICE_PAGES.length,
    'every glass service has an option'
  )
}

console.log('\nTHE INLINE CONFIG AND THE LIST AGREE')
{
  const cfg = buildWidgetConfig({ slug: 'x', businessName: 'X', phone: '', ...ALL } as never)
  check(
    JSON.stringify(cfg.services) === JSON.stringify(formServiceNames(ALL)),
    'buildWidgetConfig serves formServiceNames'
  )
}

console.log('\nREPLACED GLASS IS NEVER CALLED A REPAIR')
{
  for (const slug of ['sunroof-repair', 'side-window-replacement', 'back-glass-replacement']) {
    const page = getServicePage(slug)!
    check(/replacement/i.test(page.name) && !/repair/i.test(page.name), `${slug} is named "${page.name}"`)
    const copy = [page.name, page.short, page.heroLine, ...page.sections.flatMap((s) => [s.heading, s.body])]
    check(!copy.some((t) => /\brepair/i.test(t)), `${slug}: no "repair" anywhere in its copy`)
  }
  const sunroof = getServicePage('sunroof-repair')!
  check(
    !/leak diagnosis|diagnos/i.test([sunroof.short, sunroof.heroLine].join(' ')),
    'sunroof page does not offer leak diagnosis — the drains and mechanism are not the glass'
  )
  const services = Object.fromEntries(SERVICE_PAGES.map((s) => [s.flag, true]))
  for (const t of [sunroof.short, sunroof.heroLine, ...sunroof.sections.map((s) => s.body)]) {
    const problem = claimProblem(t, {
      services: services as never,
      offersMobileService: false,
      hasShopLocation: false,
      filesInsuranceClaims: false,
      smsCapable: false,
    } as never)
    check(!problem, `claim screen passes: "${t.slice(0, 50)}…"${problem ? ` (${JSON.stringify(problem)})` : ''}`)
  }
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n')
process.exit(failures ? 1 : 0)
