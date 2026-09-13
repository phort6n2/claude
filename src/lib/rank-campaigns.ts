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
import { LIVE_STATUSES, siteIsLive } from '@/lib/site-preview'

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
  /** WHO was skipped and why. A count alone is why this went unnoticed. */
  skippedClients: Array<{ client: string; reason: string }>
  errors: Array<{ client: string; error: string }>
}

/**
 * Why this client has no rank campaign — or null when nothing is stopping one.
 *
 * THE REASON THIS EXISTS. Rank tracking has no enable step: every client is
 * supposed to get it, and the daily sweep converges on that. So when a client
 * does NOT have it, there is nothing anywhere that says so — the sweep counted
 * a skip and moved on, the admin Rankings page simply did not list the client,
 * the portal hid its Rankings tab, and the SEO switch said "no campaign yet"
 * without saying whether that meant "wait until tomorrow" or "never".
 *
 * Those two are the whole difference and the operator could not tell them
 * apart. MAG Mobile is the case that surfaced it.
 *
 * Pure: a row in, a verdict out, so `scripts/check-rank-coverage.ts` can hold
 * every case without a database or a key.
 */
export interface RankSetupInput {
  status: string
  googlePlaceId: string | null
  latitude: number | null
  longitude: number | null
  rankTrackingId: string | null
  /** Whether LOCALDOMINATOR_API_KEY is configured at all. */
  keyConfigured: boolean
}

export interface RankSetupState {
  hasCampaign: boolean
  /** True when a press could create one right now. */
  canCreate: boolean
  /** Null when there is nothing to say; otherwise what to do, in words. */
  problem: string | null
}

export function rankSetupState(input: RankSetupInput): RankSetupState {
  if (input.rankTrackingId) {
    return { hasCampaign: true, canCreate: false, problem: null }
  }

  // PAUSED is the kill switch, the same as it is for the site and the
  // directory listing. ONBOARDING is NOT: those sites are live and taking
  // leads, so they are tracked — see LIVE_STATUSES.
  if (!siteIsLive(input.status)) {
    return {
      hasCampaign: false,
      canCreate: false,
      problem: `This client is ${input.status}, so nothing is scanned. Set the status on the Business tab.`,
    }
  }
  if (!input.keyConfigured) {
    return {
      hasCampaign: false,
      canCreate: false,
      problem:
        'No Local Dominator API key is configured, so rank tracking is off for every client (Settings → API keys).',
    }
  }
  if (!input.googlePlaceId) {
    return {
      hasCampaign: false,
      canCreate: false,
      problem:
        'No Google Business Profile is linked, and the grid is centred on it. Search for the business on the Business tab.',
    }
  }
  // Coordinates are NOT a blocker: the sweep backfills them from the Place ID.
  // Said out loud anyway, because it is the one case where a press can fail
  // for a reason nobody could have predicted from this screen.
  if (input.latitude === null || input.longitude === null) {
    return {
      hasCampaign: false,
      canCreate: true,
      problem:
        'No coordinates stored yet — they will be read from the linked Business Profile when the campaign is created.',
    }
  }
  return { hasCampaign: false, canCreate: true, problem: null }
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

/**
 * Create the campaign for ONE named client, now.
 *
 * The sweep is the only thing that has ever created a campaign, and it runs at
 * 04:00 UTC. So an operator who fixes whatever was blocking a client — links
 * the Business Profile, takes the client off PAUSED, flips the SEO plan — has
 * no way to see the result today, and no way to tell a fixed client from one
 * that is still blocked. This is the same code the sweep runs per client, so
 * there is one creation path and a press cannot behave differently from
 * tonight's run.
 *
 * Costs credits, so it is only ever a deliberate press or the sweep.
 */
export async function createRankCampaignFor(
  clientId: string,
  origin: string
): Promise<{ ok: boolean; message: string }> {
  const keyConfigured = !!(await localDominatorKey())
  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: {
        businessName: true,
        status: true,
        googlePlaceId: true,
        latitude: true,
        longitude: true,
        rankTrackingId: true,
        seoClient: true,
        rankKeywords: true,
        offersMobileService: true,
        offersSideWindowRepair: true,
      },
    })
    .catch(() => null)
  if (!client) return { ok: false, message: 'Client not found.' }

  const state = rankSetupState({ ...client, keyConfigured })
  if (state.hasCampaign) {
    return { ok: true, message: 'This client already has a campaign — nothing to create.' }
  }
  if (!state.canCreate) {
    return { ok: false, message: state.problem || 'Cannot create a campaign for this client.' }
  }

  let lat = client.latitude
  let lng = client.longitude
  if ((lat === null || lng === null) && client.googlePlaceId) {
    const coords = await backfillCoordinates(clientId, client.googlePlaceId)
    if (coords) {
      lat = coords.latitude
      lng = coords.longitude
    }
  }
  if (lat === null || lng === null) {
    return {
      ok: false,
      message:
        'Google returned no coordinates for the linked Business Profile, so there is no grid centre. Re-pick the business on the Business tab.',
    }
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
    webhookUrl: rankWebhookUrl(origin, clientId),
    alias: client.businessName,
  })
  if (!created.ok) return { ok: false, message: created.error }

  await prisma.client.update({
    where: { id: clientId },
    data: { rankTrackingId: created.id, rankKeywords: keywords },
  })
  console.log(`[RankCampaigns] ${client.businessName}: ${tier} campaign ${created.id} (on demand)`)

  return {
    ok: true,
    message: `Created — ${tier === 'seo' ? 'weekly' : 'monthly'} on ${keywords.join(', ')}. The first scan runs on its schedule; the map appears once a run completes.`,
  }
}

export async function ensureRankCampaigns(origin: string): Promise<EnsureResult> {
  const result: EnsureResult = {
    created: 0,
    mapped: 0,
    skipped: 0,
    backfilled: 0,
    skippedClients: [],
    errors: [],
  }

  if (!(await localDominatorKey())) {
    // Not configured is not an error: the whole feature is simply off until
    // a key exists, and a daily cron should not shout about that.
    return result
  }

  // NOT filtered on googlePlaceId. It used to be, which meant a client with
  // no linked Business Profile never appeared in this loop at all — not even
  // as a skip — so the one client who could never be tracked was the one
  // client this sweep never mentioned.
  const clients = await prisma.client.findMany({
    where: { status: { in: [...LIVE_STATUSES] }, rankTrackingId: null },
    select: {
      status: true,
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
    const state = rankSetupState({ ...client, rankTrackingId: null, keyConfigured: true })
    if (!state.canCreate) {
      result.skipped++
      result.skippedClients.push({
        client: client.businessName,
        reason: state.problem || 'not eligible',
      })
      continue
    }

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
      // A linked Business Profile that Google will not give coordinates for.
      // Named, not just counted: this is indistinguishable from "tracked" on
      // every screen in the admin, and it never resolves itself.
      result.skipped++
      result.skippedClients.push({
        client: client.businessName,
        reason: 'Google returned no coordinates for the linked Business Profile.',
      })
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
      where: { status: { in: [...LIVE_STATUSES] }, rankTrackingId: { not: null } },
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
