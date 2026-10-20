/**
 * The province gate on service-page insurance copy, and the AGS patch's own
 * promises about itself.
 *
 *   npx tsx scripts/check-content-patch.ts
 *
 * Silent cases first: every US shop's service sections are byte-for-byte what
 * they were, because the only shared change here is a section that drops in a
 * public-insurer province.
 */
import { SERVICE_PAGES, sectionsFor } from '../src/lib/site-services'
import { publicInsurerFor } from '../src/lib/insurance-rules'
import { AGS_2026_10 } from '../src/lib/content-patches/ags-2026-10'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}
const all = Object.fromEntries(SERVICE_PAGES.map((p) => [p.flag, true]))

console.log('\nUS SHOPS ARE UNCHANGED (no option, or the option off)')
for (const page of SERVICE_PAGES) {
  const before = page.sections.filter((s) => !s.requires || all[s.requires]).map((s) => s.heading)
  check(
    JSON.stringify(sectionsFor(page, all).map((s) => s.heading)) === JSON.stringify(before) &&
      JSON.stringify(sectionsFor(page, all, { publicInsurer: false }).map((s) => s.heading)) === JSON.stringify(before),
    `${page.slug}: same sections as before`
  )
}
check(!publicInsurerFor('TX') && !publicInsurerFor('CA') && !publicInsurerFor('FL') && !publicInsurerFor('QC'), 'TX, CA (California), FL and Quebec are private markets')

console.log('\nA PUBLIC-INSURER PROVINCE LOSES ONLY THE PRIVATE-MARKET "INSURANCE" SECTION')
check(!!publicInsurerFor('BC') && !!publicInsurerFor('SK') && !!publicInsurerFor('MB'), 'BC, SK and MB have a public insurer')
const ws = SERVICE_PAGES.find((p) => p.slug === 'windshield-replacement')!
const bc = sectionsFor(ws, all, { publicInsurer: true })
check(!bc.some((s) => /your state/i.test(s.body)), 'no "your state" on a BC windshield page')
check(bc.map((s) => s.heading).join('|') === 'When replacement is the right call|What the job involves', 'the two non-insurance sections stay')

console.log('\nTHE AGS PATCH')
const json = JSON.stringify(AGS_2026_10)
const written = JSON.stringify([AGS_2026_10.chapters?.add, AGS_2026_10.heroBullets?.to, AGS_2026_10.serviceHeroLines])
check(!/glassbc\.com\/wp-content|glasabc/.test(json.replace(/"from":"[^"]*"/g, '')), 'no glassbc.com image or typo email in anything it writes')
check(!/\bchip|windshield repair/i.test(written), 'the new copy never mentions chip or windshield repair')
check(/Tri-Cities/.test(written), 'the new copy says Tri-Cities')
check(!/\$\s?\d|\d+\s?(min|minute|hour|day)s?\b|same[- ]day|reviews?\b/i.test(written), 'no price, timing promise or review count in the new copy')
check(AGS_2026_10.clientFields?.some((f) => f.field === 'offersRockChipRepair' && f.to === false) ?? false, 'rock chip repair is unticked')
check(AGS_2026_10.redirects?.some((r) => r.from === '/rock-chip-repair' && r.to === '/windshield-replacement') ?? false, '…and its address redirects, not 404s')

console.log(failures ? `\n${failures} FAILED` : '\nAll content-patch checks passed')
process.exit(failures ? 1 : 0)
