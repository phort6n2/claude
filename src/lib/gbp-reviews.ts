import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { Prisma } from '@prisma/client'

/**
 * Google Business Profile reviews for hosted landing pages.
 *
 * Fetches rating / review count / top quotes from the Places API (New) using
 * the client's googlePlaceId and caches them in ClientGbpReviews — the same
 * weekly workflow as the landing-template's fetch-reviews.cjs. Two rules
 * ported from that repo, where they were learned the hard way:
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

  // Places API (New) — places.googleapis.com, per the landing-template's
  // fetch-reviews.cjs. NOT the legacy maps.googleapis.com details endpoint,
  // which newer API projects are not authorized for (REQUEST_DENIED).
  let data: {
    error?: { status?: string; message?: string }
    displayName?: { text?: string }
    formattedAddress?: string
    rating?: number
    userRatingCount?: number
    googleMapsUri?: string
    reviews?: Array<{
      rating?: number
      text?: { text?: string }
      originalText?: { text?: string }
      authorAttribution?: { displayName?: string }
      relativePublishTimeDescription?: string
    }>
  }
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(client.googlePlaceId)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      }
    )
    data = await response.json()
    if (!response.ok) {
      const message = `Places API (New): ${data.error?.status || response.status}${data.error?.message ? ` — ${data.error.message}` : ''}`
      await recordError(message)
      return { ok: false, message }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Places request failed'
    await recordError(message)
    return { ok: false, message }
  }

  const placeName = data.displayName?.text || ''
  if (!placeNameMatchesClient(client.businessName, placeName)) {
    const message = `Place ID resolved to "${placeName}", which does not look like "${client.businessName}". Not caching — check the Place ID.`
    await recordError(message)
    return { ok: false, message, placeName }
  }

  const rating = data.rating
  const reviewCount = data.userRatingCount
  if (typeof rating !== 'number' || typeof reviewCount !== 'number') {
    const message = 'Place has no rating data'
    await recordError(message)
    return { ok: false, message, placeName }
  }

  // Quote selection per the template's fetch-reviews.cjs: 5-star only (no
  // padding the wall with 4-star reviews), readable length, longest first —
  // a substantial review is more persuasive than a two-line one.
  const quotes = (data.reviews || [])
    .map((r) => ({
      author: r.authorAttribution?.displayName || 'Google reviewer',
      rating: r.rating ?? 0,
      text: (r.originalText?.text || r.text?.text || '').trim(),
      relativeTime: r.relativePublishTimeDescription || '',
    }))
    .filter((r) => r.rating === 5 && r.text.length >= 40 && r.text.length <= 650)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 3)

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
