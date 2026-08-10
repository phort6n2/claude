import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { formatWeekdayDescriptions } from '@/lib/google-hours'
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
  /** True when the call was skipped by the 168-hour floor, not by an error. */
  rateLimited?: boolean
}

/**
 * Hard floor between Places API calls for one client — 168 hours.
 * Applies to the manual Refresh button too, not just the weekly cron: every
 * call costs money, and review counts don't move fast enough to justify more.
 */
export const REVIEW_REFRESH_MIN_HOURS = 168

export async function refreshGbpReviews(clientId: string): Promise<RefreshResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, businessName: true, googlePlaceId: true },
  })
  if (!client) return { ok: false, message: 'Client not found' }
  if (!client.googlePlaceId) {
    return { ok: false, message: 'No Google Place ID set for this client' }
  }

  // Rate limit before any network call.
  const existing = await prisma.clientGbpReviews
    .findUnique({ where: { clientId }, select: { fetchedAt: true, rating: true, reviewCount: true } })
    .catch(() => null)
  if (existing?.fetchedAt) {
    const hoursSince = (Date.now() - new Date(existing.fetchedAt).getTime()) / 3_600_000
    if (hoursSince < REVIEW_REFRESH_MIN_HOURS) {
      const hoursLeft = Math.ceil(REVIEW_REFRESH_MIN_HOURS - hoursSince)
      const daysLeft = Math.floor(hoursLeft / 24)
      const wait = daysLeft >= 1 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}` : `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
      return {
        ok: false,
        rateLimited: true,
        message: `Reviews were refreshed ${Math.floor(hoursSince)}h ago. Google reviews update at most once a week — next refresh available in about ${wait}.`,
        rating: existing.rating,
        reviewCount: existing.reviewCount,
      }
    }
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

/**
 * Same refresh, for one shop of a multi-location client.
 *
 * Each shop has its own Business Profile and therefore its own rating, and
 * the site shows them side by side rather than averaging — an average is a
 * number no profile actually displays. The 168-hour floor, the name-match
 * guard, and "no data means show nothing" all carry over unchanged; only the
 * row being written differs.
 */
export async function refreshLocationGbpReviews(locationId: string): Promise<RefreshResult> {
  const location = await prisma.clientLocation
    .findUnique({
      where: { id: locationId },
      select: {
        id: true,
        label: true,
        googlePlaceId: true,
        gbpFetchedAt: true,
        gbpRating: true,
        gbpReviewCount: true,
        client: { select: { businessName: true } },
      },
    })
    .catch(() => null)
  if (!location) return { ok: false, message: 'Location not found' }
  if (!location.googlePlaceId) {
    return { ok: false, message: `No Google Place ID set for the ${location.label} shop` }
  }

  if (location.gbpFetchedAt) {
    const hoursSince = (Date.now() - new Date(location.gbpFetchedAt).getTime()) / 3_600_000
    if (hoursSince < REVIEW_REFRESH_MIN_HOURS) {
      const hoursLeft = Math.ceil(REVIEW_REFRESH_MIN_HOURS - hoursSince)
      const daysLeft = Math.floor(hoursLeft / 24)
      const wait =
        daysLeft >= 1
          ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}`
          : `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
      return {
        ok: false,
        rateLimited: true,
        message: `The ${location.label} shop was refreshed ${Math.floor(hoursSince)}h ago. Google reviews update at most once a week — next refresh available in about ${wait}.`,
        rating: location.gbpRating ?? undefined,
        reviewCount: location.gbpReviewCount ?? undefined,
      }
    }
  }

  const apiKey = await getPlacesApiKey()
  if (!apiKey) return { ok: false, message: 'Google Places API key is not configured' }

  const recordError = async (message: string) => {
    await prisma.clientLocation
      .update({ where: { id: locationId }, data: { gbpLastError: message } })
      .catch(() => {})
  }

  let data: {
    error?: { status?: string; message?: string }
    displayName?: { text?: string }
    rating?: number
    userRatingCount?: number
  }
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(location.googlePlaceId)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'displayName,rating,userRatingCount',
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
  if (!placeNameMatchesClient(location.client.businessName, placeName)) {
    const message = `Place ID resolved to "${placeName}", which does not look like "${location.client.businessName}". Not caching — check the Place ID.`
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

  await prisma.clientLocation.update({
    where: { id: locationId },
    data: {
      gbpPlaceName: placeName,
      gbpRating: rating,
      gbpReviewCount: reviewCount,
      gbpFetchedAt: new Date(),
      gbpLastError: null,
    },
  })

  return {
    ok: true,
    message: `Cached ${rating}★ (${reviewCount} reviews) for the ${location.label} shop`,
    placeName,
    rating,
    reviewCount,
  }
}

