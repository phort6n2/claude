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
  footerBlurb: string | null
  photos: ImportedPhoto[]
  logoUrl: string | null
  pagesCrawled: string[]
  warnings: string[]
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 600_000
const MAX_EXTRA_PAGES = 4
const MAX_TEXT_PER_PAGE = 14_000
const MAX_PHOTO_CANDIDATES = 24

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

async function fetchHtml(url: URL): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GlassLeadsImporter/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    // Redirects are followed — re-check the landing host against the guard.
    const finalCheck = validatePublicUrl(res.url || url.toString())
    if (!finalCheck.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!type.includes('html')) return null
    const text = await res.text()
    return text.slice(0, MAX_PAGE_BYTES)
  } catch {
    return null
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
 * The site's logo: first <img> whose filename/alt/class says "logo"
 * (mechanical — the logo is excluded from photo candidates by the same
 * keyword, so the two never overlap), falling back to og:image.
 */
export function findLogo(html: string, base: URL): string | null {
  const re = /<img[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const tag = m[0]
    if (!/logo/i.test(tag)) continue
    const src = /(?:data-src|src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (!src || src.startsWith('data:')) continue
    try {
      const abs = new URL(src, base)
      if (abs.protocol === 'https:') return abs.toString()
    } catch {
      /* keep scanning */
    }
  }
  const og = /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i.exec(html)
    || /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/i.exec(html)
  if (og) {
    try {
      const abs = new URL(og[1], base)
      if (abs.protocol === 'https:') return abs.toString()
    } catch {
      /* fall through */
    }
  }
  return null
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
    const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || ''
    out.set(abs.toString(), { url: abs.toString(), alt: alt.trim().slice(0, 200) })
  }
  return [...out.values()]
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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not configured' }

  const mainHtml = await fetchHtml(check.url)
  if (!mainHtml) {
    return { ok: false, error: 'Could not fetch that page (not reachable, not HTML, or too slow)' }
  }

  const warnings: string[] = []
  const logoUrl = findLogo(mainHtml, check.url)
  const pages: Array<{ url: string; text: string }> = [
    { url: check.url.toString(), text: htmlToText(mainHtml) },
  ]
  const photoMap = new Map<string, { url: string; alt: string }>()
  for (const p of findPhotoCandidates(mainHtml, check.url)) photoMap.set(p.url, p)

  const extraLinks = findContentLinks(mainHtml, check.url)
  const extraPages = await Promise.all(
    extraLinks.map(async (link) => {
      const html = await fetchHtml(link)
      return html ? { link, html } : null
    })
  )
  for (const extra of extraPages) {
    if (!extra) continue
    pages.push({ url: extra.link.toString(), text: htmlToText(extra.html) })
    for (const p of findPhotoCandidates(extra.html, extra.link)) {
      if (photoMap.size < MAX_PHOTO_CANDIDATES) photoMap.set(p.url, p)
    }
  }

  const photoCandidates = [...photoMap.values()]
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
  "photos": [{"index": number, "alt": string}] // pick from the NUMBERED candidate list below BY INDEX: keep only ones whose URL/alt suggest real photos of this business or its work (vehicles, glass jobs, shop, team). Drop stock-looking, decorative, or unrelated images. Write a short factual alt from the filename/alt given — do not invent specifics. Max 12.
}

CANDIDATE PHOTOS (refer to these by index):
${photoCandidates.length ? photoCandidates.map((p, i) => `[${i}] ${p.url}${p.alt ? ` (alt: ${p.alt})` : ''}`).join('\n') : '(none found)'}

SITE PAGES:
${pages.map((p) => `=== ${p.url} ===\n${p.text}`).join('\n\n')}`

  try {
    const anthropic = new Anthropic({ apiKey })
    // Long input → stream to avoid request timeouts; we only need the final message.
    const message = await anthropic.messages
      .stream({
        model: 'claude-opus-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      })
      .finalMessage()

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
      ? (parsed.photos as Array<{ index?: unknown; alt?: unknown }>)
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
            return { url: candidate.url, alt: alt.slice(0, 200), pool: 'GALLERY' as const }
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
        footerBlurb: asStr(parsed.footerBlurb, 400),
        photos,
        logoUrl,
        pagesCrawled: pages.map((p) => p.url),
        warnings,
      },
    }
  } catch (err) {
    console.error('[SiteImport] Extraction failed:', err)
    return { ok: false, error: 'Extraction failed — try again in a minute' }
  }
}
