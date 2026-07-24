// ============================================
// AUTO GLASS DIRECTORY — DATA ACCESS LAYER
// ============================================
// Single source of truth for reading directory listings. Everything the public
// pages need goes through these helpers, so when you later move listings into a
// database you only reimplement this file.

import rawShops from '@/data/directory-shops.json'
import type {
  Shop,
  ServiceKey,
  ServiceMeta,
  CitySummary,
  StateSummary,
} from './types'

// Operator overrides: designate paying clients (top "Partner" tier) and
// founding-member featured shops without editing the seed file — set
// DIRECTORY_CLIENT_SLUGS / DIRECTORY_FEATURED_SLUGS (comma-separated slugs) in
// the environment. Clients always imply featured.
function slugSet(envVar: string | undefined): Set<string> {
  return new Set((envVar || '').split(',').map((s) => s.trim()).filter(Boolean))
}
const CLIENT_SLUGS = slugSet(process.env.DIRECTORY_CLIENT_SLUGS)
const FEATURED_SLUGS = slugSet(process.env.DIRECTORY_FEATURED_SLUGS)

const shops = (rawShops as Shop[]).map((s) => {
  const client = s.client || CLIENT_SLUGS.has(s.slug)
  const featured = s.featured || client || FEATURED_SLUGS.has(s.slug)
  return client === !!s.client && featured === !!s.featured ? s : { ...s, client, featured }
})

// Self-serve paid "Featured" ($7/mo) slugs, stored in Vercel Blob and hydrated
// per request from featured.ts. Kept separate from the static/env featured set
// so a shop that buys Featured goes live without a redeploy (ISR revalidates,
// and the Stripe webhook triggers on-demand revalidation).
let PAID_FEATURED = new Set<string>()
export function setPaidFeatured(slugs: Iterable<string>): void {
  PAID_FEATURED = new Set(slugs)
}
/** Overlay the dynamic paid-Featured flag onto a shop before ranking/display. */
function withPaid(s: Shop): Shop {
  return s.featured || !PAID_FEATURED.has(s.slug) ? s : { ...s, featured: true }
}

/** Ranking tier: paying client (2) > founding-member featured (1) > standard. */
function tier(s: Shop): number {
  return s.client ? 2 : s.featured ? 1 : 0
}

// ---- Service catalog -----------------------------------------------------

export const SERVICES: ServiceMeta[] = [
  {
    key: 'windshield-replacement',
    label: 'Windshield Replacement',
    blurb: 'Full windshield removal and installation with OEM or OEE glass.',
  },
  {
    key: 'windshield-repair',
    label: 'Windshield Repair',
    blurb: 'Resin repair for cracks before they spread across the glass.',
  },
  {
    key: 'chip-repair',
    label: 'Rock Chip Repair',
    blurb: 'Fast fixes for stone chips, usually covered with no deductible.',
  },
  {
    key: 'adas-calibration',
    label: 'ADAS Calibration',
    blurb: 'Recalibration of lane-assist and collision cameras after glass work.',
  },
  {
    key: 'mobile-service',
    label: 'Mobile Service',
    blurb: 'Technicians come to your home or workplace to do the job on-site.',
  },
  {
    key: 'side-window',
    label: 'Side Window Replacement',
    blurb: 'Door and quarter glass replacement after break-ins or damage.',
  },
  {
    key: 'rear-window',
    label: 'Rear Window Replacement',
    blurb: 'Back glass replacement including defroster grid reconnection.',
  },
  {
    key: 'power-window-repair',
    label: 'Power Window Repair',
    blurb: 'Regulator and motor repair for windows that won’t roll up or down.',
  },
  {
    key: 'sunroof-repair',
    label: 'Sunroof Repair',
    blurb: 'Repair and replacement of sunroof and moonroof glass and seals.',
  },
  {
    key: 'window-tint',
    label: 'Window Tinting',
    blurb: 'Film installation for heat, glare, and UV protection.',
  },
  {
    key: 'commercial-fleet',
    label: 'Commercial & Fleet',
    blurb: 'Volume glass programs for delivery, rideshare, and company fleets.',
  },
  {
    key: 'rv-heavy-equipment',
    label: 'RV & Heavy Equipment',
    blurb: 'Oversized glass for RVs, semis, tractors, and construction equipment.',
  },
]

const SERVICE_LOOKUP: Record<ServiceKey, ServiceMeta> = Object.fromEntries(
  SERVICES.map((s) => [s.key, s])
) as Record<ServiceKey, ServiceMeta>

export function serviceMeta(key: ServiceKey): ServiceMeta {
  return SERVICE_LOOKUP[key]
}

export function serviceLabel(key: ServiceKey): string {
  return SERVICE_LOOKUP[key]?.label ?? key
}

// ---- URL helpers ---------------------------------------------------------

export function citySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function cityHref(shopOrCity: Pick<Shop, 'state' | 'city'>): string {
  return `/directory/${shopOrCity.state}/${citySlug(shopOrCity.city)}`
}

export function shopHref(shop: Pick<Shop, 'slug'>): string {
  return `/directory/shop/${shop.slug}`
}

// ---- Listing queries -----------------------------------------------------

