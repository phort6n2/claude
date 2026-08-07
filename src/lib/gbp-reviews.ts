import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { Prisma } from '@prisma/client'

/**
 * Google Business Profile reviews for hosted landing pages.
 *
 * Fetches rating / review count / top quotes from the Places Details API using
 * the client's googlePlaceId and caches them in ClientGbpReviews. Two rules
 * ported from the landing-template repo, where they were learned the hard way:
 *
 * 1. Never publish data the Place ID merely *returned* — verify it resolved to
 *    a business that looks like this client. A wrong Place ID (one typo, or a
 *    competitor two doors down) returns perfectly plausible numbers.
 * 2. No cache row → the landing page strips the rating band and never emits
 *    aggregateRating. Ratings are rendered from live data or not at all.
 */

async function getPlacesApiKey(): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'GOOGLE_PLACES_API_KEY' } })
    if (setting) {
      if (setting.encrypted) {
        try {
          return decrypt(setting.value)
        } catch {
          return null
        }
      }
      return setting.value
    }
  } catch {
    // fall through to env
  }
  return process.env.GOOGLE_PLACES_API_KEY || null
}

/**
 * Guard: does the name the Place ID resolved to plausibly belong to this
 * client? Requires more than half of the client's distinctive name tokens to
 * appear in the place name. Generic trade words don't count — otherwise any
 * "X Auto Glass" would match any other.
 */
const GENERIC_TOKENS = new Set([
  'auto', 'glass', 'windshield', 'repair', 'replacement', 'and', 'the', 'of',
  'llc', 'inc', 'co', 'company', 'shop', 'service', 'services', 'calibration',
  'mobile', '&',
])

export function placeNameMatchesClient(businessName: string, placeName: string): boolean {
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const clientTokens = tokenize(businessName).filter((t) => !GENERIC_TOKENS.has(t))
  if (clientTokens.length === 0) {
    // Name is all generic words; fall back to comparing the full token sets.
    const all = tokenize(businessName)
    const place = new Set(tokenize(placeName))
    return all.filter((t) => place.has(t)).length > all.length / 2
  }
  const placeTokens = new Set(tokenize(placeName))
  const matched = clientTokens.filter((t) => placeTokens.has(t)).length
  return matched > clientTokens.length / 2
}

export interface RefreshResult {
  ok: boolean
  message: string
  placeName?: string
  rating?: number
  reviewCount?: number
}

export async function refreshGbpReviews(clientId: string): Promise<RefreshResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, businessName: true, googlePlaceId: true },
  })
  if (!client) return { ok: false, message: 'Client not found' }
  if (!client.googlePlaceId) {
    return { ok: false, message: 'No Google Place ID set for this client' }
  }

  const apiKey = await getPlacesApiKey()
  if (!apiKey) return { ok: false, message: 'Google Places API key is not configured' }

  const recordError = async (message: string) => {
    await prisma.clientGbpReviews
      .update({ where: { clientId }, data: { lastError: message } })
      .catch(() => {})
  }

  let data: {
    status?: string
    error_message?: string
    result?: {
      name?: string
      rating?: number
      user_ratings_total?: number
      reviews?: Array<{
        author_name?: string
        rating?: number
        text?: string
        relative_time_description?: string
      }>
    }
  }
  try {
    const url =
      'https://maps.googleapis.com/maps/api/place/details/json' +
      `?place_id=${encodeURIComponent(client.googlePlaceId)}` +
      '&fields=name,rating,user_ratings_total,reviews' +
      `&key=${apiKey}`
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    data = await response.json()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Places request failed'
    await recordError(message)
    return { ok: false, message }
  }

  if (data.status !== 'OK' || !data.result) {
    const message = `Places API: ${data.status || 'no result'}${data.error_message ? ` — ${data.error_message}` : ''}`
    await recordError(message)
    return { ok: false, message }
  }

  const placeName = data.result.name || ''
  if (!placeNameMatchesClient(client.businessName, placeName)) {
    const message = `Place ID resolved to "${placeName}", which does not look like "${client.businessName}". Not caching — check the Place ID.`
    await recordError(message)
    return { ok: false, message, placeName }
  }

  const rating = data.result.rating
  const reviewCount = data.result.user_ratings_total
  if (typeof rating !== 'number' || typeof reviewCount !== 'number') {
    const message = 'Place has no rating data'
    await recordError(message)
    return { ok: false, message, placeName }
  }

  // Keep the best-rated quotes with real text, capped for page use.
  const quotes = (data.result.reviews || [])
    .filter((r) => typeof r.text === 'string' && r.text.trim().length > 20 && (r.rating ?? 0) >= 4)
    .slice(0, 5)
    .map((r) => ({
      author: r.author_name || 'Google user',
      rating: r.rating ?? 5,
      text: r.text!.trim().slice(0, 400),
      relativeTime: r.relative_time_description || '',
    }))

  await prisma.clientGbpReviews.upsert({
    where: { clientId },
    update: {
      placeName,
      rating,
      reviewCount,
      reviews: quotes as unknown as Prisma.InputJsonValue,
      fetchedAt: new Date(),
      lastError: null,
    },
    create: {
      clientId,
      placeName,
      rating,
      reviewCount,
      reviews: quotes as unknown as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    },
  })

  return { ok: true, message: `Cached ${rating}★ (${reviewCount} reviews) from "${placeName}"`, placeName, rating, reviewCount }
}
