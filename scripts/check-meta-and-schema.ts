/**
 * Meta descriptions (≤ 155, service + city + a differentiator), the ICBC page's
 * copy, opening hours and FAQ markup.
 *
 *   npx tsx scripts/check-meta-and-schema.ts
 *
 * Silent cases first: no fact, no sentence; hours that do not parse emit
 * nothing; no aggregateRating ever.
 */
import { composeDescription, indefiniteArticle, siteDescription, META_DESCRIPTION_MAX, type DescriptionFacts } from '../src/lib/meta-description'
import { cityMetaDescription } from '../src/lib/city-page-copy'
import { parseOpeningHours } from '../src/lib/opening-hours'
import { programFor, programDescription, programHeroLine, programDefaultCopy, programSections, type ProgramCopyContext } from '../src/lib/insurance-programs'
import { homeJsonLd, serviceJsonLd } from '../src/lib/site-schema'
import { pageFaq } from '../src/lib/site-faq'
import { AGS_2026_10_ICBC } from '../src/lib/content-patches/ags-2026-10-icbc'
import { CONTENT_PATCHES } from '../src/lib/content-patches'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

const AGS: DescriptionFacts = { networkLabel: 'ICBC Repair Network', mobile: true, rating: { rating: 4.9, reviewCount: 553 }, phone: '(778) 907-9359' }
const BARE: DescriptionFacts = { networkLabel: null, mobile: false, rating: null, phone: '' }

console.log('\nNO FACT, NO SENTENCE')
check(siteDescription('Windshield Replacement in Dallas, TX', BARE) === 'Windshield Replacement in Dallas, TX. Free quotes.', 'nothing stored: the lead and "Free quotes." only')
check(!/stars/.test(siteDescription('X in Y', { ...BARE, rating: { rating: 0, reviewCount: 0 } })), 'an empty feed row gives no rating')
check(!/warrant|fast|same[- ]day|minute/i.test(siteDescription('Windshield Replacement in Port Coquitlam, BC', AGS)), 'no warranty name and no timing word in a template description')

console.log('\nEVERY AGS PAGE TYPE: ≤ 155, SERVICE + CITY FIRST, THEN A DIFFERENTIATOR')
const pages: Record<string, string> = {
  home: siteDescription('Windshield Replacement in Port Coquitlam, BC', AGS),
  'windshield-replacement': siteDescription('Windshield Replacement in Port Coquitlam, BC', AGS),
  'side-window-replacement': siteDescription('Side Window Replacement in Port Coquitlam, BC', AGS),
  'back-glass-replacement': siteDescription('Back Glass Replacement in Port Coquitlam, BC', AGS),
  'adas-calibration': siteDescription('ADAS Calibration in Port Coquitlam, BC', AGS),
  'mobile-auto-glass': siteDescription('Mobile Auto Glass Service in Port Coquitlam, BC', AGS),
  'auto-glass-repair-port-moody': cityMetaDescription({ work: 'replacement', area: 'Port Moody', state: 'BC', mobile: true, networkLabel: AGS.networkLabel, rating: AGS.rating, businessName: 'AGS', phone: AGS.phone }),
}
for (const [page, d] of Object.entries(pages)) {
  check(d.length <= META_DESCRIPTION_MAX && /in Port (Coquitlam|Moody), BC\. ICBC Repair Network shop\./.test(d), `${page} (${d.length}): ${d}`)
}
check(!/Mobile service to your home/.test(pages['mobile-auto-glass']), 'the mobile page does not say "mobile" twice')
const long = composeDescription('A'.repeat(40), ['B'.repeat(100), 'C'.repeat(60), 'D'.repeat(10)])
check(long.length <= META_DESCRIPTION_MAX && long.includes('D') && !long.includes('C'), 'a sentence that does not fit is skipped and a shorter one after it still goes in')

console.log('\nTHE ICBC PAGE')
check(indefiniteArticle('ICBC') === 'an' && indefiniteArticle('SGI') === 'an' && indefiniteArticle('MPI') === 'an' && indefiniteArticle('insurance') === 'an' && indefiniteArticle('USAA') === 'a', 'an ICBC, an SGI, an MPI, an insurance, a USAA')
const icbc = programFor('icbc')!
const general = programFor('general')!
const agsCtx: ProgramCopyContext = { businessName: 'AGS Affordable Glass Services', area: 'Port Coquitlam', state: 'BC', filesClaims: true, mobile: true, repair: false }
const record = { programKey: 'icbc', inNetwork: true, coverageNote: null, claimSteps: [], metaDescription: null, publishedAt: new Date() }
const icbcDesc = programDescription(icbc, record as never, agsCtx, AGS)
check(icbcDesc.length <= META_DESCRIPTION_MAX, `${icbcDesc.length}: ${icbcDesc}`)
check(/an ICBC glass claim/.test(icbcDesc) && !/a ICBC/.test(icbcDesc) && !/carrier/.test(icbcDesc), '"an ICBC glass claim", and ICBC rather than "your carrier"')
check(/^ICBC glass claims in Port Coquitlam, BC\. ICBC Repair Network shop\./.test(icbcDesc), 'leads with the service, the city and the network')
const tx = programDescription(general, { ...record, programKey: 'general' } as never, { ...agsCtx, state: 'TX', area: 'Dallas', repair: true }, BARE)
check(/an insurance glass claim/.test(tx) && /your insurer/.test(tx) && !/carrier/.test(tx), `the general page elsewhere: ${tx}`)
check(programHeroLine(icbc, { repair: false }).startsWith('Cracked or broken glass and going through ICBC?'), 'a replacement-only shop: "Cracked or broken glass and going through ICBC?"')
check(programHeroLine(icbc, { repair: true }).startsWith('Chipped or cracked glass and going through ICBC?'), 'a shop that repairs keeps "Chipped or cracked…"')
const agsSections = JSON.stringify(programSections(icbc, { ...record, ...programDefaultCopy(icbc, { filesClaims: true, mobile: true, hasShopLocation: true, inNetwork: true }) } as never, agsCtx))
check(!/repaired|\bchip/i.test(agsSections), 'no repair offer anywhere in a replacement-only shop’s claim page sections')
check(/can usually still be repaired/.test(JSON.stringify(programSections(icbc, record as never, { ...agsCtx, repair: true }))), 'a shop that repairs keeps the "can usually still be repaired" line')
check(CONTENT_PATCHES['ags-2026-10-icbc'] === AGS_2026_10_ICBC, 'the caption patch is registered')
check(AGS_2026_10_ICBC.photos?.renameAlt?.[0]?.to === 'Cracked windshield with spreading cracks', 'the caption becomes "Cracked windshield with spreading cracks"')

