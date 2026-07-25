// ============================================
// DIRECTORY — SHOP BLOG FEED (RSS / ATOM)
// ============================================
// If an owner has a blog on their own site, we can surface their latest posts
// on their listing — fresh content that keeps the page useful and gives the
// shop a reason to keep their listing rich. The owner pastes their blog or feed
// URL on the dashboard; we discover the feed (if they gave a page), fetch, parse
// and cache it. Everything is best-effort and fails closed to an empty list, so
// a slow or missing feed never affects the listing page.
//
// Cached per shop (unstable_cache) so the ISR shop page stays static-compatible
// and we hit each external feed at most a few times a day.

import { unstable_cache } from 'next/cache'

export interface BlogPost {
  title: string
  link: string
  date?: string
}

const MAX_POSTS = 3
const FETCH_TIMEOUT = 6000
const MAX_BYTES = 1_500_000

function isHttp(u: string): boolean {
  return /^https?:\/\//i.test(u)
}

async function fetchText(url: string): Promise<string | null> {
  if (!isHttp(url)) return null
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { 'user-agent': 'WindshieldRepairHQ-FeedBot/1.0 (+https://windshieldrepairhq.com)' },
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) return new TextDecoder().decode(buf.slice(0, MAX_BYTES))
    return new TextDecoder().decode(buf)
  } catch {
    return null
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '') // strip any stray tags in titles
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim()
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : null
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

/** Parse an RSS 2.0 or Atom feed into a few recent posts. Regex-based (no dep). */
function parseFeed(xml: string, base: string): BlogPost[] {
  const posts: BlogPost[] = []
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml)
  const blockRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi
  const blocks = xml.match(blockRe) ?? []

  for (const block of blocks) {
    const rawTitle = tag(block, 'title')
    if (!rawTitle) continue
    const title = decodeEntities(rawTitle)
    if (!title) continue

    let link: string | null = null
    if (isAtom) {
      // Prefer <link rel="alternate" href> then any <link href>.
      const alt =
        block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i) ||
        block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)
      link = alt ? alt[1] : null
    } else {
      link = tag(block, 'link')
      if (link) link = decodeEntities(link)
    }
    if (!link) continue
    const abs = resolveUrl(link, base)
    if (!abs || !isHttp(abs)) continue

    const date =
      tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || undefined

    posts.push({ title, link: abs, date: date ? decodeEntities(date) : undefined })
    if (posts.length >= MAX_POSTS) break
  }
  return posts
}

/** Find a feed URL from a page's <link rel="alternate"> or common paths. */
async function discoverFeed(pageUrl: string): Promise<string | null> {
  const html = await fetchText(pageUrl)
  if (html) {
    const m = html.match(
      /<link[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi
    )
    if (m) {
      for (const linkTag of m) {
        const href = linkTag.match(/href=["']([^"']+)["']/i)?.[1]
        const abs = href ? resolveUrl(href, pageUrl) : null
        if (abs) return abs
      }
    }
  }
  // Common fallback paths.
  try {
    const origin = new URL(pageUrl).origin
    for (const path of ['/feed', '/rss', '/feed.xml', '/rss.xml', '/blog/feed', '/atom.xml']) {
      const guess = origin + path
      const txt = await fetchText(guess)
      if (txt && /<(rss|feed)[\s>]/i.test(txt)) return guess
    }
  } catch {
    /* bad url */
  }
  return null
}

async function loadPosts(url: string): Promise<BlogPost[]> {
  const first = await fetchText(url)
  // If the given URL is already a feed, parse it directly.
  if (first && /<(rss|feed)[\s>]/i.test(first)) {
    return parseFeed(first, url)
  }
  // Otherwise treat it as a page and discover the feed.
  const feedUrl = await discoverFeed(url)
  if (!feedUrl) return []
  const xml = await fetchText(feedUrl)
  return xml ? parseFeed(xml, feedUrl) : []
}

/**
 * Latest posts for a shop's blog, cached per slug. Returns [] when no URL is
 * configured or nothing can be parsed — callers just render nothing.
 */
export function getShopPosts(slug: string, blogUrl?: string): Promise<BlogPost[]> {
  if (!blogUrl || !isHttp(blogUrl)) return Promise.resolve([])
  return unstable_cache(() => loadPosts(blogUrl), ['directory-feed-v1', slug, blogUrl], {
    revalidate: 21600, // 6h
    tags: ['directory-feed'],
  })()
}