/**
 * Pull EVERYTHING Google knows about one shop, in one call.
 *
 * The refresh button that exists today only updates the rating. But the
 * fields that go stale and hurt are the boring ones — hours change for the
 * season, a shop moves suite numbers, the number on the profile is a cell
 * now. Nobody re-types those, so they rot, and a customer who drives to a
 * closed shop does not call back.
 *
 * Same 168-hour floor as the reviews refresh, and for the same reason: every
 * Places call costs money and none of this moves faster than weekly.
 *
 * ---------------------------------------------------------------------------
 * What it will and will not overwrite
 * ---------------------------------------------------------------------------
 * Google is authoritative for hours, the maps link, the rating and the review
 * count, so those are written unconditionally.
 *
 * Address and phone are written only when Google actually returned them.
 * A field mask that comes back empty must never blank out a good address that
 * somebody typed by hand — losing data on a refresh is far worse than showing
 * a slightly stale suite number, and it is the kind of loss nobody notices
 * until a customer can't find the shop.
 */
export interface ShopRefreshResult extends RefreshResult {
  /** Human-readable list of what actually changed. */
  updated?: string[]
}

/**
 * Floor when the shop is missing data Google could supply — an hour, not a
 * week. See the comment at the check for why it isn't simply unlimited.
 */
export const MISSING_DATA_MIN_HOURS = 1

