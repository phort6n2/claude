/**
 * A tracking number per region (lib/regional-number.ts) and the campaign id
 * the landing cookie carries for it (lib/traffic-source.ts).
 *
 *   npx tsx scripts/check-regional-number.ts
 *
 * Silent cases first: a shop with one number, or with no regional rules, must
 * read exactly as it did — the default number everywhere, platform numbers to
 * their platform's visitors.
 */
import { pickSiteNumber, cleanAreas, cleanCampaignIds, areaSlug, type SiteNumber } from '../src/lib/regional-number'
import { citySlug } from '../src/lib/site-locations'
import {
  adCampaignFor,
  adCampaignFromHeader,
  decodeTouch,
  encodeTouch,
  landingCityFromHeader,
  landingCitySlug,
  mergeTouch,
  touchFromLanding,
} from '../src/lib/traffic-source'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

const SD = '+16195550100'
const LA = '+17145550100'
const RIV = '+19515550100'
const META = '+16195550199'
const n = (phoneNumber: string, o: Partial<SiteNumber> = {}): SiteNumber => ({
  phoneNumber,
  useOnSite: false,
  showTo: null,
  showForAreas: [],
  adCampaignIds: [],
  ...o,
})
const LA_OC_CAMPAIGN = '24069310556'
const SD_CAMPAIGN = '22325501515'
const speedy: SiteNumber[] = [
  n(SD, { useOnSite: true }),
  n(LA, { showForAreas: ['Orange County', 'Irvine', 'Los Angeles County'], adCampaignIds: [LA_OC_CAMPAIGN] }),
  n(RIV, { showForAreas: ['Riverside County', 'Riverside', 'Corona', 'Lake Elsinore'] }),
  n(META, { showTo: 'meta' }),
]

console.log('\nONE NUMBER, OR NO RULES: EXACTLY AS BEFORE')
{
  const one = [n(SD, { useOnSite: true })]
  for (const ctx of [
    { platform: null, area: null, adCampaignId: null },
    { platform: null, area: 'Riverside', adCampaignId: null },
    { platform: null, area: null, adCampaignId: LA_OC_CAMPAIGN },
    { platform: 'microsoft', area: 'Irvine', adCampaignId: LA_OC_CAMPAIGN },
  ]) {
    const p = pickSiteNumber(one, ctx)
    check(p?.phoneNumber === SD && p.why === 'default', `one number, ${JSON.stringify(ctx)} → the default`)
  }
  check(pickSiteNumber([], { platform: null, area: 'Riverside', adCampaignId: null }) === null, 'no numbers → nothing (the real line shows)')
  const p = pickSiteNumber([n(SD, { useOnSite: true }), n(META, { showTo: 'meta' })], { platform: 'meta', area: null, adCampaignId: null })
  check(p?.phoneNumber === META && p.why === 'platform', 'a Meta visitor still gets the Meta number')
}

console.log('\nSPEEDY: CAMPAIGN (WHEN IT HAS A RULE), THEN CITY PAGE, THEN SAN DIEGO')
{
  const pick = (area: string | null, adCampaignId: string | null, platform: string | null = null) =>
    pickSiteNumber(speedy, { platform, area, adCampaignId })
  check(pick('Riverside', null)?.phoneNumber === RIV, 'Riverside city page → Riverside line')
  check(pick('riverside county', null)?.phoneNumber === RIV, 'matched without case')
  check(pick('Irvine', null)?.phoneNumber === LA, 'Irvine city page → LA/OC line')
  check(pick('Irvine', SD_CAMPAIGN)?.phoneNumber === LA, 'a campaign with NO rule of its own leaves the city page in charge')
  check(pick('Riverside', LA_OC_CAMPAIGN)?.phoneNumber === LA, 'a campaign WITH a rule beats the city page (reversed 2026-11-01)')
  check(pick(null, LA_OC_CAMPAIGN)?.phoneNumber === LA, 'a shared page, clicked from the LA+OC campaign → LA/OC line')
  check(pick(null, SD_CAMPAIGN)?.phoneNumber === SD, 'a shared page, from the SD campaign → the default (SD)')
  check(pick(null, null)?.phoneNumber === SD, 'organic on a shared page → SD')
  check(pick('San Diego', null)?.phoneNumber === SD, 'a city with no regional number → SD')
  check(pick('Riverside', null, 'meta')?.phoneNumber === META, 'a Meta visitor on a Riverside page still gets the Meta number')
  check(pick('Riverside', null)?.why === 'area' && pick(null, LA_OC_CAMPAIGN)?.why === 'campaign', 'the reason is reported (Google’s swap reads it)')
}