console.log('\nOPENING HOURS: PARSED, OR NOTHING')
check(parseOpeningHours(null) === null && parseOpeningHours('') === null, 'no hours, no markup')
check(parseOpeningHours('Mon–Fri 9–5') === null, '"9–5" with no am/pm is refused, not guessed')
check(parseOpeningHours('By appointment') === null, 'a shape it does not know emits nothing')
check(parseOpeningHours('Mon–Fri 8:30AM–5PM · Whenever') === null, 'one bad segment refuses the whole string')
const agsHours = parseOpeningHours('Mon–Fri 8:30AM–5PM · Sat–Sun 9AM–3PM')
check(
  JSON.stringify(agsHours) ===
    JSON.stringify([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:30', closes: '17:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '09:00', closes: '15:00' },
    ]),
  'AGS: Mon–Fri 08:30–17:00, Sat–Sun 09:00–15:00'
)
check(JSON.stringify(parseOpeningHours('Mon-Sat 7:00-18:00; Sun closed')) === JSON.stringify([{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '07:00', closes: '18:00' }]), '24-hour times, and a closed day is simply absent')
check(parseOpeningHours('Mon–Fri 9–5pm')?.[0]?.opens === '09:00', '"9–5pm" reads 09:00–17:00')

console.log('\nSCHEMA')
const client = { businessName: 'AGS Affordable Glass Services', phone: '(604) 537-5277', streetAddress: '2660 Kingsway Avenue', city: 'Port Coquitlam', state: 'BC', postalCode: 'V3C 1T8', country: 'CA', logoUrl: null, googleMapsUrl: null, serviceAreas: ['Port Coquitlam'], hasShopLocation: true }
const loc = { id: 'l1', label: 'Port Coquitlam shop', streetAddress: '2660 Kingsway Avenue', city: 'Port Coquitlam', state: 'BC', postalCode: 'V3C 1T8', country: 'CA', phone: '(604) 537-5277', hours: 'Mon–Fri 8:30AM–5PM · Sat–Sun 9AM–3PM', googleMapsUrl: null, isPrimary: true, isSynthetic: false }
const extras = { faq: [{ q: 'Can my windshield be repaired instead of replaced?', a: 'We specialise in windshield replacement rather than repair.' }], galleryPhotos: [] } as never
const home = homeJsonLd({ origin: 'https://ags.glassleads.app', client, services: [], extras, locations: [loc] })
const biz = (home['@graph'] as Array<Record<string, unknown>>).find((n) => n['@type'] === 'AutoRepair')!
check(JSON.stringify(biz.openingHoursSpecification) === JSON.stringify(agsHours), 'the AutoRepair node carries the shop’s hours')
check(!/aggregateRating|"Review"/.test(JSON.stringify(home)), 'no aggregateRating or Review node for the shop’s own business')
const visible = pageFaq([{ q: 'Can my windshield be repaired instead of replaced?', a: 'We specialise…' }], { offersWindshieldRepair: false, offersAdasCalibration: true }, 'BC')
const svc = serviceJsonLd({ origin: 'https://ags.glassleads.app', client, service: { slug: 'windshield-repair', name: 'Windshield Repair' }, faq: visible })
const faqNode = (svc['@graph'] as Array<Record<string, unknown>>).find((n) => n['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }>; '@id': string } | undefined
check(!!faqNode && faqNode.mainEntity.map((q) => q.name).join('|') === visible.map((f) => f.q).join('|'), `the windshield-repair FAQPage is the visible FAQ, in order (${visible.length} questions)`)
check(faqNode?.['@id'] === 'https://ags.glassleads.app/windshield-repair#faq', 'and it belongs to that page')
check(!(serviceJsonLd({ origin: 'x', client, service: { slug: 'a', name: 'A' } })['@graph'] as Array<Record<string, unknown>>).some((n) => n['@type'] === 'FAQPage'), 'no FAQ shown, no FAQPage node')
check(!/aggregateRating/.test(JSON.stringify(svc)), 'no aggregateRating on a service page either')

console.log(failures ? `\n${failures} FAILED` : '\nAll meta/schema checks passed')
process.exit(failures ? 1 : 0)
