import { adsSearch } from '@/lib/google-ads'
import { fileFindings, type FindingDraft, type DailyRunSummary } from '@/lib/google-ads-checks'

/**
 * Does every campaign carry the assets it should?
 *
 * WHY THIS IS A CHECK AND NOT A HABIT. Sitelinks, callouts, snippets and a
 * call asset are set once at launch and then never looked at again, and
 * nothing in Google's interface goes red when they are missing — a campaign
 * with two sitelinks and no snippets spends its budget perfectly happily,
 * serving a smaller ad than the competitor beside it. There is no error, no
 * warning and no report; the only symptom is a CTR nobody has anything to
 * compare against. Across fifteen accounts nobody is going to open each
 * campaign's asset tab every month.
 *
 * THE LEVEL RULE IS THE WHOLE DIFFICULTY. Assets attach at three levels and
 * the MOST SPECIFIC one wins outright — it does not add. A campaign with two
 * campaign-level sitelinks shows two, even when the account has six, because
 * its own set overrides the account's. So counting every level together would
 * pass exactly the campaign that is worst off, and counting only the campaign
 * level would fail every account that sensibly sets them once at the top.
 * `effective()` below is that rule, and it is why this is worth writing down
 * rather than eyeballing.
 *
 * Read-only, like every other audit here.
 */

/**
 * What a campaign should have. Named, because a threshold buried in a
 * condition is one nobody can argue with or change.
 *
 * These are Google's own recommendations, not house opinion: two sitelinks is
 * the minimum to serve at all, four is what Google asks for, and six is the
 * number that fills the space on a phone. Callouts and snippets follow the
 * same shape — a minimum that serves and a target that competes.
 */
export const ASSET_STANDARD = {
  /** Below this the extension cannot serve at all. */
  minimums: { sitelink: 2, callout: 2, structuredSnippet: 1 },
  targets: { sitelink: 6, callout: 4, structuredSnippet: 2, call: 1, image: 4 },
} as const

export type AssetKind = keyof typeof ASSET_STANDARD.targets

/** What each one is called on screen, so a finding reads like the interface. */
const LABELS: Record<AssetKind, string> = {
  sitelink: 'sitelinks',
  callout: 'callouts',
  structuredSnippet: 'structured snippets',
  call: 'call asset',
  image: 'images',
}

/** Google's field_type enum → our key. Anything else is ignored. */
const FIELD_TYPES: Record<string, AssetKind> = {
  SITELINK: 'sitelink',
  CALLOUT: 'callout',
  STRUCTURED_SNIPPET: 'structuredSnippet',
  CALL: 'call',
  IMAGE: 'image',
}

export type AssetCounts = Record<AssetKind, number>

export const emptyCounts = (): AssetCounts => ({
  sitelink: 0,
  callout: 0,
  structuredSnippet: 0,
  call: 0,
  image: 0,
})

export interface CampaignAssets {
  id: string
  name: string
  /** advertising_channel_type, verbatim. */
  channel: string
  own: AssetCounts
}

export interface AdGroupAds {
  campaignId: string
  campaignName: string
  adGroupId: string
  adGroupName: string
  /** Enabled responsive search ads in this ad group. */
  rsaCount: number
  /** The best headline and description counts across those ads. */
  headlines: number
  descriptions: number
}

/**
 * What actually serves for this campaign, and from where.
 *
 * The most specific level WINS rather than adding — see the note at the top.
 * A campaign that sets even one of its own overrides the account's entire set.
 */
export function effective(
  own: AssetCounts,
  account: AssetCounts,
  kind: AssetKind
): { count: number; level: 'campaign' | 'account' | 'none' } {
  if (own[kind] > 0) return { count: own[kind], level: 'campaign' }
  if (account[kind] > 0) return { count: account[kind], level: 'account' }
  return { count: 0, level: 'none' }
}

/**
 * Only campaign types where these assets do anything.
 *
 * Performance Max carries its assets inside asset GROUPS and is judged on a
 * different standard entirely; reporting "no sitelinks" against one would be
 * a finding about the wrong thing. Better to say nothing than to be
 * confidently wrong about a campaign type this check does not understand.
 */
const AUDITED_CHANNELS = new Set(['SEARCH', 'MULTI_CHANNEL', 'DISPLAY', 'SHOPPING'])
export const isAuditedChannel = (channel: string) => AUDITED_CHANNELS.has(channel)

export interface AssetShortfall {
  kind: AssetKind
  label: string
  have: number
  target: number
  /** True when it is below the count Google needs to show it at all. */
  belowServingMinimum: boolean
  level: 'campaign' | 'account' | 'none'
}

/** Every asset a campaign is short of, in the order they matter. */
export function shortfalls(campaign: CampaignAssets, account: AssetCounts): AssetShortfall[] {
  const out: AssetShortfall[] = []
  for (const kind of Object.keys(ASSET_STANDARD.targets) as AssetKind[]) {
    const { count, level } = effective(campaign.own, account, kind)
    const target = ASSET_STANDARD.targets[kind]
    if (count >= target) continue
    const min = (ASSET_STANDARD.minimums as Partial<Record<AssetKind, number>>)[kind]
    out.push({
      kind,
      label: LABELS[kind],
      have: count,
      target,
      belowServingMinimum: min !== undefined && count < min,
      level,
    })
  }
  return out
}

