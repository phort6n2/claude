/**
 * Location pages: one per service-area city, capped so a long city list
 * doesn't mint a page farm. Every page renders the full site shell with real
 * business data (reviews, photos, warranty, services) — city-specific copy
 * stays factual and flag-derived, never invented.
 */

export const LOCATION_PAGE_LIMIT = 5

export function citySlug(area: string): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** The areas that get pages (first N), with their slugs. */
export function locationPages(areas: string[]): Array<{ area: string; slug: string }> {
  const seen = new Set<string>()
  const out: Array<{ area: string; slug: string }> = []
  for (const area of areas) {
    const slug = citySlug(area)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push({ area, slug })
    if (out.length >= LOCATION_PAGE_LIMIT) break
  }
  return out
}

export function findLocation(areas: string[], slug: string): { area: string; slug: string } | null {
  return locationPages(areas).find((l) => l.slug === slug) || null
}
