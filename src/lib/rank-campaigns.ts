import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import {
  SCAN_PRESETS,
  campaignMapUrl,
  createScheduledScan,
  getScheduledScanSchedule,
  suggestedKeywords,
  localDominatorKey,
  updateScheduledScan,
  updateScheduledScanSchedule,
} from '@/lib/local-dominator'

/**
 * Monthly, unambiguously, when their scheduler turns out to OR day-of-month
 * against day-of-week. Lands on a weekday most months and never more than
 * once a month, which is the property that actually matters for billing.
 */
const SAFE_MONTHLY_CRON = '0 19 2 * *'

/** First Tuesday: a Tuesday, within the next five weeks. */
function looksLikeFirstTuesday(iso: string | null | undefined): boolean {
  if (!iso) return false
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return false
  return at.getUTCDay() === 2 && at.getTime() - Date.now() < 35 * 24 * 3_600_000
}
import { rankWebhookUrl } from '@/lib/local-rank-token'

/**
 * Every client gets rank tracking, without anyone switching it on.
 *
 * There is no enable step and no toggle — a client with an account has
 * rankings the same way they have leads. The tier follows what they already
 * are: an SEO client is scanned weekly on four keywords, everyone else
 * monthly on two, which doubles as the evidence for selling them the
 * upgrade.
 *
 * This is a sweep rather than a hook on client creation, because it also has
 * to catch the cases a create-time hook misses: a client who gained
 * coordinates later, one whose SEO status changed, and one whose campaign
 * failed to create the first time. Running it repeatedly is safe and is the
 * point — it converges rather than needing to fire at exactly the right
 * moment.
 */

export interface EnsureResult {
  created: number
  /** Campaigns whose live map URL was captured or refreshed this pass. */
  mapped: number
  skipped: number
  backfilled: number
  errors: Array<{ client: string; error: string }>
}

/** Coordinates from the stored Place ID, for clients captured before we kept them. */
async function backfillCoordinates(
  clientId: string,
  placeId: string
): Promise<{ latitude: number; longitude: number } | null> {
  const setting = await prisma.setting
    .findUnique({ where: { key: 'GOOGLE_PLACES_API_KEY' } })
    .catch(() => null)
  const apiKey = setting?.encrypted
    ? decrypt(setting.value)
    : setting?.value || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const loc = data?.result?.geometry?.location
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null
    await prisma.client
      .update({ where: { id: clientId }, data: { latitude: loc.lat, longitude: loc.lng } })
      .catch(() => {})
    return { latitude: loc.lat, longitude: loc.lng }
  } catch {
    return null
  }
}

/**
 * Move an existing campaign onto the tier the client is now on.
 *
 * Moving a shop onto the SEO plan has to change the campaign, not just the
 * flag: four keywords instead of two, weekly instead of monthly. Without
 * this the plan changes, the invoice changes, and the scan carries on
 * exactly as before — which is the kind of gap nobody notices until a client
 * asks why their new keywords never appeared.
 *
 * Downgrades retire the extra keywords rather than deleting them, so the
 * months already measured stay in the series and simply stop extending.
 *
 * Safe to call when nothing changed: it sends the tier's current shape, and
 * their API treats an identical PATCH as a no-op.
 */
export async function syncCampaignTier(
  clientId: string
): Promise<{ ok: boolean; message: string }> {
  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: {
        businessName: true,
        seoClient: true,
        rankTrackingId: true,
        rankKeywords: true,
        offersMobileService: true,
        offersSideWindowRepair: true,
      },
    })
    .catch(() => null)

  if (!client?.rankTrackingId) {
    // No campaign yet: the daily sweep will create one at the right tier.
    return { ok: true, message: 'No campaign to update yet.' }
  }

  const tier = client.seoClient ? 'seo' : 'standard'
  const preset = SCAN_PRESETS[tier]
  const suggested = suggestedKeywords(tier, {
    offersMobileService: client.offersMobileService,
    offersSideWindowRepair: client.offersSideWindowRepair,
  })

  // Keep what is already tracked, in order, and top up from the suggestions
  // for the new tier. An upgrade must not renumber or replace the keywords a
  // client has months of history on.
  const kept = client.rankKeywords.filter((k) => k.trim())
  const active: string[] = []
  for (const term of [...kept, ...suggested]) {
    if (active.length >= preset.maxKeywords) break
    if (!active.some((a) => a.toLowerCase() === term.toLowerCase())) active.push(term)
  }
  const retired = kept.filter((k) => !active.some((a) => a.toLowerCase() === k.toLowerCase()))

  const result = await updateScheduledScan(client.rankTrackingId, {
    searchTerms: active,
    retireTerms: retired,
    scheduling: preset.cron,
    distance: preset.distance,
    gridSize: preset.gridSize,
  })

  if (!result.ok) return { ok: false, message: result.error }

  await prisma.client
    .update({ where: { id: clientId }, data: { rankKeywords: active } })
    .catch(() => {})

  const added = active.filter((a) => !kept.some((k) => k.toLowerCase() === a.toLowerCase()))
  const parts = [`${tier === 'seo' ? 'Weekly' : 'Monthly'} on ${active.length} keywords`]
  if (added.length) parts.push(`added ${added.join(', ')}`)
  if (retired.length) parts.push(`retired ${retired.join(', ')}`)
  return { ok: true, message: parts.join(' · ') }
}

