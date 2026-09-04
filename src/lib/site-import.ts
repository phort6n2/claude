import Anthropic from '@anthropic-ai/sdk'

/**
 * Import site content from a client's existing website.
 *
 * Fetches the page the admin points at (plus a few same-origin pages that look
 * like warranty/FAQ/about pages), collects candidate photo URLs from <img>
 * tags, and asks Claude to extract ONLY what is genuinely written on the site:
 * warranty terms verbatim, real FAQs, a footer blurb, hero-bullet candidates.
 * The model is explicitly instructed to return null/empty for anything the
 * site doesn't state — never to invent. The result is a DRAFT that pre-fills
 * the Site Content editor; nothing goes live until an admin reviews and saves.
 */

export interface ImportedPhoto {
  url: string
  alt: string
  pool: 'GALLERY' | 'BODY'
}

export interface ImportedSiteContent {
  warrantyTitle: string | null
  warrantyText: string | null
  faq: Array<{ q: string; a: string }>
  heroBullets: Array<{ lead: string; text: string }>
  chapters: Array<{ heading: string; body: string; photoUrl: string }>
  footerBlurb: string | null
  photos: ImportedPhoto[]
  logoUrl: string | null
  serviceAreas: string[]
  pagesCrawled: string[]
  warnings: string[]
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 600_000
const MAX_EXTRA_PAGES = 4
const MAX_TEXT_PER_PAGE = 14_000
const MAX_PHOTO_CANDIDATES = 24

// Somebody else's recognisable mark: insurer badges, review widgets, builder
// credits — and car makes, because auto-trade sites carry "makes we service"
// strips whose images are literally other brands' logos. Shared between the
// logo scorer and the stale-logo check in the import route.
const PARTNER_BRAND_RE =
  /geico|allstate|state.?farm|progressive|farmers|usaa|nationwide|liberty|safelite|google|yelp|facebook|bbb|wix|squarespace|godaddy|wordpress|elementor/
const CAR_MAKE_RE =
  /acura|honda|toyota|ford|chevrolet|chevy|nissan|subaru|bmw|mercedes|benz|audi|lexus|kia|hyundai|jeep|dodge|\bram\b|gmc|mazda|volkswagen|\bvw\b|tesla|volvo|cadillac|buick|chrysler|infiniti|porsche|jaguar|rover/

const nameTokensOf = (businessName: string): string[] =>
  businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !['the', 'and', 'auto', 'glass', 'inc', 'llc'].includes(t))

/**
 * Does this URL/filename look like some OTHER brand's mark rather than the
 * business's own? Used to clear a stale saved logo when a re-import finds no
 * logo: the scorer refusing to pick Honda's badge is only half the fix if
 * Honda's badge is already saved on the client from an earlier, dumber import.
 * The business's own name in the string always wins — "Honda Row Auto Glass"
 * gets to have "honda" in its logo filename.
 */
export function looksLikeForeignMark(s: string, businessName = ''): boolean {
  const lower = s.toLowerCase()
  if (nameTokensOf(businessName).some((t) => lower.includes(t))) return false
  return PARTNER_BRAND_RE.test(lower) || CAR_MAKE_RE.test(lower)
}

/**
 * Admin-entered, but the server fetches it, so block the obvious SSRF shapes —
 * same policy as webhook destinations (https-only, no private/link-local hosts).
 */
export function validatePublicUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { ok: false, error: 'Not a valid URL' }
  }
  // Google Business Profiles routinely store plain http:// addresses, and
  // that's what seeds the import field — so upgrade rather than reject. A
  // site that genuinely has no https will fail at fetch time with a clear
  // "could not fetch" instead of blocking here on its scheme.
  if (parsed.protocol === 'http:') parsed.protocol = 'https:'
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'URL must use https://' }
  }
  const host = parsed.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.startsWith('[')
  ) {
    return { ok: false, error: 'Host is not allowed' }
  }
  return { ok: true, url: parsed }
}

