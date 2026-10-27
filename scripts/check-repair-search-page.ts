/**
 * The Windshield Repair page for a shop that does not repair
 * (Client.repairSearchPage, REPAIR_SEARCH_PAGE), and the AGS patch that uses it.
 *
 *   npx tsx scripts/check-repair-search-page.ts
 *
 * Silent cases first: a shop that repairs, or that never ticks the new box,
 * gets exactly the pages it had.
 */
import {
  REPAIR_SEARCH_PAGE,
  SERVICE_PAGES,
  claimsRepair,
  getServicePage,
  replacementOnlyLead,
  servicePageFor,
  servicesForClient,
  type PageFlags,
} from '../src/lib/site-services'
import { defaultFaq } from '../src/lib/site-faq'
import { asServicePageCopy } from '../src/lib/site-content'
import { AGS_2026_10 } from '../src/lib/content-patches/ags-2026-10'
import { AGS_2026_10_REPLACEMENT_ONLY as PATCH } from '../src/lib/content-patches/ags-2026-10-replacement-only'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

// The words the owner asked to be gone from the page, outside the reviews.
const BANNED = /\bresin\b|chip repair|save your original|repair small damage|chip caught early|chip that would have been/i

const flags = (over: Partial<PageFlags> = {}): PageFlags => ({
  offersWindshieldReplacement: true,
  offersWindshieldRepair: false,
  offersRockChipRepair: false,
  offersSideWindowRepair: true,
  offersBackWindowRepair: true,
  offersSunroofRepair: false,
  offersAdasCalibration: true,
  offersMobileService: true,
  repairSearchPage: false,
  ...over,
})
const repair = getServicePage('windshield-repair')!
const slugs = (f: PageFlags) => servicesForClient(f).map((s) => s.slug).join(',')
const before = (f: PageFlags) => SERVICE_PAGES.filter((s) => f[s.flag]).map((s) => s.slug).join(',')

console.log('\nNOTHING CHANGES WITHOUT THE NEW TICK')
for (const f of [flags(), flags({ offersWindshieldRepair: true }), flags({ offersRockChipRepair: true }), flags({ offersMobileService: false })]) {
  check(slugs(f) === before(f), `same pages as before: ${slugs(f)}`)
}
check(servicePageFor(repair, flags({ offersWindshieldRepair: true })) === repair, 'repair ticked: the ordinary repair page')
check(servicePageFor(repair, flags({ offersWindshieldRepair: true, repairSearchPage: true })) === repair, '…even with the new tick left on')
check(servicePageFor(repair, flags()) === null, 'neither: no page (404, as before)')
check(
  servicePageFor(repair, flags({ repairSearchPage: true, offersWindshieldReplacement: false })) === null,
  'the tick without replacement: no page — there would be nothing true to say on it'
)

console.log('\nWITH THE TICK, THE PAGE STAYS AND NEVER CLAIMS A REPAIR')
const ags = flags({ repairSearchPage: true })
check(servicePageFor(repair, ags) === REPAIR_SEARCH_PAGE, 'the search-only page')
check(REPAIR_SEARCH_PAGE.slug === 'windshield-repair' && REPAIR_SEARCH_PAGE.name === 'Windshield Repair', 'same address and nav name (what the visitor searched)')
check(slugs(ags).split(',').includes('windshield-repair'), 'in the services list, so the nav, footer and sitemap keep it')
check(!claimsRepair(servicesForClient(ags)), 'and it does not count as offering repair')
check(claimsRepair(servicesForClient(flags({ offersWindshieldRepair: true }))), 'the real repair page still does')
check(claimsRepair(servicesForClient(flags({ offersRockChipRepair: true }))), 'and so does rock chip repair')
const templateCopy = JSON.stringify([REPAIR_SEARCH_PAGE.short, REPAIR_SEARCH_PAGE.heroLine, REPAIR_SEARCH_PAGE.sections])
check(!BANNED.test(templateCopy) && !/\bchips?\b/i.test(templateCopy), 'its template copy: no resin, chip or "save your original"')
check(REPAIR_SEARCH_PAGE.preselectAs === 'Windshield Replacement', 'the form arrives on Windshield Replacement (it has no repair option)')
check(!defaultFaq({ state: 'BC', offersWindshieldRepair: false }).some((f) => /repaired instead/.test(f.q)), 'the default "repaired instead" answer is not offered')