/** Clients first, then founding-member featured, then by rating/review volume. */
function rankShops(list: Shop[]): Shop[] {
  return list.map(withPaid).sort((a, b) => {
    const tierA = tier(a)
    const tierB = tier(b)
    if (tierA !== tierB) return tierB - tierA
    const ratA = a.rating ?? 0
    const ratB = b.rating ?? 0
    if (ratB !== ratA) return ratB - ratA
    return (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
  })
}

/**
 * Whether a city's founding-member spot is already taken by a DIFFERENT shop —
 * i.e. another shop in the same city that has claimed a featured slot (a real
 * founding member; paying-client Partners are a separate paid tier and don't
 * consume the free founding spot). Used to stop over-promising the founding
 * offer once it's gone.
 */
export function cityHasFoundingMember(shop: Shop): boolean {
  const slug = citySlug(shop.city)
  return shops.some(
    (s) =>
      s.slug !== shop.slug &&
      s.state === shop.state &&
      citySlug(s.city) === slug &&
      s.featured &&
      s.claimed &&
      !s.client
  )
}

export function getAllShops(): Shop[] {
  return rankShops(shops)
}

export function getShopCount(): number {
  return shops.length
}

export function getShopBySlug(slug: string): Shop | undefined {
  return shops.find((s) => s.slug === slug)
}

/**
 * Featured shops for the homepage. Rotates WITHIN each tier by `rotate` (pass a
 * changing bucket like the current hour) so that, when there are more featured
 * shops than slots, every client and founding-member cycles through the
 * homepage over time instead of only the top few ever showing. Clients still
 * always rank above founding-member featured shops.
 */
export function getFeaturedShops(limit = 9, rotate = 0): Shop[] {
  const featured = shops.map(withPaid).filter((s) => s.featured)
  const clients = rankShops(featured.filter((s) => s.client))
  const founders = rankShops(featured.filter((s) => !s.client))
  const spin = (arr: Shop[]) =>
    arr.length ? arr.map((_, i) => arr[(i + rotate) % arr.length]) : arr
  return [...spin(clients), ...spin(founders)].slice(0, limit)
}

export function getShopsByCity(state: string, city: string): Shop[] {
  const slug = citySlug(city)
  return rankShops(
    shops.filter((s) => s.state === state.toLowerCase() && citySlug(s.city) === slug)
  )
}

export function getShopsByState(state: string): Shop[] {
  return rankShops(shops.filter((s) => s.state === state.toLowerCase()))
}

/**
 * A shop's live rank within its own city (1-based) and the number of shops in
 * that city. Uses the same ranking the public city page shows, so the number a
 * shop is told ("you're #X of Y") is exactly what a driver sees. Reflects paid
 * Featured status when PAID_FEATURED has been hydrated (call setPaidFeatured
 * first in async contexts).
 */
export function getCityRank(shop: Shop): { rank: number; total: number } {
  const list = getShopsByCity(shop.state, shop.city)
  const idx = list.findIndex((s) => s.slug === shop.slug)
  return { rank: idx < 0 ? list.length : idx + 1, total: list.length }
}

/** Other shops in the same city, excluding the given one. */
export function getRelatedShops(shop: Shop, limit = 3): Shop[] {
  return getShopsByCity(shop.state, shop.city)
    .filter((s) => s.slug !== shop.slug)
    .slice(0, limit)
}

// ---- Geography rollups (for browse pages, sitemaps, footers) -------------

export function getCitySummaries(): CitySummary[] {
  const map = new Map<string, CitySummary>()
  for (const s of shops) {
    const key = `${s.state}/${citySlug(s.city)}`
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
    } else {
      map.set(key, {
        city: s.city,
        state: s.state,
        stateFull: s.stateFull,
        citySlug: citySlug(s.city),
        count: 1,
      })
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.city.localeCompare(b.city)
  )
}

export function getStateSummaries(): StateSummary[] {
  const cities = getCitySummaries()
  const map = new Map<string, StateSummary>()
  for (const c of cities) {
    const existing = map.get(c.state)
    if (existing) {
      existing.count += c.count
      existing.cities.push(c)
    } else {
      map.set(c.state, {
        state: c.state,
        stateFull: c.stateFull,
        count: c.count,
        cities: [c],
      })
    }
  }
  return [...map.values()].sort((a, b) => a.stateFull.localeCompare(b.stateFull))
}

export function getCitySummary(state: string, city: string): CitySummary | undefined {
  const slug = citySlug(city)
  return getCitySummaries().find(
    (c) => c.state === state.toLowerCase() && c.citySlug === slug
  )
}

// ---- Search --------------------------------------------------------------

export interface SearchParams {
  q?: string
  state?: string
  city?: string
  service?: ServiceKey
  mobileOnly?: boolean
}

export function searchShops(params: SearchParams): Shop[] {
  const q = params.q?.trim().toLowerCase()
  const result = shops.filter((s) => {
    if (params.state && s.state !== params.state.toLowerCase()) return false
    if (params.city && citySlug(s.city) !== citySlug(params.city)) return false
    if (params.service && !s.services.includes(params.service)) return false
    if (params.mobileOnly && !s.mobileService) return false
    if (q) {
      const haystack = [
        s.name,
        s.city,
        s.stateFull,
        s.zip,
        s.description,
        ...s.services.map(serviceLabel),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  return rankShops(result)
}
