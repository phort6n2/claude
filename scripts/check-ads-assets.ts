/**
 * Does the campaign-asset audit say the right thing?
 *
 *   npx tsx scripts/check-ads-assets.ts
 *
 * WHY THIS IS WORTH A SCRIPT. The whole check turns on one rule that is easy
 * to get backwards: assets attach at three levels and THE MOST SPECIFIC ONE
 * WINS OUTRIGHT — it does not add. A campaign with two sitelinks of its own
 * shows two, even when the account has six, because its own set overrides the
 * account's.
 *
 * Both ways of getting that wrong are silent. Add the levels together and the
 * check passes exactly the campaign that is worst off — two of its own plus
 * six from the account reads as eight. Count only the campaign level and every
 * account that sensibly sets them once at the top gets a finding for each of
 * its campaigns. Neither shows up as an error; one under-reports and the other
 * cries wolf until nobody reads the findings at all.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real evaluator and exits non-zero when it is wrong.
 */
import {
  ASSET_STANDARD,
  emptyCounts,
  effective,
  evaluateAssets,
  parseAdGroupAds,
  countAssets,
  isAuditedChannel,
  CAMPAIGN_ASSET_CHECK,
  AD_GROUP_ADS_CHECK,
  type AssetCounts,
  type CampaignAssets,
} from '@/lib/google-ads-assets'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

const counts = (p: Partial<AssetCounts>): AssetCounts => ({ ...emptyCounts(), ...p })
const campaign = (over: Partial<CampaignAssets> = {}): CampaignAssets => ({
  id: '1',
  name: 'Search — Windshield',
  channel: 'SEARCH',
  own: emptyCounts(),
  ...over,
})

const FULL = counts({ sitelink: 6, callout: 4, structuredSnippet: 2, call: 1, image: 4 })

console.log('--- the level rule: most specific wins, levels do NOT add ---')
{
  // THE CASE THAT MATTERS. Its own two override the account's six.
  const r = effective(counts({ sitelink: 2 }), counts({ sitelink: 6 }), 'sitelink')
  check(`2 of its own beside 6 on the account -> ${r.count} from ${r.level}`, r.count === 2 && r.level === 'campaign', 'adding the levels would report 8 and pass')
}
{
  const r = effective(emptyCounts(), counts({ sitelink: 6 }), 'sitelink')
  check(`none of its own, 6 on the account -> ${r.count} from ${r.level}`, r.count === 6 && r.level === 'account', 'campaign-level-only counting would file a finding here')
}
{
  const r = effective(emptyCounts(), emptyCounts(), 'sitelink')
  check(`neither -> ${r.count} from ${r.level}`, r.count === 0 && r.level === 'none')
}

console.log('\n--- a complete campaign produces nothing ---')
check(
  'account fully stocked, campaign sets none',
  evaluateAssets([campaign()], FULL, []).length === 0
)
check(
  'campaign fully stocked itself',
  evaluateAssets([campaign({ own: FULL })], emptyCounts(), []).length === 0
)

console.log('\n--- the override, end to end ---')
{
  const drafts = evaluateAssets([campaign({ own: counts({ sitelink: 2 }) })], FULL, [])
  const d = drafts[0]
  check('a campaign overriding a stocked account is reported', drafts.length === 1, JSON.stringify(drafts))
  check(`title names the shortfall: "${d?.title}"`, !!d && /2 of 6 sitelinks/.test(d.title))
  const missing = (d?.evidence as { missing: Array<{ asset: string; servingFrom: string }> }).missing
  // The level is the difference between "add six" and "your six are being
  // overridden by the two set here" — it has to reach the person reading.
  check(
    'evidence says the count is coming from the campaign, not the account',
    missing.find((m) => m.asset === 'sitelinks')?.servingFrom === 'campaign'
  )
  // Its own sitelinks override the account's, but it inherits everything else.
  check('only sitelinks are reported short', missing.length === 1, JSON.stringify(missing))
}

console.log('\n--- below what Google needs to SHOW them is called out ---')
{
  const d = evaluateAssets([campaign({ own: counts({ sitelink: 1 }) })], emptyCounts(), [])[0]
  check('1 sitelink is flagged as below the serving minimum', /Below what Google needs/.test(d.detail), d.detail)
  const d2 = evaluateAssets([campaign({ own: counts({ sitelink: 4, callout: 4, structuredSnippet: 2, call: 1, image: 4 }) })], emptyCounts(), [])[0]
  check('4 sitelinks serve, so it reads as a recommendation not a fault', !/Below what Google needs/.test(d2.detail), d2.detail)
  check('the standard travels with the finding', !!(d.evidence as { standard: unknown }).standard)
}