console.log('\nTHE SERVICES LEAD SAYS WHAT THE SHOP DOES')
const lead = replacementOnlyLead(servicesForClient(ags), { filesClaims: true, insurer: 'ICBC' })
check(
  lead === 'We replace windshields, side and back glass, recalibrate ADAS cameras and come to you at home or work — and we handle the claim with ICBC. Send the vehicle details with your quote and we’ll identify the correct glass before anything is scheduled.'.replace('’', "'"),
  lead
)
check(!/claim/.test(replacementOnlyLead(servicesForClient(ags), { filesClaims: false, insurer: 'ICBC' })), 'no claim clause when the shop does not file claims')
check(
  !/ADAS|come to you/.test(replacementOnlyLead(servicesForClient(flags({ repairSearchPage: true, offersAdasCalibration: false, offersMobileService: false })), { filesClaims: false, insurer: 'your carrier' })),
  'no ADAS or mobile clause for a shop without them'
)

console.log('\nTHE AGS PATCH')
const f = (name: string) => PATCH.clientFields?.find((x) => x.field === name)
check(f('offersWindshieldRepair')?.from === true && f('offersWindshieldRepair')?.to === false, 'unticks Windshield Repair (expects it ticked now)')
check(f('repairSearchPage')?.to === true, 'and ticks the search-only page')
const own = PATCH.servicePageCopy?.['windshield-repair']
check(!!own && JSON.stringify(asServicePageCopy({ x: own }).x) === JSON.stringify(own), 'its page copy survives the reader unchanged')
const written = JSON.stringify([own, PATCH.serviceHeroLines, PATCH.faq?.add])
check(!BANNED.test(written), 'none of the banned phrases in anything it writes')
check(own?.sections?.map((s) => s.heading).join('|') === 'When a cracked windshield needs replacing|Don’t wait on a crack', 'the two sections, renamed as asked')
check(/workmanship warranty/.test(own?.metaDescription || ''), 'the warranty is named with its scope, not bare')
check(!/minute|same[- ]day|\bfast\b/i.test(written), 'no timing promise')
check(PATCH.faq?.add?.[0]?.q === 'Can my windshield be repaired instead of replaced?', 'answers the same question the template asked')
check(/specialise in windshield replacement/.test(PATCH.faq?.add?.[0]?.a || ''), '…as a replacement shop')
check((own?.metaDescription || '').length <= 160, `description fits a snippet (${(own?.metaDescription || '').length} chars)`)
// NOT the drafters' claim screen: that one governs MODEL prose and refuses
// any OEM, claim-filing or "send a photo" sentence outright. This is the
// owner's copy, and each factual claim in it must trace to something AGS
// already publishes — the section `ags-2026-10` wrote from their own content.
const published = JSON.stringify(AGS_2026_10.chapters?.add)
for (const [claim, inPatch] of [
  ['OEM-quality glass', /OEM-quality glass/],
  ['submit the glass claim to ICBC for you', /submit the claim to ICBC for you/],
  ['recalibrate it as part of the job', /recalibrate it as part of the job/],
] as const) {
  check(published.includes(claim) && inPatch.test(written), `"${claim}" is AGS's own published claim`)
}
check(/at home or work|at your home or workplace/.test(published), 'mobile ("at your home, office or job site") is AGS\u2019s own claim')

console.log(failures ? `\n${failures} FAILED` : '\nAll repair-search-page checks passed')
process.exit(failures ? 1 : 0)
