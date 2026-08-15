import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import {
  campaignMapUrl,
  createScheduledScan,
  suggestedKeywords,
  localDominatorKey,
} from '@/lib/local-dominator'
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
    })

    if (!created.ok) {
      result.errors.push({ client: client.businessName, error: created.error })
      continue
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