console.log('\nTHE CAMPAIGN ID ON THE LANDING')
{
  const now = Date.UTC(2026, 10, 1)
  const ad = touchFromLanding({
    url: `https://speedy.glassleads.app/windshield-replacement?gad_source=1&gad_campaignid=${LA_OC_CAMPAIGN}&gclid=abc`,
    referrer: 'https://www.google.com/',
    now,
  })
  check(ad?.adCampaignId === LA_OC_CAMPAIGN && adCampaignFor(ad) === LA_OC_CAMPAIGN, 'gad_campaignid on an ad click is kept')
  const tmpl = touchFromLanding({ url: `https://x.test/?gclid=abc&campaign_id=${SD_CAMPAIGN}`, referrer: null, now })
  check(tmpl?.adCampaignId === SD_CAMPAIGN, 'a tracking template’s campaign_id when Google’s is absent')
  const junk = touchFromLanding({ url: 'https://x.test/?gclid=abc&gad_campaignid={campaignid}', referrer: null, now })
  check(!junk?.adCampaignId, 'an unfilled ValueTrack placeholder is not an id')
  const organic = mergeTouch(null, { url: `https://x.test/?campaign_id=${SD_CAMPAIGN}`, referrer: 'https://www.google.com/', now })
  check(adCampaignFor(organic.touch) === null, 'an organic visit carrying a stray campaign_id picks nothing')
  const round = decodeTouch(encodeTouch({ ...ad!, firstSeenAt: now }))
  check(round?.adCampaignId === LA_OC_CAMPAIGN, 'it survives the cookie')
  // A cookie written before the field existed.
  const legacy = decodeTouch(encodeTouch({ ...ad!, adCampaignId: null, firstSeenAt: now }))
  check(legacy !== null && legacy.adCampaignId === null, 'an older cookie still reads, with no campaign')
  const later = mergeTouch(round, { url: 'https://speedy.glassleads.app/auto-glass-repair-irvine', referrer: 'https://speedy.glassleads.app/', now: now + 60_000 })
  check(adCampaignFor(later.touch) === LA_OC_CAMPAIGN, 'clicking around the site keeps the campaign for the visit')
  check(adCampaignFromHeader('24069310556') === '24069310556' && adCampaignFromHeader('<script>') === null, 'the header reader takes digits only')
}