export async function refreshLocationFromGoogle(locationId: string): Promise<ShopRefreshResult> {
  const location = await prisma.clientLocation
    .findUnique({
      where: { id: locationId },
      select: {
        id: true,
        label: true,
        streetAddress: true,
        city: true,
        state: true,
        postalCode: true,
        phone: true,
        hours: true,
        googleMapsUrl: true,
        googlePlaceId: true,
        gbpFetchedAt: true,
        gbpRating: true,
        gbpReviewCount: true,
        client: { select: { businessName: true } },
      },
    })
    .catch(() => null)
  if (!location) return { ok: false, message: 'Shop not found' }
  if (!location.googlePlaceId) {
    return {
      ok: false,
      message: `No Google Place ID on the ${location.label} shop — set one and the rest fills itself in.`,
    }
  }

  // A shop with no hours at all is a different situation from a shop whose
  // hours might have changed. The weekly floor exists to stop us re-asking
  // Google for data we already have; it should not stand between a shop and
  // data it has never had. Every existing shop is in exactly this state — the
  // old button only ever pulled the rating — so a week's wait to fill in a
  // blank field is the floor working against its own purpose.
  //
  // The short floor still applies, because Google can legitimately return no
  // hours at all. Without it, a profile with no hours published would leave
  // the field empty, keep qualifying for the bypass, and let the button be
  // pressed at Places prices indefinitely.
  const missingHours = !location.hours?.trim()
  const floor = missingHours ? MISSING_DATA_MIN_HOURS : REVIEW_REFRESH_MIN_HOURS

  if (location.gbpFetchedAt) {
    const hoursSince = (Date.now() - new Date(location.gbpFetchedAt).getTime()) / 3_600_000
    if (hoursSince < floor) {
      const hoursLeft = Math.ceil(floor - hoursSince)
      const daysLeft = Math.floor(hoursLeft / 24)
      const wait =
        daysLeft >= 1
          ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}`
          : `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`
      return {
        ok: false,
        rateLimited: true,
        message: missingHours
          ? `Just asked Google and it returned no opening hours for this shop. Try again in about ${wait}, or type the hours in by hand — if the Business Profile has none published, there is nothing to pull.`
          : `Already refreshed ${Math.floor(hoursSince)}h ago. Google data doesn't move faster than weekly — next refresh in about ${wait}.`,
        rating: location.gbpRating ?? undefined,
        reviewCount: location.gbpReviewCount ?? undefined,
      }
    }
  }

  const apiKey = await getPlacesApiKey()
  if (!apiKey) return { ok: false, message: 'Google Places API key is not configured' }

  const recordError = async (message: string) => {
    await prisma.clientLocation
      .update({ where: { id: locationId }, data: { gbpLastError: message } })
      .catch(() => {})
  }

  interface AddressComponent {
    longText?: string
    shortText?: string
    types?: string[]
  }
  let data: {
    error?: { status?: string; message?: string }
    displayName?: { text?: string }
    formattedAddress?: string
    addressComponents?: AddressComponent[]
    nationalPhoneNumber?: string
    regularOpeningHours?: { weekdayDescriptions?: string[] }
    rating?: number
    userRatingCount?: number
    googleMapsUri?: string
  }
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(location.googlePlaceId)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'displayName,formattedAddress,addressComponents,nationalPhoneNumber,regularOpeningHours,rating,userRatingCount,googleMapsUri',
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

  // Same guard as everywhere else: a Place ID that resolves to the wrong
  // business returns entirely plausible data. Overwriting a shop's address
  // with a competitor's is the worst outcome this file can produce.
  const placeName = data.displayName?.text || ''
  if (!placeNameMatchesClient(location.client.businessName, placeName)) {
    const message = `Place ID resolved to "${placeName}", which does not look like "${location.client.businessName}". Nothing was changed — check the Place ID.`
    await recordError(message)
    return { ok: false, message, placeName }
  }

  const component = (type: string, short = false) => {
    const found = (data.addressComponents || []).find((c) => (c.types || []).includes(type))
    return ((short ? found?.shortText : found?.longText) || '').trim()
  }
  const streetNumber = component('street_number')
  const route = component('route')
  const street = [streetNumber, route].filter(Boolean).join(' ')
  const city = component('locality') || component('postal_town')
  const state = component('administrative_area_level_1', true)
  const postalCode = component('postal_code')
  const phone = (data.nationalPhoneNumber || '').trim()
  const hours = formatWeekdayDescriptions(data.regularOpeningHours?.weekdayDescriptions)

  const updated: string[] = []
  const changes: Record<string, string | number | Date | null> = {}
  const setIf = (field: string, value: string, current: string | null, label: string) => {
    if (!value || value === (current || '')) return
    changes[field] = value
    updated.push(label)
  }

  setIf('streetAddress', street, location.streetAddress, 'street address')
  setIf('city', city, location.city, 'city')
  setIf('state', state, location.state, 'state')
  setIf('postalCode', postalCode, location.postalCode, 'ZIP')
  setIf('phone', phone, location.phone, 'phone')
  setIf('hours', hours || '', location.hours, 'hours')
  setIf('googleMapsUrl', data.googleMapsUri || '', location.googleMapsUrl, 'maps link')

  if (typeof data.rating === 'number' && typeof data.userRatingCount === 'number') {
    if (data.rating !== location.gbpRating || data.userRatingCount !== location.gbpReviewCount) {
      updated.push('rating')
    }
    changes.gbpRating = data.rating
    changes.gbpReviewCount = data.userRatingCount
  }
  changes.gbpPlaceName = placeName
  changes.gbpLastError = null
  // Stamped even when nothing changed — the point of the floor is to rate
  // limit the CALL, and a call that found no changes still cost the same.
  changes.gbpFetchedAt = new Date()

  await prisma.clientLocation.update({ where: { id: locationId }, data: changes })

  // Asked for hours, Google had none. Say that plainly rather than "nothing
  // to change" — the operator pressed this button specifically to fill a
  // blank field, and needs to know the blank is Google's, not ours.
  const stillNoHours = missingHours && !hours
  const summary = updated.length
    ? `Updated ${updated.join(', ')} from Google.`
    : 'Everything already matched Google — nothing to change.'

  return {
    ok: true,
    placeName,
    rating: data.rating,
    reviewCount: data.userRatingCount,
    updated,
    message: stillNoHours
      ? `${summary} No opening hours are published on this shop's Business Profile, so there were none to pull — add them there, or type them in below.`
      : summary,
  }
}
