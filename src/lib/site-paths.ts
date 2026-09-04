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

/**
 * Template pages MOVED to an address the shop's old site used.
 *
 * Keyed by the template's own path, valued by the address to serve it at:
 * `{ "/side-window-replacement": "/car-window-repair" }`.
 *
 * The point is the URL a shop already owns. An old site that ranked for
 * "car window repair" at /car-window-repair has links, a Google result and
 * usually a live ad pointing there. A redirect keeps those working, but it
 * changes the destination — a hop on every paid click, and a new address
 * whose history starts today. Renaming our page to their address keeps the
 * page, the ranking and the ad exactly where they were.
 *
 * ONE address per page, always. The template path 308s to the override, every
 * link and the sitemap use the override, and the canonical says the override.
 * Serving both would split the ranking between two addresses, which is the
 * problem this exists to avoid.
 */
export type PathOverrides = Record<string, string>

/** Whatever came out of the JSON column, reduced to pairs we can trust. */
export function readPathOverrides(value: unknown): PathOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: PathOverrides = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') continue
    const from = normaliseSitePath(key)
    const to = normaliseSitePath(raw)
    if (!from || !to || from === '/' || to === '/' || from === to) continue
    out[from] = to
  }
  return out
}

/** Leading slash, no trailing slash, lowercase, no query or hash. */
export function normaliseSitePath(input: string): string {
  let path = String(input || '').split('#')[0].split('?')[0].trim().toLowerCase()
  if (!path) return ''
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

/** The address a template page is actually served at for this client. */
export function withOverride(path: string, overrides?: PathOverrides): string {
  return overrides?.[path] || path
}

/** The template path behind a custom address, or null if it is not one. */
export function canonicalForCustom(path: string, overrides?: PathOverrides): string | null {
  if (!overrides) return null
  const wanted = normaliseSitePath(path)
  for (const [canonical, custom] of Object.entries(overrides)) {
    if (custom === wanted) return canonical
  }
  return null
}

/**
 * Why this address cannot be used for that page, or null when it can.
 *
 * `reserved` is every address the site already answers on by itself — the
 * other services, the cities, /privacy. Handing a page one of those would
 * shadow a real page with no sign of it anywhere.
 *
 * MIDDLEWARE MATTERS HERE. Flat service slugs and their aliases are rewritten
 * to the template route BEFORE any of this app's routing sees them, and
 * middleware cannot read the database to know about an override. So an
 * address in that list would silently keep serving the old page: rejected
 * here rather than accepted and quietly ignored.
 */
export const MIDDLEWARE_FLAT_PATHS = new Set([
  'windshield-replacement',
  'windshield-repair',
  'rock-chip-repair',
  'side-window-replacement',
  'back-glass-replacement',
  'sunroof-repair',
  'adas-calibration',
  'auto-glass-replacement',
  'mobile-windshield-replacement',
  'auto-glass-repair',
  'mobile-windshield-repair',
  'windshield-crack-repair',
  'windshield-chip-repair',
])

export function pathOverrideProblem(
  custom: string,
  canonical: string,
  reserved: string[]
): string | null {
  const to = normaliseSitePath(custom)
  const from = normaliseSitePath(canonical)
  if (!to || to === '/') return 'Give an address, and not the home page.'
  if (!/^\/[a-z0-9/-]+$/.test(to)) {
    return 'Addresses are lowercase letters, numbers and hyphens.'
  }
  if (to === from) return 'That is already where the page lives.'
  const bare = to.slice(1)
  if (MIDDLEWARE_FLAT_PATHS.has(bare)) {
    return `${to} is one of the template's own service addresses, which is resolved before this rule could apply. Pick another.`
  }
  if (bare.startsWith(LOCATION_PREFIX)) {
    return `${to} is the shape of a city page address, which resolves first. Pick another.`
  }
  if (reserved.map(normaliseSitePath).includes(to)) {
    return `${to} is already a page on this site.`
  }
  return null
}

export function servicePath(slug: string, overrides?: PathOverrides): string {
  return withOverride(`/${slug}`, overrides)
}

export function locationPath(slug: string, overrides?: PathOverrides): string {
  return withOverride(`/${LOCATION_PREFIX}${slug}`, overrides)
}

/** The city in a flat location path, or null when it is not one. */
export function cityFromPath(bare: string): string | null {
  if (!bare.startsWith(LOCATION_PREFIX) || bare.includes('/')) return null
  const city = bare.slice(LOCATION_PREFIX.length)
  return city || null
}
