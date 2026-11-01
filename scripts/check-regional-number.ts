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
import { pickSiteNumber, cleanAreas, cleanCampaignIds, type SiteNumber } from '../src/lib/regional-number'
import {
  adCampaignFor,
  adCampaignFromHeader,
  decodeTouch,
  encodeTouch,
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

console.log('\nSPEEDY: CITY PAGE, THEN CAMPAIGN, THEN SAN DIEGO')
{
  const pick = (area: string | null, adCampaignId: string | null, platform: string | null = null) =>
    pickSiteNumber(speedy, { platform, area, adCampaignId })
  check(pick('Riverside', null)?.phoneNumber === RIV, 'Riverside city page → Riverside line')
  check(pick('riverside county', null)?.phoneNumber === RIV, 'matched without case')
  check(pick('Irvine', null)?.phoneNumber === LA, 'Irvine city page → LA/OC line')
  check(pick('Irvine', SD_CAMPAIGN)?.phoneNumber === LA, 'a city page beats the campaign (the owner’s order)')
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

console.log('\nWHAT THE CARD SAVES')
check(JSON.stringify(cleanAreas('Riverside County, Riverside,\n riverside , Corona')) === '["Riverside County","Riverside","Corona"]', 'areas: split, trimmed, de-duplicated')
check(JSON.stringify(cleanCampaignIds('24069310556, 223-255-01515 abc 12')) === '["24069310556","22325501515"]', 'campaign ids: digits only, short junk dropped')

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll checks passed.')