export async function ensureRankCampaigns(origin: string): Promise<EnsureResult> {
  const result: EnsureResult = { created: 0, mapped: 0, skipped: 0, backfilled: 0, errors: [] }

  if (!(await localDominatorKey())) {
    // Not configured is not an error: the whole feature is simply off until
    // a key exists, and a daily cron should not shout about that.
    return result
  }

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', googlePlaceId: { not: null }, rankTrackingId: null },
    select: {
      id: true,
      businessName: true,
      googlePlaceId: true,
      latitude: true,
      longitude: true,
      seoClient: true,
      rankKeywords: true,
      offersMobileService: true,
      offersSideWindowRepair: true,
    },
  })

  // Resolved from the first monthly campaign created, then reused. The
  // expression `0 19 1-7 * 2` is "first Tuesday" only if their scheduler ANDs
  // day-of-month with day-of-week; classic cron ORs them, which reads as
  // every Tuesday — four times the runs and four times the credits for a
  // client paying for one scan a month. Their docs do not say which, so the
  // first one created is asked rather than assumed.
  let monthlyCron: string | null = null

  for (const client of clients) {
    let lat = client.latitude
    let lng = client.longitude

    if ((lat === null || lng === null) && client.googlePlaceId) {
      const coords = await backfillCoordinates(client.id, client.googlePlaceId)
      if (coords) {
        lat = coords.latitude
        lng = coords.longitude
        result.backfilled++
      }
    }

    if (lat === null || lng === null) {
      // No grid centre, no scan. Nothing is broken; the client simply has no
      // usable Place ID yet.
      result.skipped++
      continue
    }

    const tier = client.seoClient ? 'seo' : 'standard'
    const keywords =
      client.rankKeywords.length > 0
        ? client.rankKeywords
        : suggestedKeywords(tier, {
            offersMobileService: client.offersMobileService,
            offersSideWindowRepair: client.offersSideWindowRepair,
          })

    const created = await createScheduledScan({
      googlePlaceId: client.googlePlaceId as string,
      latitude: lat,
      longitude: lng,
      searchTerms: keywords,
      tier,
      webhookUrl: rankWebhookUrl(origin, client.id),
      alias: client.businessName,
      ...(tier === 'standard' && monthlyCron ? { cron: monthlyCron } : {}),
    })

    if (!created.ok) {
      result.errors.push({ client: client.businessName, error: created.error })
      continue
    }

    // The canary. Read back what their scheduler made of the expression; if
    // it is not a first Tuesday, this one and every monthly campaign after it
    // gets the unambiguous form instead.
    if (tier === 'standard' && monthlyCron === null) {
      const schedule = await getScheduledScanSchedule(created.id)
      if (looksLikeFirstTuesday(schedule?.nextRunAt)) {
        monthlyCron = SCAN_PRESETS.standard.cron
        console.log(`[RankCampaigns] first-Tuesday confirmed (next run ${schedule?.nextRunAt})`)
      } else {
        monthlyCron = SAFE_MONTHLY_CRON
        await updateScheduledScanSchedule(created.id, monthlyCron)
        console.warn(
          `[RankCampaigns] first-Tuesday NOT honoured (next run ${schedule?.nextRunAt}); ` +
            `monthly campaigns use ${monthlyCron}`
        )
      }
    }

    await prisma.client.update({
      where: { id: client.id },
      data: { rankTrackingId: created.id, rankKeywords: keywords },
    })
    result.created++
    console.log(`[RankCampaigns] ${client.businessName}: ${tier} campaign ${created.id}`)
  }

  // Capture (or refresh) each campaign's map URL. Their share links only
  // resolve once a run has completed, so a campaign created a moment ago
  // usually has none yet — which is why this is a daily sweep rather than a
  // one-shot at creation. It is also how the URL stays right: they repoint it
  // as runs complete, and a stored URL that is never re-read goes stale.
  const withCampaigns = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: { id: true, businessName: true, rankTrackingId: true, rankMapUrl: true },
    })
    .catch(() => [])

  for (const client of withCampaigns) {
    const url = await campaignMapUrl(client.rankTrackingId as string)
    if (!url || url === client.rankMapUrl) continue
    await prisma.client
      .update({ where: { id: client.id }, data: { rankMapUrl: url } })
      .catch(() => {})
    result.mapped++
    console.log(`[RankCampaigns] ${client.businessName}: map url captured`)
  }

  return result
}
