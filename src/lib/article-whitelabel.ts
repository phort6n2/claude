/**
 * Keep the vendors that produce syndicated content out of what a client and
 * their customers can see.
 *
 * The shops pay this platform. Which content writer or scheduler sits behind
 * it is a supplier relationship, and a supplier's name on a shop's own page is
 * an invitation to go straight to the supplier. No UI string names them — but
 * the strings were never the leak. Three things carry a vendor's identity onto
 * a page nobody wrote:
 *
 * - **Images.** A hero or in-body image left on the vendor's CDN puts their
 *   host in the page source, the network tab, and the og:image that gets
 *   shared. Handled at SYNC by copying every remote image onto our own
 *   storage — the same treatment imported site photos already get, and for
 *   the same reasons plus this one.
 * - **JSON-LD.** Their schema block is passed through as data, and `author`,
 *   `publisher` and friends in it can name the vendor. That is machine
 *   readable, indexed, and invisible in the rendered page — the worst
 *   combination. Scrubbed at RENDER, so it fixes rows already stored.
 * - **Links in the body.** A backlink to the vendor survives sanitising,
 *   because the sanitiser's job is "can this execute", not "who is this".
 *   Also stripped at render.
 *
 * Render-time rather than sync-time for the last two on purpose: a fix here
 * applies to every article already in the table without re-pulling anything,
 * which is the same reasoning the HTML sanitiser is built on.
 */

/**
 * Hosts belonging to a content or scheduling vendor. Add to this when a
 * vendor is added, and add EVERY host they serve from — a link is only
 * stripped if its host is listed or is a subdomain of one.
 */
export const VENDOR_HOSTS = [
  'babylovegrowth.ai',
  'robinreach.com',
] as const

/** True for the host itself and any subdomain of it. */
export function isVendorHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return VENDOR_HOSTS.some((vendor) => h === vendor || h.endsWith(`.${vendor}`))
}

/** True when a URL string points at a vendor. Unparseable URLs are not. */
export function isVendorUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    return isVendorHost(new URL(value, 'https://placeholder.invalid').hostname)
  } catch {
    return false
  }
}

/**
 * Drop the href from any link pointing at a vendor, keeping the text.
 *
 * Run BEFORE `sanitizeHtml`, which already handles an `<a>` with no href —
 * it keeps the tag so the closing tag is not orphaned, and the element ends
 * up inert. Removing the whole element here would strip the sentence around
 * it, and the sentence is the shop's content.
 */
export function stripVendorLinks(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(
    /<a\b([^>]*)>/gi,
    (tag, attrs: string) => {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs)
      const value = href?.[1] ?? href?.[2] ?? href?.[3]
      if (!value || !isVendorUrl(value)) return tag
      return `<a${attrs.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/i, '')}>`
    }
  )
}

/** Keys in schema.org markup that name whoever produced the content. */
const ATTRIBUTION_KEYS = new Set([
  'author',
  'publisher',
  'creator',
  'provider',
  'copyrightHolder',
  'sourceOrganization',
  'producer',
  'editor',
])

/**
 * Rewrite a schema.org block so it credits the shop, and mentions no vendor.
 *
 * Attribution keys are REPLACED rather than removed: an Article with no
 * publisher is a slightly worse rich result, and the shop is the honest
 * answer anyway — the article is published on their site, under their name,
 * and they are the ones responsible for what it says. Anything else pointing
 * at a vendor host is dropped, since there is nothing true to put in its
 * place.
 */
export function scrubJsonLd(
  value: unknown,
  shop: { businessName: string; host: string }
): unknown {
  const organisation = {
    '@type': 'Organization',
    name: shop.businessName,
    url: `https://${shop.host}`,
  }

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== 'object') return node

    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (ATTRIBUTION_KEYS.has(key)) {
        out[key] = organisation
        continue
      }
      // A bare vendor URL anywhere else — @id, url, sameAs, image, logo.
      if (isVendorUrl(val)) continue
      if (Array.isArray(val)) {
        const kept = val.filter((v) => !isVendorUrl(v)).map(walk)
        if (kept.length) out[key] = kept
        continue
      }
      out[key] = walk(val)
    }
    return out
  }

  return walk(value)
}

/**
 * Every `<img src>` in a body, so the sync can copy them onto our storage.
 *
 * Returns the URLs in document order; `replaceImageSources` puts the results
 * back. Two passes rather than one so the fetching can be batched.
 */
export function collectImageSources(html: string | null | undefined): string[] {
  if (!html) return []
  const found: string[] = []
  const pattern = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    const url = match[1] ?? match[2] ?? match[3]
    if (url && /^https?:/i.test(url)) found.push(url)
  }
  return [...new Set(found)]
}

/** Swap every occurrence of the mapped source URLs for their new home. */
export function replaceImageSources(
  html: string | null | undefined,
  mapping: Map<string, string>
): string | null {
  if (!html) return html ?? null
  if (mapping.size === 0) return html
  let out = html
  for (const [from, to] of mapping) {
    out = out.split(from).join(to)
  }
  return out
}
