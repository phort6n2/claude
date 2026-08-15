/**
 * Reduce third-party HTML to a set of tags that cannot execute anything.
 *
 * Syndicated articles are written by a vendor and rendered on a shop's own
 * domain, under their brand, next to their quote form. Anything scriptable in
 * that HTML runs with the site's origin — it could read the form, rewrite the
 * phone number, or point the CTA somewhere else. The vendor is not hostile;
 * the point is that the shop's site should not depend on that staying true,
 * or on the vendor's own inputs being clean.
 *
 * Allow-list, never deny-list. A deny-list is a bet that you thought of every
 * tag, and the one nobody thinks of is the one that matters.
 *
 * Sanitised at render rather than at sync so a fix here applies to every
 * article already stored, without re-pulling anything.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div', 'section', 'article',
])

/** Per-tag attribute allow-list. Everything else is dropped, `on*` included. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
}

/** Content is dropped wholesale, not just the tags. */
const VOID_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi
const VOID_SELF_CLOSING = /<(script|style|iframe|object|embed|noscript|template|svg|math|link|meta|base|form|input|button|select|textarea)\b[^>]*\/?>/gi

const SELF_CLOSING = new Set(['br', 'hr', 'img'])

function safeUrl(value: string, allowData: boolean): string | null {
  const trimmed = value.trim()
  // A scheme-relative or relative URL is fine; an explicit scheme must be one
  // that cannot execute. `javascript:` and `vbscript:` are the whole reason
  // this function exists.
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed
  if (allowData && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return trimmed
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Rebuild one tag from only what is allowed on it. */
function cleanTag(raw: string, tag: string, attrsRaw: string, closing: boolean): string {
  if (!ALLOWED_TAGS.has(tag)) return ''
  if (closing) return `</${tag}>`

  const allowed = ALLOWED_ATTRS[tag]
  const kept: string[] = []

  if (allowed) {
    const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
    let match: RegExpExecArray | null
    while ((match = attrPattern.exec(attrsRaw))) {
      const name = match[1].toLowerCase()
      if (!allowed.has(name)) continue
      const value = match[2] ?? match[3] ?? match[4] ?? ''
      if (name === 'href' || name === 'src') {
        const url = safeUrl(value, name === 'src')
        if (!url) continue
        kept.push(`${name}="${escapeAttr(url)}"`)
        continue
      }
      kept.push(`${name}="${escapeAttr(value)}"`)
    }
  }

  // Every outbound link leaves the shop's site, so none of them may hand the
  // destination a window reference back.
  if (tag === 'a') {
    // A link whose href was rejected keeps its tag but loses the href: the
    // text stays readable and the element is inert, where dropping the open
    // tag would leave its </a> orphaned in the output.
    if (kept.some((a) => a.startsWith('href='))) {
      kept.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
    }
  }
  if (tag === 'img') {
    if (!kept.some((a) => a.startsWith('src='))) return ''
    if (!kept.some((a) => a.startsWith('loading='))) kept.push('loading="lazy"')
    if (!kept.some((a) => a.startsWith('alt='))) kept.push('alt=""')
  }

  const body = kept.length ? ` ${kept.join(' ')}` : ''
  return SELF_CLOSING.has(tag) ? `<${tag}${body} />` : `<${tag}${body}>`
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  return (
    html
      .replace(VOID_CONTENT, '')
      .replace(VOID_SELF_CLOSING, '')
      // Comments can hide conditional markup, and nothing needs them.
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\/?>/g, (raw, slash, tag, attrs) =>
        cleanTag(raw, String(tag).toLowerCase(), String(attrs || ''), !!slash)
      )
      // Any surviving angle bracket is text, not markup.
      .replace(/<(?![a-zA-Z/])/g, '&lt;')
      .trim()
  )
}

/** First N characters of the visible text, for a list excerpt. */
export function plainExcerpt(html: string | null | undefined, length = 180): string {
  if (!html) return ''
  const text = html
    .replace(VOID_CONTENT, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text
}
