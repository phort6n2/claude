import type { ScannedPage } from '@/lib/site-phone-audit'

/**
 * Fetching the pages the phone audit reads.
 *
 * SEPARATE FROM THE RULES ON PURPOSE — the same split `compareToStandard()`
 * has and for the same reason: the rules are what is worth checking, and they
 * cannot be checked at all if reaching them needs the network and fifteen
 * live sites.
 *
 * THE SITEMAP IS THE PAGE LIST, not a list written here. `site-paths.ts` is
 * already the one place that decides what a page's address is — it honours
 * `pathOverrides`, so a page moved onto an address from the shop's old site
 * lives at that address and nowhere else. A hardcoded list of "/", "/services/…"
 * would audit the template paths, which for an overridden page 308s: we would
 * be checking the redirect rather than the page anybody lands on, and passing.
 */

/** Enough to catch a template-wide fault without crawling a whole site. */
export const MAX_PAGES = 6

/** One slow site must not cost the sweep the other fourteen. */
export const PAGE_TIMEOUT_MS = 10_000

async function getText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'glassleads-phone-audit' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!/html|xml/i.test(type)) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Up to `MAX_PAGES` published pages for a site, home first.
 *
 * Returns an empty list when the sitemap cannot be read, and the caller
 * treats that as "could not judge" rather than as a pass — a site that is
 * down must not resolve yesterday's finding about its phone numbers.
 */
export async function scanSitePages(origin: string): Promise<ScannedPage[]> {
  const sitemap = await getText(`${origin}/sitemap.xml`, PAGE_TIMEOUT_MS)
  if (!sitemap) return []

  const urls = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
  if (urls.length === 0) return []

  /* Home first, then a SPREAD rather than the first six. A sitemap lists the
     service pages together and the city pages together, so the first six are
     six of one kind — and a fault in the city template would be invisible
     behind six passing service pages. */
  const home = urls.filter((u) => new URL(u).pathname === '/')
  const rest = urls.filter((u) => new URL(u).pathname !== '/')
  const step = Math.max(1, Math.ceil(rest.length / (MAX_PAGES - home.length || 1)))
  const spread = rest.filter((_, i) => i % step === 0)
  const picked = [...home, ...spread].slice(0, MAX_PAGES)

  const pages: ScannedPage[] = []
  for (const url of picked) {
    const html = await getText(url, PAGE_TIMEOUT_MS)
    if (html) pages.push({ path: new URL(url).pathname, html })
  }
  return pages
}