export const CAMPAIGN_ASSET_CHECK = 'campaign-assets'
export const AD_GROUP_ADS_CHECK = 'ad-group-ads'

/**
 * The findings, from parsed rows. PURE — no fetch, so the thresholds can be
 * re-checked against saved responses from a real account without credentials.
 */
export function evaluateAssets(
  campaigns: CampaignAssets[],
  account: AssetCounts,
  adGroups: AdGroupAds[]
): FindingDraft[] {
  const drafts: FindingDraft[] = []

  for (const campaign of campaigns) {
    if (!isAuditedChannel(campaign.channel)) continue
    const missing = shortfalls(campaign, account)
    if (!missing.length) continue

    // "3 of 6 sitelinks" reads at a glance; a list of field types does not.
    const summary = missing.map((m) => `${m.have} of ${m.target} ${m.label}`).join(', ')
    const cannotServe = missing.filter((m) => m.belowServingMinimum)
    drafts.push({
      check: CAMPAIGN_ASSET_CHECK,
      // REVIEW, never ALERT. Nothing is on fire — the campaign spends and
      // converts either way — and the daily ALERT signal only stays scary if
      // it is kept for money moving in the wrong direction right now.
      severity: 'REVIEW',
      entity: `campaign:${campaign.id}`,
      title: `${campaign.name}: ${summary}`,
      detail: cannotServe.length
        ? `Below what Google needs to show them at all: ${cannotServe
            .map((m) => `${m.label} (${m.have}, needs ${ASSET_STANDARD.minimums[m.kind as keyof typeof ASSET_STANDARD.minimums]})`)
            .join(', ')}. The rest of the ad is being served without them.`
        : 'These serve, but below the count Google recommends — the ad takes less space than a competitor with a full set.',
      evidence: {
        campaign: campaign.name,
        campaignId: campaign.id,
        channel: campaign.channel,
        // The level is in the evidence because it is the difference between
        // "add six to this campaign" and "the account's six are being
        // overridden by the two set here".
        missing: missing.map((m) => ({
          asset: m.label,
          have: m.have,
          target: m.target,
          servingFrom: m.level,
          belowServingMinimum: m.belowServingMinimum,
        })),
        standard: ASSET_STANDARD,
      },
    })
  }

  /* AN AD GROUP WITH NO ENABLED AD SPENDS NOTHING AND SHOWS NOTHING, and it is
     invisible in every report that starts from spend — it simply has no rows.
     Grouped per campaign so one finding names them all rather than filing one
     per ad group. */
  const byCampaign = new Map<string, { name: string; empty: string[]; thin: string[] }>()
  for (const group of adGroups) {
    const entry = byCampaign.get(group.campaignId) ?? {
      name: group.campaignName,
      empty: [],
      thin: [],
    }
    if (group.rsaCount === 0) entry.empty.push(group.adGroupName)
    // Google's own minimum is 3 headlines and 2 descriptions; it asks for 15
    // and 4. Below the minimum the ad is weaker than the format allows.
    else if (group.headlines < 3 || group.descriptions < 2) {
      entry.thin.push(`${group.adGroupName} (${group.headlines}h/${group.descriptions}d)`)
    }
    byCampaign.set(group.campaignId, entry)
  }

  for (const [campaignId, entry] of byCampaign) {
    if (!entry.empty.length && !entry.thin.length) continue
    const parts: string[] = []
    if (entry.empty.length) parts.push(`${entry.empty.length} with no live ad`)
    if (entry.thin.length) parts.push(`${entry.thin.length} with a thin responsive ad`)
    drafts.push({
      check: AD_GROUP_ADS_CHECK,
      severity: 'REVIEW',
      entity: `campaign:${campaignId}`,
      title: `${entry.name}: ${parts.join(', ')}`,
      detail: entry.empty.length
        ? 'An ad group with no enabled ad cannot serve at all, and shows up nowhere in a spend report because it has no spend.'
        : 'Below Google’s minimum of 3 headlines and 2 descriptions, so the responsive ad has little to assemble from.',
      evidence: {
        campaign: entry.name,
        campaignId,
        adGroupsWithNoAd: entry.empty,
        adGroupsWithThinAds: entry.thin,
        recommended: { headlines: 15, descriptions: 4 },
        minimum: { headlines: 3, descriptions: 2 },
      },
    })
  }

  return drafts
}

// ------------------------------------------------------------------- fetching

type Row = Record<string, unknown>
const get = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row)
const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''))