/**
 * Fetch a page, and SAY WHY when it cannot be fetched.
 *
 * This used to return null for five unrelated failures — blocked, missing,
 * timed out, not HTML, redirected somewhere private — and the caller turned
 * all five into one sentence about the page being "not reachable, not HTML,
 * or too slow". That sentence is unactionable: the fix for a 403 (the site
 * refuses robots) is nothing like the fix for a typo in the URL.
 *
 * The User-Agent is a real browser string on purpose. Shop sites on Wix,
 * Squarespace, GoDaddy and anything behind Cloudflare routinely 403 an
 * obvious bot — and this fetch is not crawling, it is one page an admin
 * explicitly asked for, on a site the client owns.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

type FetchFailure =
  | { kind: 'status'; status: number }
  | { kind: 'not-html'; contentType: string }
  | { kind: 'redirect-blocked'; to: string }
  | { kind: 'timeout' }
  | { kind: 'network'; message: string }

type FetchResult = { ok: true; html: string } | { ok: false; failure: FetchFailure }

/** The failure, in the words of somebody who has to act on it. */
export function describeFetchFailure(failure: FetchFailure, url: string): string {
  switch (failure.kind) {
    case 'status':
      if (failure.status === 403 || failure.status === 401) {
        return `${url} refused the request (HTTP ${failure.status}) — the site is blocking automated visits, usually Cloudflare or a security plugin. Open it in a browser to confirm it loads, then paste the page's content in by hand, or ask the shop's host to allow it.`
      }
      if (failure.status === 404) {
        return `${url} returned 404 — check the address; the site may have moved or the page may be gone.`
      }
      if (failure.status >= 500) {
        return `${url} returned HTTP ${failure.status} — their server is erroring. Worth trying again in a few minutes.`
      }
      return `${url} returned HTTP ${failure.status}.`
    case 'not-html':
      return `${url} did not return a web page (content type "${failure.contentType}"). Point this at the site's home page rather than a PDF or a file.`
    case 'redirect-blocked':
      return `${url} redirected to ${failure.to}, which is not a public address we will fetch.`
    case 'timeout':
      return `${url} did not respond within ${Math.round(FETCH_TIMEOUT_MS / 1000)} seconds. Their host may be slow — try again, and if it keeps timing out the site is probably too slow to import.`
    case 'network':
      return `${url} could not be reached (${failure.message}). Check the address is right and the site is up.`
  }
}

async function fetchHtml(url: URL): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, failure: { kind: 'status', status: res.status } }
    // Redirects are followed — re-check the landing host against the guard.
    const finalCheck = validatePublicUrl(res.url || url.toString())
    if (!finalCheck.ok) {
      return { ok: false, failure: { kind: 'redirect-blocked', to: res.url || url.toString() } }
    }
    const type = res.headers.get('content-type') || ''
    if (!type.includes('html')) {
      return { ok: false, failure: { kind: 'not-html', contentType: type || 'unknown' } }
    }
    const text = await res.text()
    return { ok: true, html: text.slice(0, MAX_PAGE_BYTES) }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    if (aborted) return { ok: false, failure: { kind: 'timeout' } }
    return {
      ok: false,
      failure: { kind: 'network', message: err instanceof Error ? err.message : 'request failed' },
    }
  } finally {
    clearTimeout(timer)
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_TEXT_PER_PAGE)
}

/** Same-origin links that look like content pages worth reading. */
function findContentLinks(html: string, base: URL): URL[] {
  const out = new Map<string, URL>()
  const re = /<a[^>]+href\s*=\s*["']([^"'#]+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.size < 30) {
    let link: URL
    try {
      link = new URL(m[1], base)
    } catch {
      continue
    }
    if (link.origin !== base.origin) continue
    if (!/warrant|faq|about|guarantee|service|insurance|why/i.test(link.pathname)) continue
    if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|css|js)$/i.test(link.pathname)) continue
    link.hash = ''
    link.search = ''
    if (link.pathname === base.pathname) continue
    out.set(link.toString(), link)
  }
  return [...out.values()].slice(0, MAX_EXTRA_PAGES)
}

