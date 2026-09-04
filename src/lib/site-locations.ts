/**
 * Location pages: ONE PER SERVICE-AREA CITY. Every page renders the full site
 * shell with real business data (reviews, photos, warranty, services) —
 * city-specific copy stays factual and flag-derived, never invented.
 *
 * There used to be a hard cap of five, from before city copy existed. It was
 * the wrong tool: it left cities the shop genuinely serves with no page to
 * send an ad to, while doing nothing about the actual risk it was aimed at.
 * That risk — a farm of near-identical city pages — is handled properly by
 * `cityIsIndexable` in city-content.ts, per city and on evidence: a page with
 * no shop and under CITY_CONTENT_MIN_WORDS of its own copy is served but
 * carries noindex, stays out of the sitemap, and is not linked from the
 * coverage band. So a thin city cannot become a doorway page, and a paid
 * click still lands somewhere real instead of a 404 (which gets the ad
 * disapproved).
 *
 * The number below is a SANITY BOUND, not an editorial one — it exists so a
 * pasted list of two hundred towns cannot mint two hundred routes. Any real
 * service-area list sits far under it.
 */
export const LOCATION_PAGE_LIMIT = 60

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

/** Every area gets a page, de-duplicated by slug, up to the sanity bound. */
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
