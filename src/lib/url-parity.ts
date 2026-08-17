import { validatePublicUrl } from '@/lib/site-import'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import { locationPages, mergeServiceAreas } from '@/lib/site-locations'

/**
 * What breaks when a shop's old site is replaced by their hosted one.
 *
 * THE GOAL IS NOT TO RECREATE THE OLD URL STRUCTURE. That is the obvious
 * reading of "make the new site match the old" and it is the wrong target: an
 * old site has whatever a previous agency invented —
 * `/windshield-replacement-portland-or/`, `/about-us/`, `/service-area/` — and
 * the hosted site is a template with a deliberate shape. Cloning arbitrary
 * paths onto it would mean either duplicate pages at two addresses or empty
 * pages that exist only to hold a URL, and both are worse than a redirect.
 *
 * What actually matters at a cutover is that no OLD address dies:
 *
 * - a live ad whose final URL points at an old path,
 * - a Google result someone clicks next week,
 * - a link from a directory or a supplier,
 * - the shop's own Business Profile.
 *
 * So this crawls the old site, works out the closest page on the new one for
 * every address it finds, and says plainly which ones have nowhere sensible
 * to go. That last list is the useful output: it is the set of decisions a
 * person has to make before the DNS moves, and it is exactly what nobody
 * remembers to check until the traffic has already gone.
 */

const FETCH_TIMEOUT_MS = 15_000
/** Enough to cover a small business site several times over. */
const MAX_PAGES = 300
const MAX_BYTES = 3 * 1024 * 1024

export type MatchKind = 'exact' | 'strong' | 'weak' | 'none'

export interface UrlMapping {
  /** Path on the old site, normalised: leading slash, no trailing slash. */
  from: string
  /** Path on the hosted site, or null when nothing fits. */
  to: string | null
  kind: MatchKind
  /** Why this target, in words an operator can check. */
  reason: string
}

export interface ParityReport {
  ok: boolean
  message: string
  /** Where the old URLs were read from — the sitemap is far better than a crawl. */
  source: 'sitemap' | 'crawl' | 'none'
  oldUrlCount: number
  mappings: UrlMapping[]
  /** Convenience: the ones that need a human decision. */
  unmatched: UrlMapping[]
}

async function fetchText(url: string): Promise<string | null> {
  const safe = validatePublicUrl(url)
  if (!safe.ok) return null
  try {
    const res = await fetch(safe.url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = await res.text()
    return body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body
  } catch {
    return null
  }
}

/** Leading slash, no trailing slash, no query or hash, lowercased. */
export function normalisePath(input: string): string {
  let path = input.split('#')[0].split('?')[0].toLowerCase()
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path || '/'
}

/** Words in a path, with the noise a CMS adds stripped out. */
function tokens(path: string): Set<string> {
  const STOP = new Set([
    'the', 'and', 'for', 'our', 'your', 'a', 'in', 'of', 'to', 'or',
    'page', 'pages', 'index', 'html', 'php', 'htm', 'services', 'service',
    // 'locations' is structural on OUR side, not a word about the subject.
    // Left in, /locations/beaverton tokenised as {locations, beaverton} and
    // scored only 0.5 against {repair, beaverton} — a tie with the windshield
    // page, which then won on ordering. Every "repair in <city>" page on an
    // old site was being sent to a service page instead of the city page.
    'locations', 'location', 'areas', 'area',
    'auto', 'glass', 'oregon', 'or', 'us', 'usa',
  ])
  return new Set(
    path
      .replace(/\.(html?|php|aspx?)$/i, '')
      .split(/[^a-z0-9]+/i)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length > 2 && !STOP.has(t))
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.min(a.size, b.size)
}

/** Every address the old site advertises, sitemap first. */
async function collectOldUrls(
  origin: string
): Promise<{ paths: string[]; source: ParityReport['source'] }> {
  // A sitemap is the site's own statement of what it has. A crawl only finds
  // what happens to be linked, and misses anything reachable from a menu that
  // needs JavaScript — which on an old agency site is most of it.
  const sitemap = await fetchText(`${origin}/sitemap.xml`)
  if (sitemap && /<urlset|<sitemapindex/i.test(sitemap)) {
    const locs = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])

    // A sitemap index points at more sitemaps rather than listing pages.
    const nested = locs.filter((l) => /\.xml($|\?)/i.test(l)).slice(0, 10)
    const direct = locs.filter((l) => !/\.xml($|\?)/i.test(l))
    const all = [...direct]
    for (const child of nested) {
      const body = await fetchText(child)
      if (!body) continue
      all.push(
        ...[...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
          .map((m) => m[1])
          .filter((l) => !/\.xml($|\?)/i.test(l))
      )
    }
    const paths = [...new Set(all.map((u) => {
      try {
        return normalisePath(new URL(u).pathname)
      } catch {
        return null
      }
    }).filter((p): p is string => !!p))]
    if (paths.length > 0) return { paths: paths.slice(0, MAX_PAGES), source: 'sitemap' }
  }

  // No usable sitemap: follow same-host links, breadth first, bounded.
  const seen = new Set<string>(['/'])
  const queue = ['/']
  const host = new URL(origin).host
  while (queue.length && seen.size < MAX_PAGES) {
    const path = queue.shift() as string
    const html = await fetchText(`${origin}${path}`)
    if (!html) continue
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
      if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue
      let next: URL
      try {
        next = new URL(href, `${origin}${path}`)
      } catch {
        continue
      }
      if (next.host !== host) continue
      if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|css|js)$/i.test(next.pathname)) continue
      const p = normalisePath(next.pathname)
      if (seen.has(p)) continue
      seen.add(p)
      queue.push(p)
      if (seen.size >= MAX_PAGES) break
    }
  }
  return { paths: [...seen], source: seen.size > 1 ? 'crawl' : 'none' }
}