/**
 * The site's logo, scored rather than first-matched.
 *
 * "First <img> mentioning logo" grabbed whatever happened to render earliest:
 * an insurer's badge in a trust bar, a partner logo, the web designer's
 * credit in the footer. And the og:image fallback is usually a hero PHOTO,
 * not a logo — a wrong logo is worse than none, because none leaves the
 * admin looking for the right one while wrong quietly ships someone else's
 * mark. So og:image is gone entirely.
 *
 * Order of trust:
 *   1. JSON-LD Organization/LocalBusiness "logo" — the site declaring its own
 *      identity, and the one signal that is explicit rather than inferred.
 *   2. <img> candidates mentioning "logo", scored: business-name tokens in
 *      the file/alt, early in the document (headers come first), penalised
 *      for footer position and for carrying some OTHER brand's name.
 *   3. apple-touch-icon — squarish brand mark, still theirs.
 */
export function findLogo(html: string, base: URL, businessName = ''): string | null {
  const absolutize = (src: string): string | null => {
    if (!src || src.startsWith('data:')) return null
    try {
      const abs = new URL(src, base)
      return abs.protocol === 'https:' ? abs.toString() : null
    } catch {
      return null
    }
  }

  // 1. JSON-LD logo
  const ldRe = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  let ld: RegExpExecArray | null
  while ((ld = ldRe.exec(html))) {
    try {
      const walk = (node: unknown): string | null => {
        if (!node || typeof node !== 'object') return null
        if (Array.isArray(node)) {
          for (const item of node) {
            const hit = walk(item)
            if (hit) return hit
          }
          return null
        }
        const obj = node as Record<string, unknown>
        const logo = obj.logo
        if (typeof logo === 'string') return logo
        if (logo && typeof logo === 'object' && typeof (logo as { url?: unknown }).url === 'string') {
          return (logo as { url: string }).url
        }
        for (const value of Object.values(obj)) {
          const hit = walk(value)
          if (hit) return hit
        }
        return null
      }
      const found = walk(JSON.parse(ld[1]))
      const abs = found && absolutize(found)
      if (abs) return abs
    } catch {
      /* malformed JSON-LD is routine; keep going */
    }
  }

  // 2. Scored <img loading="lazy"> candidates
  const nameTokens = nameTokensOf(businessName)
  const footerStart = (() => {
    const i = html.search(/<footer[\s>]/i)
    return i === -1 ? html.length * 0.85 : i
  })()

  let best: { url: string; score: number } | null = null
  const imgRe = /<img[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html))) {
    const tag = m[0]
    if (!/logo/i.test(tag)) continue
    const src =
      /(?:data-lazy-src|data-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || ''
    const abs = absolutize(src)
    if (!abs) continue
    const haystack = tag.toLowerCase()

    let score = 0
    // Their own name in the tag is the strongest ownership signal available.
    for (const token of nameTokens) if (haystack.includes(token)) score += 3
    // Theme classes that mean "this is THE site logo".
    if (/site-logo|custom-logo|navbar-brand|site-branding|header-logo|main-logo/.test(haystack)) score += 3
    // Early in the document is where a site's own logo lives.
    if (m.index < html.length * 0.25) score += 2
    // Footer imagery is credits and badges far more often than identity.
    if (m.index > footerStart) score -= 3
    // Carrying a DIFFERENT recognisable brand: insurer badges, review
    // widgets, builder credits, car-make badges from "makes we service"
    // strips (files literally named cars_logo_acura.jpg — seen in
    // production, not hypothetical). The exact names matter less than
    // having any list at all.
    if (PARTNER_BRAND_RE.test(haystack)) score -= 4
    if (CAR_MAKE_RE.test(haystack)) score -= 4
    if (!best || score > best.score) best = { url: abs, score }
  }
  if (best && best.score > 0) return best.url

  // 3. apple-touch-icon
  const touch =
    /<link[^>]+rel\s*=\s*["']apple-touch-icon[^"']*["'][^>]+href\s*=\s*["']([^"']+)["']/i.exec(html) ||
    /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']apple-touch-icon[^"']*["']/i.exec(html)
  if (touch) {
    const abs = absolutize(touch[1])
    if (abs) return abs
  }

  // A zero-score "logo" img is still more likely theirs than og:image is —
  // but a NEGATIVE score means it was positively identified as someone
  // else's mark, and no logo beats Honda's. The admin can upload one.
  return best && best.score >= 0 ? best.url : null
}

