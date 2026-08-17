import { validatePublicUrl } from '@/lib/site-import'

/**
 * Lift one page off a shop's old site so it can keep answering on its own
 * address after the cutover.
 *
 * Only for pages worth keeping — a regional page that ranks, an
 * insurance-claims explainer. Everything else should redirect, and the parity
 * report is what decides which is which.
 *
 * DELIBERATELY CRUDE ABOUT THE BODY. This pulls the main text and throws away
 * the chrome; it does not try to reproduce a layout. The page is re-rendered
 * in the hosted site's own shell, so a faithful copy of somebody else's
 * markup would be the wrong output even if it were achievable — what carries
 * over is the words and the address, not the design.
 *
 * Nothing captured here is published automatically. It is somebody else's
 * copy about a real business, it can contain claims this platform would not
 * make on a shop's behalf, and it wants reading before it serves.
 */

const FETCH_TIMEOUT_MS = 20_000
const MAX_BYTES = 3 * 1024 * 1024

export interface CapturedPage {
  ok: boolean
  message: string
  title?: string
  metaDescription?: string
  bodyHtml?: string
}

/** Strip a tag and everything inside it. */
function dropBlock(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '')
}

const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
}

/**
 * Entities to characters, NUMERIC ONES INCLUDED.
 *
 * Only the named handful used to be decoded, and a WordPress title came back
 * as "WordPress News &#8211; the latest…". These strings go into a page title
 * and a meta description as TEXT — React escapes them on the way out, so an
 * entity left undecoded here is not rendered as a dash, it is rendered as the
 * literal characters `&#8211;` in the browser tab.
 */
function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The part of the page that is actually the page.
 *
 * `<main>` and `<article>` are the honest answers when present. Failing that,
 * the largest block of paragraph text wins — a header, nav and footer are
 * mostly links, so the block with the most prose in it is the content on
 * essentially every site built in the last fifteen years.
 */
function extractBody(html: string): string {
  let doc = html
  for (const tag of ['script', 'style', 'noscript', 'svg', 'header', 'nav', 'footer', 'form', 'iframe']) {
    doc = dropBlock(doc, tag)
  }

  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(doc)
  let region = main ? main[2] : doc

  // No <main>: take the container holding the most paragraph text.
  if (!main) {
    const blocks = [...region.matchAll(/<(section|div)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
    let best = ''
    for (const [, , inner] of blocks) {
      const prose = (inner.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).join('')
      if (prose.length > best.length) best = inner
    }
    if (best) region = best
  }

  // Keep only the elements that carry meaning. The sanitiser at render time
  // is the security boundary; this is about not importing a wall of divs.
  const kept: string[] = []
  const pattern = /<(h2|h3|h4|p|ul|ol|blockquote)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(region))) {
    const [, tag, inner] = match
    const text = decode(inner.replace(/<[^>]+>/g, ' '))
    // A "paragraph" of two words is a caption or a stray label. A list gets a
    // lower bar because a list of short items is legitimate — but it still
    // has to have WORDS in it. Lists used to be exempt from the check
    // entirely, and a WordPress index page captured as forty empty
    // `<ul><li class="wp-block-post …"></li></ul>` shells: the post titles sat
    // inside each item's own `<header>`, which the chrome strip above had
    // already taken out. Forty empty lists reads as a captured page; nothing
    // captured reads as "redirect this instead", which is the true answer for
    // a listing page.
    const floor = /^(ul|ol)$/i.test(tag) ? 12 : 25
    if (text.length < floor) continue
    kept.push(`<${tag}>${inner.trim()}</${tag}>`)
    if (kept.length >= 60) break
  }
  return kept.join('\n')
}

export async function capturePage(pageUrl: string): Promise<CapturedPage> {
  const safe = validatePublicUrl(pageUrl)
  if (!safe.ok) return { ok: false, message: safe.error || 'That URL cannot be fetched.' }

  let html: string
  try {
    const res = await fetch(safe.url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, message: `That page answered ${res.status}.` }
    const body = await res.text()
    html = body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body
  } catch {
    return { ok: false, message: 'Could not reach that page.' }
  }

  const title =
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') ||
    decode(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '')
  const metaDescription = decode(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] || ''
  )
  const bodyHtml = extractBody(html)

  if (!bodyHtml) {
    return {
      ok: false,
      message: 'Found the page but no readable content on it — worth a redirect instead.',
      title: title || undefined,
      metaDescription: metaDescription || undefined,
    }
  }

  return {
    ok: true,
    title: title || undefined,
    metaDescription: metaDescription || undefined,
    bodyHtml,
    message: `Captured "${title || 'untitled'}" — ${bodyHtml.split('\n').length} blocks. Read it before publishing.`,
  }
}
