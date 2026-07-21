// ============================================
// DIRECTORY — GOOGLE REVIEWS (rating + count)
// ============================================
// A build-it-yourself alternative to paid widgets (Elfsight et al.): show each
// shop's Google star rating + review count on cards and shop pages.
//
// COST CONTROL — the important part:
// Pages NEVER call Google. They read a cached snapshot that is refreshed on a
// fixed schedule (a monthly cron hitting /api/directory/reviews/refresh). So
// Google is billed at exactly `shops × refreshes` — e.g. 6 shops once a month ≈
// 6 calls/month — completely independent of site traffic. A viral spike costs
// the same as a quiet day. The snapshot lives in Vercel Blob; reading it is
// free and cached ~1h.
//
// Two lookup modes when refreshing:
//   • shop.googlePlaceId set → Place Details (exact, preferred)
//   • otherwise             → Text Search by "name, address" (auto-match)
//
// No API key → refresh is a no-op. No snapshot yet → shops just show no rating,
// exactly as before.

import { unstable_cache } from 'next/cache'
import { list, put } from '@vercel/blob'
import type { Shop, BusinessHours } from './types'
import { getAllShops } from './data'

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const SNAPSHOT_PATH = 'directory/reviews-snapshot.json'
const TIMEOUT = 8000

export interface ShopReview {
  rating: number
  count: number
  placeId: string
  /** Weekly hours pulled from the shop's Google Business Profile, if available. */
  hours?: BusinessHours[]
  /** Google Business Profile primary category, e.g. "Auto glass shop". */
  category?: string
  /** Places API type tags, e.g. ["car_repair"]. */
  types?: string[]
}

interface GooglePeriodPoint {
  day: number
  hour: number
  minute: number
}
interface GooglePeriod {
  open?: GooglePeriodPoint
  close?: GooglePeriodPoint
}

const hhmm = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

/** Convert Google `regularOpeningHours.periods` (day 0=Sun) to our schema. */
function parseHours(regular: { periods?: GooglePeriod[] } | undefined): BusinessHours[] | undefined {
  const periods = regular?.periods
  if (!periods || !periods.length) return undefined
  const byDay = new Map<number, { open: string; close: string }>()
  for (const p of periods) {
    if (!p.open) continue
    const day = p.open.day
    // No close point → open 24 hours that day.
    const open = hhmm(p.open.hour, p.open.minute)
    const close = p.close ? hhmm(p.close.hour, p.close.minute) : '23:59'
    const existing = byDay.get(day)
    if (!existing) {
      byDay.set(day, { open, close })
    } else {
      // Merge split shifts into earliest open / latest close.
      if (open < existing.open) existing.open = open
      if (close > existing.close) existing.close = close
    }
  }
  if (!byDay.size) return undefined
  return Array.from({ length: 7 }, (_, day) => {
    const h = byDay.get(day)
    return { day, open: h?.open ?? null, close: h?.close ?? null }
  })
}

type Snapshot = Record<string, ShopReview & { updatedAt: string }>

function apiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
}

/** Whether the scheduled refresh can call Google (needs an API key). */
export function reviewsEnabled(): boolean {
  return !!apiKey()
}

/** A stable link to the business's Google listing/reviews. */
export function googlePlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
}

// ----------------------------------------------------------------------------
// Read path (pages) — snapshot only, no Google calls, no per-view cost.
// ----------------------------------------------------------------------------

async function readSnapshot(): Promise<Snapshot> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return {}
  try {
    const { blobs } = await list({ prefix: SNAPSHOT_PATH })
    const blob = blobs.find((b) => b.pathname === SNAPSHOT_PATH)
    if (!blob) return {}
    const res = await fetch(blob.url, { cache: 'no-store' })
    if (!res.ok) return {}
    return (await res.json()) as Snapshot
  } catch {
    return {}
  }
}