/** Largest URL out of a srcset attribute value ("url1 400w, url2 1200w"). */
function pickFromSrcset(srcset: string): string | null {
  let best: { url: string; w: number } | null = null
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/)
    if (!url) continue
    const w = size ? parseInt(size, 10) || 0 : 0
    if (!best || w >= best.w) best = { url, w }
  }
  return best?.url || null
}

/**
 * Candidate photos from <img>/<source> tags: absolute https, no
 * icons/logos/tracking. Lazy-loading themes (WordPress especially) park the
 * real URL in data-lazy-src / data-src / srcset and leave a placeholder in
 * src, so every one of those is checked — src alone finds nothing there.
 */
export function findPhotoCandidates(html: string, base: URL): Array<{ url: string; alt: string }> {
  const out = new Map<string, { url: string; alt: string }>()
  const re = /<(?:img|source)[^>]*>/gi
  const attr = (tag: string, name: string) =>
    new RegExp(name + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(tag)?.[1]
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.size < MAX_PHOTO_CANDIDATES) {
    const tag = m[0]
    let src =
      attr(tag, 'data-lazy-src') || attr(tag, 'data-src') || attr(tag, 'data-original') || attr(tag, 'src')
    if (!src || src.startsWith('data:')) {
      const srcset = attr(tag, 'data-lazy-srcset') || attr(tag, 'data-srcset') || attr(tag, 'srcset')
      src = (srcset && pickFromSrcset(srcset)) || undefined
    }
    if (!src || src.startsWith('data:')) continue
    let abs: URL
    try {
      abs = new URL(src, base)
    } catch {
      continue
    }
    if (abs.protocol !== 'https:') continue
    if (/\.(svg|gif|ico)(\?|$)/i.test(abs.pathname)) continue
    // Junk filter runs on the PATH only — hostnames like spcdn.shortpixel.ai
    // (an image CDN half the WordPress world uses) must not trip "pixel".
    if (/logo|icon|sprite|favicon|pixel|badge|avatar|placeholder/i.test(abs.pathname)) continue
    // Declared dimensions are a cheap junk filter: a 1x1 is a tracking
    // pixel, a 40px square is an icon whatever its filename says. Only tags
    // that DECLARE a small size are dropped — most real photos declare
    // nothing, and absence must not count against them.
    const w = parseInt(/\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] || '', 10)
    const h = parseInt(/\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1] || '', 10)
    if ((Number.isFinite(w) && w > 0 && w < 120) || (Number.isFinite(h) && h > 0 && h < 120)) continue
    const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || ''
    out.set(abs.toString(), { url: abs.toString(), alt: alt.trim().slice(0, 200) })
  }
  return [...out.values()]
}

/**
 * Is this URL actually a fetchable image? Headers only — the body is
 * cancelled. Serves two purposes: dead URLs never make it into the gallery
 * (they would 404 on the hosted site too), and the vision request below can't
 * be sunk by one image the API fails to fetch.
 */
