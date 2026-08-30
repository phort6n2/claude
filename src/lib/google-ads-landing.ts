import { adsSearch } from '@/lib/google-ads'

/**
 * Do the ads actually land on OUR pages?
 *
 * The whole model — attribution, call tracking, the coached landing pages —
 * only works when the click arrives on the app-hosted site. An ad still
 * pointing at the shop's old website, or a HighLevel funnel, spends the same
 * money and quietly feeds a page with none of the wiring. That is invisible
 * from inside Google Ads, because Google does not know which host is ours.
 *
 * So this reads every place a live click can be sent — ad final URLs
 * (desktop and mobile), Performance Max asset-group URLs, and sitelinks at
 * all three attachment levels — and judges each against the client's own
 * hosts: their glassleads.app subdomain, every custom domain on the record,
 * and the bare /sites/{slug} path. ENABLED things only, on purpose: a paused
 * ad pointing at the wrong page costs nothing, and flagging it would bury
 * the rows that are spending money right now.
 *
 * Reads only, like the conversion audit and for the same reason.
 */

export interface JudgedUrl {
  url: string
  host: string | null
  ok: boolean
}

export interface LandingRow {
  level: 'ad' | 'asset-group' | 'sitelink'
  campaign: string | null
  adGroup: string | null
  /** Ad name/type, asset-group name, or the sitelink's link text. */
  label: string
  urls: JudgedUrl[]
  ok: boolean
}

export interface LandingAudit {
  customerId: string
  allowedHosts: string[]
  rows: LandingRow[]
  checked: number
  offTarget: number
  /** The hosts the stray URLs point at — usually the old site, named. */
  strayHosts: string[]
}

const normalizeHost = (host: string): string => host.toLowerCase().replace(/^www\./, '')

function judge(url: string, allowed: Set<string>, slug: string): JudgedUrl {
  try {
    const parsed = new URL(url)
    const host = normalizeHost(parsed.hostname)
    const ok =
      allowed.has(host) ||
      // The path form every site also answers on. No ad should use it, but
      // it IS our page, so it is not a stray.
      (host === 'glassleads.app' && parsed.pathname.startsWith(`/sites/${slug}`))
    return { url, host, ok }
  } catch {
    // A URL that does not parse cannot be pointing at our pages.
    return { url, host: null, ok: false }
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string') : []

type Row = Record<string, unknown>
const get = (row: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row)

export async function auditLandingUrls(
  customerId: string,
  input: { slug: string; siteSubdomain: string | null; domains: string[] }
): Promise<{ ok: true; audit: LandingAudit } | { ok: false; error: string }> {
  const allowed = new Set<string>()
  if (input.siteSubdomain) allowed.add(`${input.siteSubdomain}.glassleads.app`.toLowerCase())
  for (const domain of input.domains) allowed.add(normalizeHost(domain))

  const rows: LandingRow[] = []
  const push = (
    level: LandingRow['level'],
    campaign: string | null,
    adGroup: string | null,
    label: string,
    urls: string[]
  ) => {
    if (urls.length === 0) return
    const judged = urls.map((url) => judge(url, allowed, input.slug))
    rows.push({ level, campaign, adGroup, label, urls: judged, ok: judged.every((u) => u.ok) })
  }

  // Every enabled ad. final_urls is where the click lands; final_mobile_urls
  // overrides it on phones, which for auto glass is most of the traffic — an
  // audit that skipped it would pass exactly the ads most likely to be wrong.
  const ads = await adsSearch(
    customerId,
    // GAQL wants every field the WHERE clause names to also be SELECTed —
    // found live: "The following field must be present in SELECT clause".
    `SELECT campaign.name, campaign.status, ad_group.name, ad_group.status,
            ad_group_ad.status, ad_group_ad.ad.name, ad_group_ad.ad.type,
            ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls
     FROM ad_group_ad
     WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
       AND ad_group_ad.status = 'ENABLED'`
  )
  if (!ads.ok) return { ok: false, error: ads.error }
  for (const row of ads.rows) {
    const label =
      str(get(row, 'adGroupAd.ad.name')) || String(get(row, 'adGroupAd.ad.type') || 'Ad')
    push(
      'ad',
      str(get(row, 'campaign.name')),
      str(get(row, 'adGroup.name')),
      label,
      [
        ...strings(get(row, 'adGroupAd.ad.finalUrls')),
        ...strings(get(row, 'adGroupAd.ad.finalMobileUrls')),
      ]
    )
  }

  // Performance Max sends clicks through asset groups, not ads.
  const assetGroups = await adsSearch(
    customerId,
    `SELECT campaign.name, campaign.status, asset_group.name, asset_group.status,
            asset_group.final_urls
     FROM asset_group
     WHERE campaign.status = 'ENABLED' AND asset_group.status = 'ENABLED'`
  )
  if (!assetGroups.ok) return { ok: false, error: assetGroups.error }
  for (const row of assetGroups.rows) {
    push(
      'asset-group',
      str(get(row, 'campaign.name')),
      null,
      str(get(row, 'assetGroup.name')) || 'Asset group',
      strings(get(row, 'assetGroup.finalUrls'))
    )
  }

  // Sitelinks are their own clickable URLs and attach at three levels; an
  // account-level sitelink pointing at the old site rides on EVERY campaign.
  const sitelinkQueries = [
    `SELECT customer_asset.field_type, customer_asset.status,
            asset.sitelink_asset.link_text, asset.final_urls
     FROM customer_asset
     WHERE customer_asset.field_type = 'SITELINK' AND customer_asset.status = 'ENABLED'`,
    `SELECT campaign.name, campaign.status, campaign_asset.field_type, campaign_asset.status,
            asset.sitelink_asset.link_text, asset.final_urls
     FROM campaign_asset
     WHERE campaign_asset.field_type = 'SITELINK' AND campaign_asset.status = 'ENABLED'
       AND campaign.status = 'ENABLED'`,
    `SELECT campaign.name, campaign.status, ad_group.name, ad_group.status,
            ad_group_asset.field_type, ad_group_asset.status,
            asset.sitelink_asset.link_text, asset.final_urls
     FROM ad_group_asset
     WHERE ad_group_asset.field_type = 'SITELINK' AND ad_group_asset.status = 'ENABLED'
       AND campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'`,
  ]
  const seenSitelinks = new Set<string>()
  for (const query of sitelinkQueries) {
    const result = await adsSearch(customerId, query)
    if (!result.ok) return { ok: false, error: result.error }
    for (const row of result.rows) {
      const label = str(get(row, 'asset.sitelinkAsset.linkText')) || 'Sitelink'
      const urls = strings(get(row, 'asset.finalUrls'))
      // The same asset attached at several levels is one thing to fix.
      const dedupeKey = `${label}|${urls.join(',')}`
      if (seenSitelinks.has(dedupeKey)) continue
      seenSitelinks.add(dedupeKey)
      push('sitelink', str(get(row, 'campaign.name')), str(get(row, 'adGroup.name')), label, urls)
    }
  }

  const offRows = rows.filter((row) => !row.ok)
  const strayHosts = [
    ...new Set(
      offRows.flatMap((row) => row.urls.filter((u) => !u.ok)).map((u) => u.host || 'unparseable URL')
    ),
  ]

  return {
    ok: true,
    audit: {
      customerId,
      allowedHosts: [...allowed],
      rows,
      checked: rows.length,
      offTarget: offRows.length,
      strayHosts,
    },
  }
}
