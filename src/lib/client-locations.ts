import { formatPhoneDisplay } from '@/lib/lead-display'
import { prisma } from '@/lib/db'

/**
 * Shop locations for a client, for both the admin and the hosted site.
 *
 * Most clients have one shop, and it lives in the Client scalar address
 * fields. Some run several, each with its own Google Business Profile. Rather
 * than fork the site into single-shop and multi-shop code paths, everything
 * downstream consumes a list: a single-shop client simply gets a list of one,
 * synthesized from their Client record.
 *
 * The moment a client has ClientLocation rows, those rows are the truth and
 * the scalar address stops being read for display. That matters — a Tualatin
 * page that says "visit the shop in Portland" because Portland is the only
 * address we stored sends a customer to the wrong door.
 */

export interface SiteLocation {
  id: string
  label: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country: string
  /** Falls back to the client's main number when the shop has none of its own. */
  phone: string
  hours: string | null
  googleMapsUrl: string | null
  /** Live cached GBP rating for this shop, or null. Never averaged across shops. */
  rating: number | null
  reviewCount: number | null
  isPrimary: boolean
  /** True when this was derived from the Client record, not a stored row. */
  isSynthetic: boolean
}

/** The Client fields needed to synthesize a location when no rows exist. */
export interface LocationFallbackClient {
  phone: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country?: string | null
  googleMapsUrl: string | null
  hasShopLocation: boolean
}

/**
 * Every shop the client has, ordered: primary first, then by sortOrder.
 *
 * Returns an empty list for a mobile-only client with no stored shops — the
 * caller renders no address at all rather than an invented one.
 */
export async function getClientLocations(
  clientId: string,
  fallback: LocationFallbackClient
): Promise<SiteLocation[]> {
  // Defensive: the table may not exist yet on an environment that hasn't run
  // the SQL. A missing table costs the extra shops, not the whole page.
  const rows = await prisma.clientLocation
    .findMany({
      where: { clientId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    .catch(() => [])

  if (rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      streetAddress: row.streetAddress,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country || 'US',
      phone: formatPhoneDisplay(row.phone || fallback.phone) || row.phone || fallback.phone,
      hours: row.hours,
      googleMapsUrl: row.googleMapsUrl,
      rating: row.gbpRating,
      reviewCount: row.gbpReviewCount,
      isPrimary: row.isPrimary,
      isSynthetic: false,
    }))
  }

  if (!fallback.hasShopLocation) return []

  return [
    {
      id: 'primary',
      label: fallback.city,
      streetAddress: fallback.streetAddress,
      city: fallback.city,
      state: fallback.state,
      postalCode: fallback.postalCode,
      country: fallback.country || 'US',
      phone: formatPhoneDisplay(fallback.phone) || fallback.phone,
      hours: null,
      googleMapsUrl: fallback.googleMapsUrl,
      // The client-level rating is rendered by the page itself from
      // ClientGbpReviews; a synthetic row doesn't duplicate it.
      rating: null,
      reviewCount: null,
      isPrimary: true,
      isSynthetic: true,
    },
  ]
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * The shop to lead with on a page about `city`.
 *
 * We hold no coordinates, so "nearest" here means "the one actually in that
 * city" — and when none is, the primary shop. Guessing a nearest shop from
 * names would be a fabricated claim about distance, which is exactly what we
 * refuse to publish elsewhere.
 */
export function locationForCity(
  locations: SiteLocation[],
  city: string | null | undefined
): SiteLocation | null {
  if (locations.length === 0) return null
  if (city) {
    const match = locations.find((l) => norm(l.city) === norm(city))
    if (match) return match
  }
  return locations.find((l) => l.isPrimary) || locations[0]
}

/** Locations ordered so the one serving `city` (if any) comes first. */
export function orderLocationsForCity(
  locations: SiteLocation[],
  city: string | null | undefined
): SiteLocation[] {
  const lead = locationForCity(locations, city)
  if (!lead) return locations
  return [lead, ...locations.filter((l) => l.id !== lead.id)]
}

/** "123 Main St, Beaverton, OR 97005" — one line, for links and titles. */
export function formatAddress(location: SiteLocation): string {
  return `${location.streetAddress}, ${location.city}, ${location.state} ${location.postalCode}`
}

/** Google Maps embed query for a shop, named so the pin lands on the business. */
export function mapQuery(businessName: string, location: SiteLocation): string {
  return encodeURIComponent(`${businessName}, ${formatAddress(location)}`)
}