console.log('\n--- Performance Max is left alone ---')
// Its assets live in asset groups. Reporting "no sitelinks" against one would
// be a confident finding about the wrong thing.
check('PMax produces no asset finding', evaluateAssets([campaign({ channel: 'PERFORMANCE_MAX' })], emptyCounts(), []).length === 0)
check('SEARCH is audited', isAuditedChannel('SEARCH'))
check('PERFORMANCE_MAX is not', !isAuditedChannel('PERFORMANCE_MAX'))

console.log('\n--- ad groups ---')
{
  const groups = [
    { campaignId: '1', campaignName: 'Search', adGroupId: 'a', adGroupName: 'Windshield', rsaCount: 0, headlines: 0, descriptions: 0 },
    { campaignId: '1', campaignName: 'Search', adGroupId: 'b', adGroupName: 'Chip', rsaCount: 1, headlines: 2, descriptions: 1 },
    { campaignId: '1', campaignName: 'Search', adGroupId: 'c', adGroupName: 'ADAS', rsaCount: 1, headlines: 15, descriptions: 4 },
  ]
  const drafts = evaluateAssets([campaign({ own: FULL })], emptyCounts(), groups)
  check('one finding per campaign, not per ad group', drafts.length === 1, JSON.stringify(drafts.map((d) => d.title)))
  const e = drafts[0].evidence as { adGroupsWithNoAd: string[]; adGroupsWithThinAds: string[] }
  check('the ad group with no live ad is named', e.adGroupsWithNoAd.join() === 'Windshield', JSON.stringify(e))
  check('the thin one is named with its counts', /Chip \(2h\/1d\)/.test(e.adGroupsWithThinAds.join()), JSON.stringify(e))
  check('the healthy one is not mentioned', !JSON.stringify(e).includes('ADAS'))
  check('it is its own check, so it resolves separately', drafts[0].check === AD_GROUP_ADS_CHECK)
}

console.log('\n--- parsing Google’s row shapes ---')
{
  // Two enabled RSAs in one ad group: the BEST counts, not the last read.
  const rows = [
    { campaign: { id: '1', name: 'Search' }, adGroup: { id: 'a', name: 'Windshield' },
      adGroupAd: { ad: { type: 'RESPONSIVE_SEARCH_AD', responsiveSearchAd: { headlines: Array(15).fill({}), descriptions: Array(4).fill({}) } } } },
    { campaign: { id: '1', name: 'Search' }, adGroup: { id: 'a', name: 'Windshield' },
      adGroupAd: { ad: { type: 'RESPONSIVE_SEARCH_AD', responsiveSearchAd: { headlines: Array(3).fill({}), descriptions: Array(2).fill({}) } } } },
  ]
  const parsed = parseAdGroupAds(rows)
  check('two ads collapse to one ad group', parsed.length === 1)
  check(`the strongest ad is the one judged (${parsed[0].headlines}h)`, parsed[0].headlines === 15 && parsed[0].descriptions === 4)
  check('both ads are counted', parsed[0].rsaCount === 2)
}
{
  const accountRows = [
    { customerAsset: { fieldType: 'SITELINK' } },
    { customerAsset: { fieldType: 'SITELINK' } },
    { customerAsset: { fieldType: 'CALLOUT' } },
    // A type this check does not judge must not become a count of something else.
    { customerAsset: { fieldType: 'PROMOTION' } },
  ]
  const acct = countAssets(accountRows).get('') ?? emptyCounts()
  check(`account: ${acct.sitelink} sitelinks, ${acct.callout} callouts`, acct.sitelink === 2 && acct.callout === 1)
  check('an unjudged type is ignored', Object.values(acct).reduce((a, b) => a + b, 0) === 3)

  const campaignRows = [
    { campaign: { id: 'customers/123/campaigns/456' }, campaignAsset: { fieldType: 'SITELINK' } },
    { campaign: { id: 'customers/123/campaigns/456' }, campaignAsset: { fieldType: 'SITELINK' } },
  ]
  // Resource names arrive as a path; the id is the last segment.
  const perCampaign = countAssets(campaignRows, 'campaign.id')
  check('campaign resource names reduce to the id', perCampaign.get('456')?.sitelink === 2, JSON.stringify([...perCampaign]))
}

console.log('\n--- the standard itself ---')
check('the sitelink target is 6', ASSET_STANDARD.targets.sitelink === 6)
check('every target is at or above its serving minimum',
  (Object.keys(ASSET_STANDARD.minimums) as Array<keyof typeof ASSET_STANDARD.minimums>)
    .every((k) => ASSET_STANDARD.targets[k] >= ASSET_STANDARD.minimums[k]))
check('the campaign check has its own name', CAMPAIGN_ASSET_CHECK === 'campaign-assets')

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