export interface ParityClient {
  serviceAreas: string[]
  shopCities: string[]
  flags: Record<ServiceFlag, boolean>
}

/** Every path the hosted site actually serves for this shop. */
export function hostedPathsFor(client: ParityClient): string[] {
  const areas = mergeServiceAreas(client.serviceAreas || [], client.shopCities || [])
  return [
    '/',
    ...servicesForClient(client.flags).map((s) => `/services/${s.slug}`),
    ...locationPages(areas).map((l) => `/locations/${l.slug}`),
    '/privacy',
    '/terms',
  ]
}

/**
 * Best hosted page for one old path.
 *
 * Deliberately conservative about claiming a match. A wrong redirect is worse
 * than an honest "nothing fits": it sends a visitor who wanted a phone number
 * to a windscreen page, and it tells Google the two are equivalent.
 */
export function matchPath(oldPath: string, hosted: string[]): UrlMapping {
  const path = normalisePath(oldPath)

  if (hosted.includes(path)) {
    return { from: path, to: path, kind: 'exact', reason: 'Same path exists on the new site.' }
  }
  if (path === '/') {
    return { from: path, to: '/', kind: 'exact', reason: 'Home page.' }
  }

  // Contact, quote and about pages all want the home page: that is where the
  // form, the phone number and the shop's story now live.
  if (/(contact|quote|estimate|appointment|book|about|home)/i.test(path)) {
    return {
      from: path,
      to: '/',
      kind: 'strong',
      reason: 'Contact, quote and about pages are all sections of the new home page.',
    }
  }
  if (/(privacy|policy)/i.test(path)) {
    return { from: path, to: '/privacy', kind: 'strong', reason: 'Privacy policy.' }
  }
  if (/(terms|conditions)/i.test(path)) {
    return { from: path, to: '/terms', kind: 'strong', reason: 'Terms.' }
  }

  const oldTokens = tokens(path)
  let best: { to: string; score: number } | null = null
  for (const candidate of hosted) {
    const score = overlap(oldTokens, tokens(candidate))
    if (score > 0 && (!best || score > best.score)) best = { to: candidate, score }
  }

  if (best && best.score >= 0.75) {
    return {
      from: path,
      to: best.to,
      kind: 'strong',
      reason: `Same subject as ${best.to}.`,
    }
  }
  if (best && best.score >= 0.4) {
    return {
      from: path,
      to: best.to,
      kind: 'weak',
      reason: `Closest page is ${best.to} — worth checking by eye.`,
    }
  }
  return {
    from: path,
    to: null,
    kind: 'none',
    reason: 'Nothing on the new site covers this. Add a page, or send it to the home page.',
  }
}

export async function checkUrlParity(
  oldSiteUrl: string,
  client: ParityClient
): Promise<ParityReport> {
  const safe = validatePublicUrl(oldSiteUrl)
  if (!safe.ok) {
    return {
      ok: false,
      message: safe.error || 'That URL cannot be fetched.',
      source: 'none',
      oldUrlCount: 0,
      mappings: [],
      unmatched: [],
    }
  }

  const origin = safe.url.origin
  const { paths, source } = await collectOldUrls(origin)
  if (paths.length === 0) {
    return {
      ok: false,
      message: 'Could not read any pages from that site — no sitemap and no followable links.',
      source: 'none',
      oldUrlCount: 0,
      mappings: [],
      unmatched: [],
    }
  }

  const hosted = hostedPathsFor(client)
  const mappings = paths
    .map((p) => matchPath(p, hosted))
    .sort((a, b) => {
      const rank = { none: 0, weak: 1, strong: 2, exact: 3 }
      return rank[a.kind] - rank[b.kind] || a.from.localeCompare(b.from)
    })
  const unmatched = mappings.filter((m) => m.kind === 'none' || m.kind === 'weak')

  const counts = mappings.reduce<Record<MatchKind, number>>(
    (acc, m) => ({ ...acc, [m.kind]: acc[m.kind] + 1 }),
    { exact: 0, strong: 0, weak: 0, none: 0 }
  )

  return {
    ok: true,
    source,
    oldUrlCount: paths.length,
    mappings,
    unmatched,
    message:
      `${paths.length} address${paths.length === 1 ? '' : 'es'} found via ${source === 'sitemap' ? 'their sitemap' : 'a crawl'}. ` +
      `${counts.exact} already exist, ${counts.strong} have a clear home, ` +
      `${counts.weak} need a look, ${counts.none} have nowhere to go.`,
  }
}
