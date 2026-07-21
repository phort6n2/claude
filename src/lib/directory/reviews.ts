// ============================================
// DIRECTORY — GOOGLE REVIEWS (rating + count)
// ============================================
// A build-it-yourself alternative to paid widgets (Elfsight et al.): pull each
// shop's live Google star rating and review count from the official Places API
// and show them on cards and shop pages. Results are cached (unstable_cache)
// and refreshed every ~12h, so we display fresh numbers without hammering the
// API — and without permanently storing Google data, per their terms.
//
// Two lookup modes:
//   • shop.googlePlaceId set → Place Details (exact, preferred)
//   • otherwise             → Text Search by "name, address" (auto-match)
//
// Degrades to a no-op with no API key: shops simply show no rating, exactly as
// today. Set GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) to switch it on.

import { unstable_cache } from 'next/cache'
import type { Shop } from './types'

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const TIMEOUT = 8000

export interface ShopReview {
  rating: number
  count: number
  placeId: string
}

function apiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
}

export function reviewsEnabled(): boolean {
  return !!apiKey()
}

/** A stable link to the business's Google listing/reviews. */
export function googlePlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
}

function queryFor(shop: Shop): string {
  return [shop.name, shop.street, `${shop.city}, ${shop.state.toUpperCase()}`, shop.zip]
    .filter(Boolean)
    .join(', ')
}

async function fetchByPlaceId(id: string): Promise<ShopReview | null> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey(),
        'X-Goog-FieldMask': 'rating,userRatingCount,id',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return null
    const d = await res.json()
    if (typeof d.rating !== 'number') return null
    return { rating: d.rating, count: d.userRatingCount ?? 0, placeId: d.id ?? id }
  } catch {
    return null
  }
}

async function fetchByText(query: string): Promise<ShopReview | null> {
  try {
    const res = await fetch(TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey(),
        'X-Goog-FieldMask': 'places.id,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return null
    const d = await res.json()
    const p = d.places?.[0]
    if (!p || typeof p.rating !== 'number') return null
    return { rating: p.rating, count: p.userRatingCount ?? 0, placeId: p.id }
  } catch {
    return null
  }
}

async function fetchReview(shop: Shop): Promise<ShopReview | null> {
  if (!reviewsEnabled()) return null
  return shop.googlePlaceId
    ? fetchByPlaceId(shop.googlePlaceId)
    : fetchByText(queryFor(shop))
}

/** Cached Google rating + count for a single shop (refreshes ~every 12h). */
export function getReview(shop: Shop): Promise<ShopReview | null> {
  if (!reviewsEnabled()) return Promise.resolve(null)
  const key = shop.googlePlaceId || shop.slug
  return unstable_cache(() => fetchReview(shop), ['directory-review-v2', key], {
    revalidate: 43200,
  })()
}

/**
 * Attach live Google rating + review count to a list of shops. StarRating (on
 * cards and shop pages) renders automatically once `rating` is set. Returns the
 * shops untouched when reviews are disabled.
 */
export async function withReviews(shops: Shop[]): Promise<Shop[]> {
  if (!reviewsEnabled()) return shops
  const reviews = await Promise.all(shops.map((s) => getReview(s)))
  return shops.map((s, i) =>
    reviews[i] ? { ...s, rating: reviews[i]!.rating, reviewCount: reviews[i]!.count } : s
  )
}