async function isFetchableImage(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GlassLeadsImporter/1.0)', Accept: 'image/*' },
      redirect: 'follow',
    })
    const ok = res.ok && (res.headers.get('content-type') || '').startsWith('image/')
    await res.body?.cancel().catch(() => {})
    return ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function parseModelJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(cleaned) as Record<string, unknown>
}

const asStr = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export async function importSiteContent(
  rawUrl: string,
  business: { name: string; city: string; state: string }
): Promise<{ ok: true; draft: ImportedSiteContent } | { ok: false; error: string }> {
  const check = validatePublicUrl(rawUrl)
  if (!check.ok) return { ok: false, error: check.error }

  // Settings → API keys first, env second — the same resolution the other
  // model-backed features use. Reading only the env is how a key saved
  // through the Settings screen "did not exist" for this one feature.
  const { secretSetting } = await import('@/lib/secret-settings')
  const apiKey = await secretSetting('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return { ok: false, error: 'No Anthropic API key configured (Settings → API keys).' }
  }

  const mainFetch = await fetchHtml(check.url)
  if (!mainFetch.ok) {
    const reason = describeFetchFailure(mainFetch.failure, check.url.toString())
    // Logged as well as returned: a failure nobody can see in the runtime
    // logs is one that has to be reproduced before it can be diagnosed.
    console.warn(`[SiteImport] fetch failed: ${reason}`)
    return { ok: false, error: reason }
  }
  const mainHtml = mainFetch.html

  const warnings: string[] = []
  const logoUrl = findLogo(mainHtml, check.url, business.name)
  const pages: Array<{ url: string; text: string }> = [
    { url: check.url.toString(), text: htmlToText(mainHtml) },
  ]
  const photoMap = new Map<string, { url: string; alt: string }>()
  for (const p of findPhotoCandidates(mainHtml, check.url)) photoMap.set(p.url, p)

  const extraLinks = findContentLinks(mainHtml, check.url)
  const extraPages = await Promise.all(
    extraLinks.map(async (link) => {
      const result = await fetchHtml(link)
      // A linked page that will not load costs that page, never the import.
      return result.ok ? { link, html: result.html } : null
    })
  )
  for (const extra of extraPages) {
    if (!extra) continue
    pages.push({ url: extra.link.toString(), text: htmlToText(extra.html) })
    for (const p of findPhotoCandidates(extra.html, extra.link)) {
      if (photoMap.size < MAX_PHOTO_CANDIDATES) photoMap.set(p.url, p)
    }
  }

  // Keep only URLs that actually serve an image. Dead links would 404 on the
  // hosted site, and one unfetchable URL must not sink the vision request.
  const rawCandidates = [...photoMap.values()]
  const fetchable = await Promise.all(rawCandidates.map((p) => isFetchableImage(p.url)))
  const photoCandidates = rawCandidates.filter((_, i) => fetchable[i])
  if (rawCandidates.length > photoCandidates.length) {
    console.log(
      `[SiteImport] dropped ${rawCandidates.length - photoCandidates.length} unfetchable image URL(s)`
    )
  }
  if (photoCandidates.length === 0) {
    warnings.push(
      'No photo URLs found in the page HTML — the site may render its images with JavaScript. Photos can be added manually below.'
    )
  }

  const prompt = `You are extracting content from an auto glass shop's existing website so it can pre-fill their new landing site. The business is "${business.name}" in ${business.city}, ${business.state}.

STRICT RULES — these exist for legal-compliance reasons:
- Extract ONLY what the site actually says. NEVER invent, embellish, or "improve" facts. If the site doesn't state something, return null (or an empty array) for that field.
- Warranty text must be VERBATIM from the site (light whitespace cleanup only). If the site mentions a warranty but never defines its terms, put the mention in warrantyTitle and leave warrantyText null.
- No deductible-waiver or "we pay your deductible" style offers, even if the site has them — skip those entirely (illegal to advertise in some states).
- No claims of being "approved" or "preferred" by insurers or third parties.
- No star ratings or review counts — those come from a live Google feed elsewhere.

Return ONLY a JSON object (no prose, no markdown fence) with exactly these keys:
{
  "warrantyTitle": string|null,        // e.g. "Lifetime Workmanship Warranty" — only if the site uses it
  "warrantyText": string|null,         // the full terms, verbatim from the site
  "faq": [{"q": string, "a": string}], // real Q&As from the site (max 12); [] if none
  "heroBullets": [{"lead": string, "text": string}], // up to 4 short factual selling points the site itself states; "lead" is the bold first words
  "footerBlurb": string|null,          // one factual sentence about the business, from the site's own copy
  "chapters": [{"heading": string, "body": string, "photoIndex": number|null}], // 2-4 editorial sections telling this business's story, BUILT ONLY from facts and phrasing already on their site (their history, their approach, what makes them different — in their voice). 1-3 short paragraphs each, separated by blank lines. Condensing and light editing of THEIR copy is fine; adding facts is not. photoIndex optionally pairs a candidate photo whose subject fits the section. [] if the site has no real "about" substance.
  "serviceAreas": [string], // city/town names the site EXPLICITLY says they serve (coverage lists, footer links, "areas we serve"). Proper city names only — no regions like "the Westside" or "the metro", no states, no neighborhoods unless the site treats them as service cities. Max 10; [] if the site doesn't name cities.
  "photos": [{"index": number, "alt": string, "pool": "gallery"|"body"}] // pick from the NUMBERED candidates BY INDEX. The candidate images are attached above this text — judge each by WHAT IS ACTUALLY IN IT, not its filename.
  //   KEEP any photograph that could plausibly illustrate this business: the shop, vans/trucks, technicians, vehicles being worked on, completed glass work, the storefront, glass being handled.
  //   DROP only what is not a photograph of that kind at all: car manufacturers' logos or badges (Acura, Honda, Toyota… — auto sites carry "makes we service" strips), any company's logo or wordmark, maps, screenshots, text banners/graphics, clip art.
  //   POOL — this is the important judgement. "gallery" builds a grid a visitor reads as THIS SHOP'S OWN COMPLETED JOBS. "body" is illustrative imagery beside the page's text, which claims nothing about who took it.
  //     Use "gallery" for photographs that look like this specific business: a van with signage, a named storefront, a technician on an actual job, a real customer vehicle.
  //     Use "body" for generic or stock-looking imagery — a polished studio shot, an anonymous model in clean coveralls, an image whose URL or filename names a stock agency (istock, shutterstock, gettyimages, unsplash, pexels, adobestock, depositphotos, dreamstime, 123rf). Licensed stock carries no watermark and looks exactly like a real job photo, so the filename is often the only evidence and it OVERRIDES what you see in the image. These are kept — the shop published them on their own site — they simply must not pose as this shop's completed work.
  //   If a candidate's image is NOT attached (it failed to load), judge by URL/alt alone and keep it unless those positively identify junk. Write a short factual alt describing what is visible — do not invent specifics. Max 12.
}

CANDIDATE PHOTOS (refer to these by index):
${photoCandidates.length ? photoCandidates.map((p, i) => `[${i}] ${p.url}${p.alt ? ` (alt: ${p.alt})` : ''}`).join('\n') : '(none found)'}

SITE PAGES:
${pages.map((p) => `=== ${p.url} ===\n${p.text}`).join('\n\n')}`

  try {
    const anthropic = new Anthropic({ apiKey })
    // Long input → stream to avoid request timeouts; we only need the final message.
    const callModel = (content: string | Anthropic.Messages.ContentBlockParam[]) =>
      anthropic.messages
        .stream({
          model: 'claude-opus-5',
          max_tokens: 8000,
          messages: [{ role: 'user', content }],
        })
        .finalMessage()

    // Attach the candidate images so the model judges photos by what is in
    // them, not by filename — a car-make badge named images.jpg is invisible
    // to text but unmistakable to eyes. Labels precede each image so the
    // BY-INDEX contract stays unambiguous.
    const visionContent: Anthropic.Messages.ContentBlockParam[] = photoCandidates.flatMap(
      (p, i): Anthropic.Messages.ContentBlockParam[] => [
        { type: 'text', text: `Candidate photo [${i}]:` },
        { type: 'image', source: { type: 'url', url: p.url } },
      ]
    )
    visionContent.push({ type: 'text', text: prompt })

    let message: Anthropic.Messages.Message
    try {
      message = await callModel(photoCandidates.length ? visionContent : prompt)
    } catch (visionErr) {
      // Usually the API failing to fetch one of the image URLs. The text-only
      // prompt still carries the full candidate list, so the import degrades
      // to filename judgement rather than dying.
      console.warn('[SiteImport] Vision request failed, retrying text-only:', visionErr)
      message = await callModel(prompt)
    }

    if (message.stop_reason === 'refusal') {
      return { ok: false, error: 'The model declined to process this page' }
    }
    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { ok: false, error: 'No text in model response' }
    }
    const parsed = parseModelJson(textBlock.text)

    // The model picks photos BY INDEX into the crawled candidate list, so it
    // can never introduce a URL of its own — and can never lose one to a
    // mistyped hash in a long filename (which is how an earlier echo-the-URL
    // scheme silently dropped every photo).
    const seenIdx = new Set<number>()
    const photos: ImportedPhoto[] = Array.isArray(parsed.photos)
      ? (parsed.photos as Array<{ index?: unknown; alt?: unknown; pool?: unknown }>)
          .filter((p) => {
            const i = p?.index
            if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= photoCandidates.length) return false
            if (seenIdx.has(i)) return false
            seenIdx.add(i)
            return true
          })
          .slice(0, 12)
          .map((p) => {
            const candidate = photoCandidates[p.index as number]
            const alt = typeof p.alt === 'string' && p.alt.trim() ? p.alt.trim() : candidate.alt
            // Stock and generic imagery lands in BODY, where it illustrates
            // the text instead of posing as this shop's completed work. The
            // admin photo editor can move any photo between pools.
            const pool = String(p.pool || '').toLowerCase() === 'body' ? 'BODY' : 'GALLERY'
            return { url: candidate.url, alt: alt.slice(0, 200), pool: pool as 'GALLERY' | 'BODY' }
          })
      : []
    console.log(
      `[SiteImport] ${photoCandidates.length} photo candidates, model kept ${photos.length}`
    )

    const faq = Array.isArray(parsed.faq)
      ? (parsed.faq as Array<{ q?: unknown; a?: unknown }>)
          .filter((f) => typeof f?.q === 'string' && typeof f?.a === 'string' && f.q.trim() && f.a.trim())
          .slice(0, 12)
          .map((f) => ({ q: (f.q as string).trim().slice(0, 300), a: (f.a as string).trim().slice(0, 2000) }))
      : []

    const chapters = Array.isArray(parsed.chapters)
      ? (parsed.chapters as Array<{ heading?: unknown; body?: unknown; photoIndex?: unknown }>)
          .filter((c) => typeof c?.heading === 'string' && typeof c?.body === 'string' && c.heading.trim() && c.body.trim())
          .slice(0, 4)
          .map((c) => {
            const idx = c.photoIndex
            const photoUrl =
              typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < photoCandidates.length
                ? photoCandidates[idx].url
                : ''
            return {
              heading: (c.heading as string).trim().slice(0, 120),
              body: (c.body as string).trim().slice(0, 4000),
              photoUrl,
            }
          })
      : []

    const seenAreas = new Set<string>()
    const serviceAreas = Array.isArray(parsed.serviceAreas)
      ? (parsed.serviceAreas as unknown[])
          .filter((a): a is string => typeof a === 'string' && !!a.trim())
          .map((a) => a.trim().slice(0, 60))
          .filter((a) => {
            const key = a.toLowerCase()
            if (seenAreas.has(key)) return false
            seenAreas.add(key)
            return true
          })
          .slice(0, 10)
      : []

    const heroBullets = Array.isArray(parsed.heroBullets)
      ? (parsed.heroBullets as Array<{ lead?: unknown; text?: unknown }>)
          .filter((b) => typeof b?.lead === 'string' && b.lead.trim())
          .slice(0, 4)
          .map((b) => ({
            lead: (b.lead as string).trim().slice(0, 120),
            text: typeof b.text === 'string' ? b.text.trim().slice(0, 200) : '',
          }))
      : []

    if (pages.length === 1 && extraLinks.length > 0) {
      warnings.push('Linked pages could not be fetched — extraction used the main page only.')
    }

    return {
      ok: true,
      draft: {
        warrantyTitle: asStr(parsed.warrantyTitle, 120),
        warrantyText: asStr(parsed.warrantyText, 4000),
        faq,
        heroBullets,
        chapters,
        footerBlurb: asStr(parsed.footerBlurb, 400),
        photos,
        logoUrl,
        serviceAreas,
        pagesCrawled: pages.map((p) => p.url),
        warnings,
      },
    }
  } catch (err) {
    console.error('[SiteImport] Extraction failed:', err)
    // The real reason travels to the admin. "Try again in a minute" was
    // hiding an expired API key behind advice that could never help.
    const detail = err instanceof Error ? err.message : ''
    return {
      ok: false,
      error: detail ? `Extraction failed: ${detail}` : 'Extraction failed — try again in a minute',
    }
  }
}