console.log('\nTWO NUMBERS (2026-11-01): THE CAMPAIGN DECIDES ON EVERY PAGE, THEN THE PAGE')
{
  // Speedy as configured: San Diego is the default and claims its own pages
  // and both SD campaigns; LA/OC/Riverside is one campaign and one number.
  const SD_PMAX = '22813715986'
  const two = [
    n(SD, { useOnSite: true, showForAreas: ['San Diego', 'La Jolla', 'Chula Vista'], adCampaignIds: [SD_CAMPAIGN, SD_PMAX] }),
    n(LA, {
      showForAreas: ['Orange County', 'Irvine', 'Los Angeles County', 'Riverside County', 'Riverside', 'Temecula', 'Corona'],
      adCampaignIds: [LA_OC_CAMPAIGN],
    }),
  ]
  const now = Date.UTC(2026, 10, 2)
  const visit = (path: string, referrer = 'https://www.google.com/') =>
    mergeTouch(null, { url: `https://speedy.glassleads.app${path}`, referrer, now }).touch
  const next = (prev: ReturnType<typeof visit>, path: string) =>
    mergeTouch(decodeTouch(encodeTouch(prev)), {
      url: `https://speedy.glassleads.app${path}`,
      referrer: 'https://speedy.glassleads.app/',
      now: now + 60_000,
    }).touch
  const on = (touch: ReturnType<typeof visit>, area: string | null = null) =>
    pickSiteNumber(two, { platform: null, area, adCampaignId: adCampaignFor(touch), landingCity: landingCitySlug(touch) })?.phoneNumber

  // The acceptance tests, in the task's own numbering.
  const t1 = visit(`/windshield-replacement?gad_campaignid=${LA_OC_CAMPAIGN}`)
  check(on(t1) === LA, '1. /windshield-replacement from LA+OC+Riverside → 949')
  check(on(next(t1, '/rock-chip-repair')) === LA, '1. …and still 949 on the next page')
  check(on(next(t1, '/auto-glass-repair-san-diego'), 'San Diego') === LA, '1. …even on a San Diego city page: the campaign beats the page')
  check(on(visit(`/auto-glass-repair-temecula?gad_campaignid=${LA_OC_CAMPAIGN}`), 'Temecula') === LA, '2. Temecula from LA+OC+Riverside → 949')
  check(on(visit(`/windshield-repair?gad_campaignid=${SD_CAMPAIGN}`)) === SD, '3. SD Search → 619')
  check(on(visit(`/windshield-repair?gad_campaignid=${SD_PMAX}`)) === SD, '4. SD PMax → 619')
  const sdAd = visit(`/windshield-repair?gad_campaignid=${SD_CAMPAIGN}`)
  check(on(next(sdAd, '/auto-glass-repair-irvine'), 'Irvine') === SD, '3. …an SD ad click opening the Irvine page keeps 619')
  const t5 = visit('/auto-glass-repair-riverside')
  check(on(t5, 'Riverside') === LA, '5. Riverside page, organic → 949')
  check(on(next(t5, '/windshield-replacement')) === LA, '5. …then /windshield-replacement → still 949')
  check(on(visit('/auto-glass-repair-orange-county'), 'Orange County') === LA, '6. Orange County page, organic → 949')
  check(on(visit('/windshield-replacement')) === SD, '7. /windshield-replacement, fresh organic → 619')
  check(on(next(t5, '/auto-glass-repair-la-jolla'), 'La Jolla') === SD, 'organic: the page they are ON beats where they landed')
  // The retired campaign has no rule: a click from it falls to the page.
  check(on(visit('/windshield-replacement?gad_campaignid=24425965345')) === SD, 'the retired Riverside campaign → no rule, the page decides (619)')
  check(on(visit('/auto-glass-repair-corona?gad_campaignid=24425965345'), 'Corona') === LA, '…and on a Riverside page, 949')
  check(!two.some((x) => x.phoneNumber === RIV), 'no number in the setup is the retired 951')
  check(landingCitySlug(visit('/auto-glass-repair-temecula')) === 'temecula', 'the landing city is read off the path')
  // The other city shapes, and things that are not city pages.
  check(landingCitySlug({ landingPage: 'https://x.test/locations/lake-elsinore' }) === 'lake-elsinore', '/locations/{city} is read')
  check(landingCitySlug({ landingPage: 'https://glassleads.app/sites/speedy/auto-glass-repair-riverside-county' }) === 'riverside-county', 'the preview path is read')
  check(landingCitySlug({ landingPage: 'https://x.test/auto-glass-repair' }) === null, '/auto-glass-repair (a service alias) is not a city')
  check(landingCitySlug({ landingPage: 'https://x.test/' }) === null && landingCitySlug(null) === null, 'home and nothing → no city')
  check(landingCityFromHeader('temecula') === 'temecula' && landingCityFromHeader('<x>') === null, 'the header reader takes slug characters only')
  // A shop with no regional rules is untouched by a landing city.
  const one = [n(SD, { useOnSite: true })]
  check(pickSiteNumber(one, { platform: null, area: null, adCampaignId: null, landingCity: 'temecula' })?.why === 'default', 'one number → still the default')
  // areaSlug must be citySlug, or a page's URL and its number stop agreeing.
  for (const name of ['Riverside County', 'Lake Elsinore', 'Jurupa Valley', "Coeur d'Alene", 'St. Petersburg', '  Moreno  Valley '])
    check(areaSlug(name) === citySlug(name), `areaSlug("${name}") === citySlug`)
}

console.log('\nWHAT THE CARD SAVES')
check(JSON.stringify(cleanAreas('Riverside County, Riverside,\n riverside , Corona')) === '["Riverside County","Riverside","Corona"]', 'areas: split, trimmed, de-duplicated')
check(JSON.stringify(cleanCampaignIds('24069310556, 223-255-01515 abc 12')) === '["24069310556","22325501515"]', 'campaign ids: digits only, short junk dropped')

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll checks passed.')
