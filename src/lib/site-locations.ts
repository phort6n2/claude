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

/**
 * Cities where the client actually has a shop, merged ahead of their coverage
 * cities into one list.
 *
 * Shop cities lead because a city with a real address, real hours, and its
 * own map makes the strongest page the site can have — stronger than the
 * sixth coverage-only city — and the page cap below takes from the end.
 * Doing the merge once, at the page level, is what keeps the footer links,
 * the coverage band, the sitemap, and the router all agreeing on which pages
 * exist.
 */
export function mergeServiceAreas(areas: string[], shopCities: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const area of [...shopCities, ...areas]) {
    const key = area.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(area.trim())
  }
  return out
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
