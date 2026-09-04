import { validatePublicUrl } from '@/lib/site-import'
import { servicePath, locationPath, readPathOverrides } from '@/lib/site-paths'
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
  /** Which sitemap answered, so the operator can see what was actually read. */
  sitemapUrl?: string | null
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

/**
 * Read one sitemap and return the page paths in it, following a sitemap index
 * one level down. Returns an empty array for anything that is not a sitemap,
 * so a 404 page and a stray HTML file cannot be mistaken for one.
 */
async function readSitemap(url: string): Promise<string[]> {
  const body = await fetchText(url)
  if (!body || !/<urlset|<sitemapindex/i.test(body)) return []
  const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])

  // A sitemap index points at more sitemaps rather than listing pages.
  const nested = locs.filter((l) => /\.xml($|\?)/i.test(l)).slice(0, 10)
  const all = locs.filter((l) => !/\.xml($|\?)/i.test(l))
  for (const child of nested) {
    const childBody = await fetchText(child)
    if (!childBody) continue
    all.push(
      ...[...childBody.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
        .map((m) => m[1])
        .filter((l) => !/\.xml($|\?)/i.test(l))
    )
  }
  return [
    ...new Set(
      all
        .map((u) => {
          try {
            return normalisePath(new URL(u).pathname)
          } catch {
            return null
          }
        })
        .filter((p): p is string => !!p)
    ),
  ]
}

/** Does this address look like a sitemap rather than a page? */
export function looksLikeSitemap(url: URL): boolean {
  const path = url.pathname.toLowerCase()
  return path.endsWith('.xml') || path.endsWith('.xml.gz') || /sitemap/.test(path)
}

/**
 * Where a site's sitemap actually lives, in the order worth trying.
 *
 * /sitemap.xml alone was the whole of this, and it is the one WordPress has
 * not used by default since 5.5 (/wp-sitemap.xml), nor Yoast (/sitemap_index.xml),
 * nor Squarespace or Wix consistently. Those sites fell back to a crawl and
 * reported half their pages, quietly. robots.txt is asked first because it is
 * the site's own answer to this exact question.
 */
async function sitemapCandidates(origin: string): Promise<string[]> {
  const fromRobots: string[] = []
  const robots = await fetchText(`${origin}/robots.txt`)
  if (robots) {
    for (const [, value] of robots.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)) {
      try {
        fromRobots.push(new URL(value, origin).toString())
      } catch {
        // A malformed Sitemap: line is not a reason to give up on the rest.
      }
    }
  }
  return [
    ...fromRobots.slice(0, 5),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemap1.xml`,
  ]
}

/** Every address the old site advertises, sitemap first. */
async function collectOldUrls(
  origin: string
): Promise<{ paths: string[]; source: ParityReport['source']; sitemapUrl?: string }> {
  // A sitemap is the site's own statement of what it has. A crawl only finds
  // what happens to be linked, and misses anything reachable from a menu that
  // needs JavaScript — which on an old agency site is most of it.
  for (const candidate of await sitemapCandidates(origin)) {
    const paths = await readSitemap(candidate)
    if (paths.length > 0) {
      return { paths: paths.slice(0, MAX_PAGES), source: 'sitemap', sitemapUrl: candidate }
    }
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
  /** Pages already moved onto one of the old site's addresses. */
  pathOverrides?: unknown
}

/** Every path the hosted site actually serves for this shop. */
export function hostedPathsFor(client: ParityClient): string[] {
  const areas = mergeServiceAreas(client.serviceAreas || [], client.shopCities || [])
  // The addresses the site ACTUALLY serves, overrides included — otherwise a
  // page already moved onto an old address is reported as having nowhere to
  // go, which is the one row an operator must not have to second-guess.
  const overrides = readPathOverrides(client.pathOverrides)
  return [
    '/',
    ...servicesForClient(client.flags).map((s) => servicePath(s.slug, overrides)),
    ...locationPages(areas).map((l) => locationPath(l.slug, overrides)),
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

  // A pasted SITEMAP is read as the sitemap, not as a page on a site whose
  // sitemap we then go looking for. It is the most complete answer available —
  // the site's own list — and on a site that keeps it somewhere unusual it is
  // the only way to get the full set.
  let paths: string[]
  let source: ParityReport['source']
  let sitemapUrl: string | null = null
  if (looksLikeSitemap(safe.url)) {
    sitemapUrl = safe.url.toString()
    paths = await readSitemap(sitemapUrl)
    source = paths.length > 0 ? 'sitemap' : 'none'
    if (paths.length === 0) {
      // Deliberately NOT falling back to a crawl. Somebody who pasted a
      // sitemap needs to know that address did not answer with one — silently
      // doing something else is how you get a short list nobody questions.
      return {
        ok: false,
        message:
          'That address did not return a sitemap. Check it opens in a browser and shows XML — or paste the site address instead and its sitemap will be looked for.',
        source: 'none',
        sitemapUrl,
        oldUrlCount: 0,
        mappings: [],
        unmatched: [],
      }
    }
  } else {
    const found = await collectOldUrls(origin)
    paths = found.paths
    source = found.source
    sitemapUrl = found.sitemapUrl ?? null
  }

  if (paths.length === 0) {
    return {
      ok: false,
      message:
        'Could not read any pages from that site — no sitemap at any of the usual addresses, nothing in robots.txt, and no followable links. If you know where their sitemap is, paste that address instead.',
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

  // Naming the sitemap that answered matters: "found via their sitemap" is
  // unfalsifiable, and the difference between 12 addresses and 120 is usually
  // which sitemap got read.
  const via =
    source === 'sitemap'
      ? `their sitemap (${sitemapUrl})`
      : 'a crawl of their links — no sitemap answered, so this may be short'

  return {
    ok: true,
    source,
    sitemapUrl,
    oldUrlCount: paths.length,
    mappings,
    unmatched,
    message:
      `${paths.length} address${paths.length === 1 ? '' : 'es'} found via ${via}. ` +
      `${counts.exact} already exist, ${counts.strong} have a clear home, ` +
      `${counts.weak} need a look, ${counts.none} have nowhere to go.`,
  }
}
