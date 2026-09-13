import { adsSearch } from '@/lib/google-ads'
import { prisma } from '@/lib/db'
import { getResponseTime } from '@/lib/response-time'
import { fileFindings, type FindingDraft, type DailyRunSummary } from '@/lib/google-ads-checks'
import {
  ASSET_CLAIM_CHECK,
  assetClaimProblems,
  evaluateAssetClaims,
  type AdCopyLine,
  type ClaimFacts,
} from '@/lib/google-ads-asset-claims'

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
  targets: {
    sitelink: 6,
    callout: 4,
    structuredSnippet: 2,
    call: 1,
    image: 4,
  },
  /**
   * COUNTED BUT NOT REQUIRED. A business name and logo are part of what a
   * search ad can show now and the audit could not see them at all, so they
   * are counted and reported — but they are deliberately NOT targets, because
   * the field_type enum spellings here have not been verified against a live
   * account. A target built on a guessed enum counts zero forever and files a
   * finding nobody can ever clear, which is precisely how a check teaches
   * people to scroll past it. Promote them once a real account confirms the
   * names.
   */
  reported: { businessName: 1, businessLogo: 1 },
} as const

export type AssetKind =
  | keyof typeof ASSET_STANDARD.targets
  | keyof typeof ASSET_STANDARD.reported

/** What each one is called on screen, so a finding reads like the interface. */
const LABELS: Record<AssetKind, string> = {
  sitelink: 'sitelinks',
  callout: 'callouts',
  structuredSnippet: 'structured snippets',
  call: 'call asset',
  image: 'images',
  businessName: 'business name',
  businessLogo: 'business logo',
}

/**
 * Google's field_type enum → our key. Anything else is ignored.
 *
 * BUSINESS_NAME and BUSINESS_LOGO are here because they are part of what a
 * search ad can show now, and they were invisible to this audit — an account
 * with neither passed the coverage check with nothing to say about it. They
 * count as one each and never gate serving, so a client missing them gets a
 * line in an existing finding rather than a new alarm.
 */
const FIELD_TYPES: Record<string, AssetKind> = {
  SITELINK: 'sitelink',
  CALLOUT: 'callout',
  STRUCTURED_SNIPPET: 'structuredSnippet',
  CALL: 'call',
  IMAGE: 'image',
  BUSINESS_NAME: 'businessName',
  BUSINESS_LOGO: 'businessLogo',
  LOGO: 'businessLogo',
  LANDSCAPE_LOGO: 'businessLogo',
}

export type AssetCounts = Record<AssetKind, number>