/** Count enabled assets by type, from customer_asset or campaign_asset rows. */
export function countAssets(rows: Row[], campaignPath?: string): Map<string, AssetCounts> {
  const out = new Map<string, AssetCounts>()
  for (const row of rows) {
    const kind = FIELD_TYPES[str(get(row, campaignPath ? 'campaignAsset.fieldType' : 'customerAsset.fieldType'))]
    if (!kind) continue
    // Campaign resource names arrive as "customers/123/campaigns/456".
    const key = campaignPath ? str(get(row, campaignPath)).split('/').pop() || '' : ''
    const counts = out.get(key) ?? emptyCounts()
    counts[kind] += 1
    out.set(key, counts)
  }
  return out
}

export function parseAdGroupAds(rows: Row[]): AdGroupAds[] {
  const byGroup = new Map<string, AdGroupAds>()
  for (const row of rows) {
    const adGroupId = str(get(row, 'adGroup.id'))
    if (!adGroupId) continue
    const entry = byGroup.get(adGroupId) ?? {
      campaignId: str(get(row, 'campaign.id')),
      campaignName: str(get(row, 'campaign.name')),
      adGroupId,
      adGroupName: str(get(row, 'adGroup.name')),
      rsaCount: 0,
      headlines: 0,
      descriptions: 0,
    }
    const type = str(get(row, 'adGroupAd.ad.type'))
    if (type === 'RESPONSIVE_SEARCH_AD') {
      entry.rsaCount += 1
      const h = (get(row, 'adGroupAd.ad.responsiveSearchAd.headlines') as unknown[] | undefined) ?? []
      const d =
        (get(row, 'adGroupAd.ad.responsiveSearchAd.descriptions') as unknown[] | undefined) ?? []
      // The BEST ad in the group, not the last one read: one strong ad beside
      // a stub is not a thin ad group.
      entry.headlines = Math.max(entry.headlines, h.length)
      entry.descriptions = Math.max(entry.descriptions, d.length)
    }
    byGroup.set(adGroupId, entry)
  }
  return [...byGroup.values()]
}

/**
 * Read one account and file what is missing.
 *
 * Its own fileFindings call, like the campaign-goal check: a failure in the
 * playbook must not swallow this, and its auto-resolve must only ever touch
 * its own two checks. When the account cannot be READ nothing is filed AND
 * nothing is resolved — an API hiccup must never read as "the assets are
 * complete now", which is the same rule every other check here follows.
 */
export async function checkCampaignAssets(
  client: { id: string; businessName: string },
  customerId: string,
  summary: Pick<DailyRunSummary, 'newFindings' | 'resolved' | 'stillOpen' | 'errors'>
): Promise<void> {
  const campaignRows = await adsSearch(
    customerId,
    `SELECT campaign.id, campaign.name, campaign.advertising_channel_type
     FROM campaign WHERE campaign.status = 'ENABLED'`
  )
  if (!campaignRows.ok) {
    summary.errors.push({
      client: client.businessName,
      error: `campaigns unreadable, assets not checked: ${campaignRows.error}`,
    })
    return
  }

  const accountRows = await adsSearch(
    customerId,
    `SELECT customer_asset.field_type, customer_asset.status
     FROM customer_asset WHERE customer_asset.status = 'ENABLED'`
  )
  const campaignAssetRows = await adsSearch(
    customerId,
    `SELECT campaign.id, campaign_asset.field_type, campaign_asset.status
     FROM campaign_asset
     WHERE campaign_asset.status = 'ENABLED' AND campaign.status = 'ENABLED'`
  )
  if (!accountRows.ok || !campaignAssetRows.ok) {
    summary.errors.push({
      client: client.businessName,
      error: `assets unreadable: ${!accountRows.ok ? accountRows.error : (campaignAssetRows as { error: string }).error}`,
    })
    return
  }

  const adRows = await adsSearch(
    customerId,
    `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
            ad_group_ad.ad.type, ad_group_ad.ad.responsive_search_ad.headlines,
            ad_group_ad.ad.responsive_search_ad.descriptions
     FROM ad_group_ad
     WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
       AND ad_group_ad.status = 'ENABLED'`
  )
  if (!adRows.ok) {
    summary.errors.push({
      client: client.businessName,
      error: `ads unreadable, ad groups not checked: ${adRows.error}`,
    })
    return
  }

  const account = countAssets(accountRows.rows).get('') ?? emptyCounts()
  const perCampaign = countAssets(campaignAssetRows.rows, 'campaign.id')
  const campaigns: CampaignAssets[] = campaignRows.rows.map((row) => {
    const id = str(get(row, 'campaign.id'))
    return {
      id,
      name: str(get(row, 'campaign.name')) || id,
      channel: str(get(row, 'campaign.advertisingChannelType')),
      own: perCampaign.get(id) ?? emptyCounts(),
    }
  })

  await fileFindings(
    client,
    customerId,
    'WEEKLY',
    evaluateAssets(campaigns, account, parseAdGroupAds(adRows.rows)),
    new Set([CAMPAIGN_ASSET_CHECK, AD_GROUP_ADS_CHECK]),
    summary as Pick<DailyRunSummary, 'newFindings' | 'resolved' | 'stillOpen'>
  )
}