// Blob reads are free; cache for an hour so busy pages hit Blob at most ~once/hr.
const cachedSnapshot = unstable_cache(readSnapshot, ['directory-reviews-snapshot-v1'], {
  revalidate: 3600,
})

/** Cached Google rating + count for a single shop (from the snapshot). */
export async function getReview(shop: Shop): Promise<ShopReview | null> {
  const snap = await cachedSnapshot()
  const r = snap[shop.slug]
  return r
    ? {
        rating: r.rating,
        count: r.count,
        placeId: r.placeId,
        hours: r.hours,
        category: r.category,
        types: r.types,
      }
    : null
}

/**
 * Attach Google rating + review count to a list of shops from the snapshot.
 * StarRating (cards + shop pages) renders automatically once `rating` is set.
 * Reads the snapshot once regardless of list length — no per-shop cost.
 */
export async function withReviews(shops: Shop[]): Promise<Shop[]> {
  const snap = await cachedSnapshot()
  if (!Object.keys(snap).length) return shops
  return shops.map((s) => {
    const r = snap[s.slug]
    if (!r) return s
    // Fill hours from Google only when we don't already have curated hours.
    const useHours = (!s.hours || s.hours.length === 0) && r.hours ? r.hours : s.hours
    return { ...s, rating: r.rating, reviewCount: r.count, hours: useHours }
  })
}

// ----------------------------------------------------------------------------
// Write path (cron only) — the sole place that calls Google.
// ----------------------------------------------------------------------------

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
        'X-Goog-FieldMask':
          'rating,userRatingCount,id,regularOpeningHours,primaryType,primaryTypeDisplayName,types',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return null
    const d = await res.json()
    if (typeof d.rating !== 'number') return null
    return {
      rating: d.rating,
      count: d.userRatingCount ?? 0,
      placeId: d.id ?? id,
      hours: parseHours(d.regularOpeningHours),
      category: d.primaryTypeDisplayName?.text ?? d.primaryType,
      types: d.types,
    }
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
        'X-Goog-FieldMask':
          'places.id,places.rating,places.userRatingCount,places.regularOpeningHours,places.primaryType,places.primaryTypeDisplayName,places.types',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return null
    const d = await res.json()
    const p = d.places?.[0]
    if (!p || typeof p.rating !== 'number') return null
    return {
      rating: p.rating,
      count: p.userRatingCount ?? 0,
      placeId: p.id,
      hours: parseHours(p.regularOpeningHours),
      category: p.primaryTypeDisplayName?.text ?? p.primaryType,
      types: p.types,
    }
  } catch {
    return null
  }
}

async function fetchReview(shop: Shop): Promise<ShopReview | null> {
  return shop.googlePlaceId ? fetchByPlaceId(shop.googlePlaceId) : fetchByText(queryFor(shop))
}

/**
 * Refresh every shop's rating from Google and write the snapshot. This is the
 * ONLY function that calls the paid API. Called by the scheduled cron (and can
 * be triggered manually). Returns how many shops were updated. Keeps prior
 * values for any shop Google doesn't return, so a blip never wipes ratings.
 */
export async function refreshReviews(): Promise<{
  updated: number
  total: number
  skipped: number
}> {
  const shops = getAllShops()
  if (!reviewsEnabled() || !process.env.BLOB_READ_WRITE_TOKEN) {
    return { updated: 0, total: shops.length, skipped: shops.length }
  }

  const previous = await readSnapshot()
  const snapshot: Snapshot = { ...previous }
  const now = new Date().toISOString()
  let updated = 0

  // Sequential + gentle: small directories, and we never want a burst.
  for (const shop of shops) {
    const review = await fetchReview(shop)
    if (review) {
      snapshot[shop.slug] = { ...review, updatedAt: now }
      updated++
    }
  }

  await put(SNAPSHOT_PATH, JSON.stringify(snapshot), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })

  return { updated, total: shops.length, skipped: shops.length - updated }
}