export const emptyCounts = (): AssetCounts => ({
  sitelink: 0,
  callout: 0,
  structuredSnippet: 0,
  call: 0,
  image: 0,
  businessName: 0,
  businessLogo: 0,
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
  const targets = ASSET_STANDARD.targets as Record<string, number>
  for (const kind of Object.keys(targets) as AssetKind[]) {
    const { count, level } = effective(campaign.own, account, kind)
    const target = targets[kind]
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
            .map(
              (m) =>
                `${m.label} (${m.have}, needs ${(ASSET_STANDARD.minimums as Record<string, number>)[m.kind]})`
            )
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
        // Counted, not required — see ASSET_STANDARD.reported.
        alsoPresent: {
          businessName: effective(campaign.own, account, 'businessName').count,
          businessLogo: effective(campaign.own, account, 'businessLogo').count,
        },
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

/**
 * Asset rows → lines of copy with a place to edit them.
 *
 * Each kind carries its text in a different field, and a sitelink carries
 * THREE — the link text and two descriptions — which is where most of the
 * claims actually live: "Windshield Replacement" is harmless, and the
 * "$0 with most FL insurance" underneath it is the whole point of checking.
 * A structured snippet's values are a list, and each value is a claim on its
 * own, so they are flattened rather than joined.
 */
export function parseAssetCopy(rows: Row[], level: 'campaign' | 'account'): AdCopyLine[] {
  const lines: AdCopyLine[] = []
  for (const row of rows) {
    const campaign = level === 'campaign' ? str(get(row, 'campaign.name')) : undefined
    const kind = str(get(row, `${level === 'campaign' ? 'campaignAsset' : 'customerAsset'}.fieldType`))
    const push = (where: string, text: unknown) => {
      const value = str(text)
      if (value) lines.push({ where, text: value, ...(campaign ? { campaign } : {}) })
    }

    const linkText = str(get(row, 'asset.sitelinkAsset.linkText'))
    if (linkText) {
      const label = `Sitelink “${linkText}”`
      push(label, linkText)
      push(`${label} line 1`, get(row, 'asset.sitelinkAsset.description1'))
      push(`${label} line 2`, get(row, 'asset.sitelinkAsset.description2'))
      continue
    }

    const callout = get(row, 'asset.calloutAsset.calloutText')
    if (str(callout)) {
      push('Callout', callout)
      continue
    }

    const header = str(get(row, 'asset.structuredSnippetAsset.header'))
    const values = get(row, 'asset.structuredSnippetAsset.values')
    if (Array.isArray(values)) {
      for (const value of values) {
        push(`Structured snippet (${header || 'values'})`, value)
      }
      continue
    }

    const phone = get(row, 'asset.callAsset.phoneNumber')
    if (str(phone)) {
      push('Call asset', phone)
      continue
    }

    // A kind with no text of its own (an image, a logo). Nothing to read.
    if (!kind) continue
  }
  return lines
}

/** RSA headlines and descriptions as lines of copy, for the same screen. */
export function rsaCopy(rows: Row[]): AdCopyLine[] {
  const lines: AdCopyLine[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const campaign = str(get(row, 'campaign.name'))
    for (const [field, label] of [
      ['ad_group_ad.ad.responsive_search_ad.headlines', 'RSA headline'],
      ['ad_group_ad.ad.responsive_search_ad.descriptions', 'RSA description'],
    ] as const) {
      const parts = get(row, field)
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        const text = str((part as { text?: unknown })?.text)
        // The same headline is on every ad in every ad group; one line each.
        const key = `${label}|${text}`
        if (!text || seen.has(key)) continue
        seen.add(key)
        lines.push({ where: label, text, ...(campaign ? { campaign } : {}) })
      }
    }
  }
  return lines
}

/**
 * The facts the copy is checked against, read once per client.
 *
 * Every one of these is either operator-entered or measured. `knownPhones` is
 * the list a call asset is allowed to name: the real line, whatever the site
 * displays, and every tracking number this app has bought for them.
 */
async function claimFacts(clientId: string): Promise<ClaimFacts | null> {
  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: {
        state: true,
        phone: true,
        siteDisplayPhone: true,
        serviceAreas: true,
        offersMobileService: true,
        filesInsuranceClaims: true,
        smsCapable: true,
        offersWindshieldReplacement: true,
        offersWindshieldRepair: true,
        offersRockChipRepair: true,
        offersSideWindowRepair: true,
        offersBackWindowRepair: true,
        offersSunroofRepair: true,
        offersAdasCalibration: true,
        locations: { select: { city: true, phone: true } },
        trackingNumbers: { select: { phoneNumber: true } },
        siteContent: { select: { warrantyText: true } },
      },
    })
    .catch(() => null)
  if (!client) return null

  /* MEASURED, and only when there is enough of it to mean anything. A median
     from three leads is not evidence that a shop is slow, and a finding built
     on it would be argued with correctly. */
  const stats = await getResponseTime(clientId).catch(() => null)
  const response = stats && stats.measured >= 8 ? stats.medianMinutes : null

  return {
    state: client.state,
    serviceAreas: client.serviceAreas || [],
    shopCities: client.locations.map((l) => l.city).filter(Boolean),
    offersMobileService: client.offersMobileService,
    filesInsuranceClaims: client.filesInsuranceClaims,
    smsCapable: client.smsCapable,
    hasWarrantyTerms: !!client.siteContent?.warrantyText?.trim(),
    services: {
      offersWindshieldReplacement: client.offersWindshieldReplacement,
      offersWindshieldRepair: client.offersWindshieldRepair,
      offersRockChipRepair: client.offersRockChipRepair,
      offersSideWindowRepair: client.offersSideWindowRepair,
      offersBackWindowRepair: client.offersBackWindowRepair,
      offersSunroofRepair: client.offersSunroofRepair,
      offersAdasCalibration: client.offersAdasCalibration,
    },
    knownPhones: [
      client.phone,
      client.siteDisplayPhone,
      ...client.locations.map((l) => l.phone),
      ...client.trackingNumbers.map((t) => t.phoneNumber),
    ].filter((p): p is string => !!p),
    medianResponseMinutes: response,
  }
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

  /* THE ASSET TEXT, which this audit never read. Counting them proved an
     account had a full set and said nothing about a full set advertising work
     the shop does not do. Its own query and its own failure path: the copy
     check is worth having, and it is not worth losing the COUNT check when
     Google will not return the text — so a failure here is reported and the
     coverage findings above still file. */
  const copyFields =
    `asset.sitelink_asset.link_text, asset.sitelink_asset.description1,
     asset.sitelink_asset.description2, asset.callout_asset.callout_text,
     asset.structured_snippet_asset.header, asset.structured_snippet_asset.values,
     asset.call_asset.phone_number`
  const [campaignCopy, accountCopy] = await Promise.all([
    adsSearch(
      customerId,
      `SELECT campaign.name, campaign_asset.field_type, ${copyFields}
       FROM campaign_asset
       WHERE campaign_asset.status = 'ENABLED' AND campaign.status = 'ENABLED'`
    ),
    adsSearch(
      customerId,
      `SELECT customer_asset.field_type, ${copyFields}
       FROM customer_asset WHERE customer_asset.status = 'ENABLED'`
    ),
  ])

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

  const drafts = evaluateAssets(campaigns, account, parseAdGroupAds(adRows.rows))
  const judged = new Set([CAMPAIGN_ASSET_CHECK, AD_GROUP_ADS_CHECK])

  /* WHAT THE ASSETS SAY. Only when the text actually came back: a check that
     is told it "ran" while its fetch failed auto-resolves every finding it
     filed last week, which is the rule the whole sweep is built on. So
     ASSET_CLAIM_CHECK joins `judged` here and nowhere else. */
  if (campaignCopy.ok && accountCopy.ok) {
    const facts = await claimFacts(client.id)
    if (facts) {
      const lines: AdCopyLine[] = [
        ...parseAssetCopy(campaignCopy.rows, 'campaign'),
        ...parseAssetCopy(accountCopy.rows, 'account'),
        // THE RSA TEXT IS ALREADY IN HAND, and a headline makes exactly the
        // same claims a callout does — "Same-Day Service" is no more true in
        // one than the other. Free coverage of the copy that gets read most.
        ...rsaCopy(adRows.rows),
      ]
      drafts.push(...evaluateAssetClaims(assetClaimProblems(lines, facts), client))
      judged.add(ASSET_CLAIM_CHECK)
    }
  } else {
    summary.errors.push({
      client: client.businessName,
      error: `asset text unreadable, copy not checked: ${
        !campaignCopy.ok ? campaignCopy.error : (accountCopy as { error: string }).error
      }`,
    })
  }

  await fileFindings(
    client,
    customerId,
    'WEEKLY',
    drafts,
    judged,
    summary as Pick<DailyRunSummary, 'newFindings' | 'resolved' | 'stillOpen'>
  )
}
