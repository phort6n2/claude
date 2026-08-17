/**
 * The addresses these sites use for services and cities.
 *
 * FLAT, not /services/ and /locations/, because every site this platform
 * replaces puts them at the root — /windshield-repair,
 * /auto-glass-repair-portland — and those are the URLs already sitting in a
 * shop's Google Ads account. Serving the same page at a different address
 * would mean editing every final URL at cutover and starting the landing
 * page's history over; serving it at the same address costs nothing.
 *
 * Both shapes resolve — the /services/ form still answers for anything
 * already linked — but only ONE may be linked to and listed, or the same page
 * is offered at two addresses and the ranking signal splits between them.
 * That is what this module is for: every link, canonical, sitemap entry and
 * schema URL is built here, so the two can never drift.
 */

/** The word an auto glass site puts in front of a city. */
export const LOCATION_PREFIX = 'auto-glass-repair-'

export function servicePath(slug: string): string {
  return `/${slug}`
}

export function locationPath(slug: string): string {
  return `/${LOCATION_PREFIX}${slug}`
}

/** The city in a flat location path, or null when it is not one. */
export function cityFromPath(bare: string): string | null {
  if (!bare.startsWith(LOCATION_PREFIX) || bare.includes('/')) return null
  const city = bare.slice(LOCATION_PREFIX.length)
  return city || null
}
