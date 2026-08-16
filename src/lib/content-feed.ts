import { prisma } from '@/lib/db'
import { validatePublicUrl } from '@/lib/site-import'

/**
 * Watch where a shop's articles actually get published, rather than
 * integrating with whoever writes them.
 *
 * The Activity feed needs to say "this went up for you". It used to get that
 * by holding an API key for the writing tool and syncing their articles into
 * our own table. Reading the shop's RSS feed instead is better on three
 * counts, and the third is the one that matters most:
 *
 * - **It survives a change of supplier.** Swap the writer and the feed keeps
 *   answering. An API integration has to be rebuilt.
 * - **It needs no credential.** Nothing to store encrypted, nothing to rotate,
 *   nothing to leak from a public repo.
 * - **It cannot name the supplier.** A feed carries a title, a link and a
 *   date. There is no field in it for whoever wrote the post, which is the
 *   white-label rule enforced by the format rather than by our own care.
 *
 * We only ever READ. Nothing here publishes, edits or deletes anything on a
 * shop's site.
 */

const FETCH_TIMEOUT_MS = 15_000
/** A feed is text. Anything much larger is not one, or is not worth parsing. */
const MAX_BYTES = 5 * 1024 * 1024
/** Per fetch. A feed with more than this is paginated and we take the newest. */
const MAX_ITEMS = 50

export interface FeedEntry {
  guid: string
  title: string
  url: string | null
  publishedAt: Date | null
}

/** Common locations, tried in order when a site advertises no feed. */
const GUESSES = [
  '/feed',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml',
  '/blog/feed',
  '/blog/rss',
  '/index.xml',
]

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    // Ampersand last, or an already-decoded entity gets decoded twice.
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * A tag's text content — the unprefixed tag first, then any namespaced one.
 *
 * Precedence matters and taking "whichever appears first" got it wrong: an
 * entry carrying both `<dc:title>` and `<title>` would be read from whichever
 * the publisher happened to put first, and `<media:title>` or `<itunes:title>`
 * could win over the real one outright. The plain tag is the post's own; a
 * prefixed one is an extension, and only worth reading when there is nothing
 * else.
 */
function tagText(xml: string, tag: string): string | null {
  const find = (prefix: string) =>
    new RegExp(`<${prefix}${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${prefix}${tag}\\s*>`, 'i').exec(xml)
  const match = find('') || find('[a-z0-9]+:')
  return match ? decodeEntities(match[1]) : null
}

/**
 * The entry's link.
 *
 * RSS puts it in `<link>` text; Atom puts it in a `href` attribute, and an
 * entry can carry several — `rel="alternate"` (or no rel at all) is the human
 * page, while `rel="edit"`/`"self"` are API endpoints nobody should be sent
 * to.
 */
function entryLink(xml: string): string | null {
  const atom = [...xml.matchAll(/<(?:[a-z0-9]+:)?link\b([^>]*)\/?>/gi)]
  for (const [, attrs] of atom) {
    const rel = /\brel\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase()
    if (rel && rel !== 'alternate') continue
    const href = /\bhref\s*=\s*["']([^"']+)/i.exec(attrs)?.[1]
    if (href) return decodeEntities(href)
  }
  const text = tagText(xml, 'link')
  return text && /^https?:/i.test(text) ? text : null
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** RSS `<item>` and Atom `<entry>`, newest first as the feed gives them. */
export function parseFeed(xml: string): FeedEntry[] {
  const blocks = [
    ...xml.matchAll(/<(?:[a-z0-9]+:)?(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9]+:)?\1\s*>/gi),
  ]
  const entries: FeedEntry[] = []
  for (const [, , inner] of blocks) {
    const title = tagText(inner, 'title')
    const url = entryLink(inner)
    // A guid is preferred but optional; the link is the fallback, and a post
    // with neither is not something we can dedup, so it is skipped rather
    // than added again on every run.
    const guid = tagText(inner, 'guid') || tagText(inner, 'id') || url
    if (!guid || !title) continue
    entries.push({
      guid,
      title,
      url,
      publishedAt:
        parseDate(tagText(inner, 'pubDate')) ??
        parseDate(tagText(inner, 'published')) ??
        parseDate(tagText(inner, 'updated')) ??
        parseDate(tagText(inner, 'date')),
    })
    if (entries.length >= MAX_ITEMS) break
  }
  return entries
}

/** Looks like a feed rather than a page that returned 200 for anything. */
function looksLikeFeed(body: string): boolean {
  return /<(?:[a-z0-9]+:)?(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000))
}

async function fetchText(url: string): Promise<string | null> {
  // Same guard every admin-supplied URL the server fetches goes through:
  // https only, no private or link-local hosts. This is exactly the SSRF
  // shape that rule exists for. Fetch the URL IT returns, not the one we were
  // handed — it upgrades http to https, and the point of a guard is lost if
  // the request goes out on the unchecked string.
  const safe = validatePublicUrl(url)
  if (!safe.ok) return null
  try {
    const res = await fetch(safe.url.toString(), {
      redirect: 'follow',
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared && declared > MAX_BYTES) return null
    const body = await res.text()
    return body.length > MAX_BYTES ? null : body
  } catch {
    return null
  }
}

/**
 * Find a site's feed: what the page advertises first, then the usual paths.
 *
 * Advertised first because it is the only one that is actually correct — a
 * guess that happens to return 200 from a catch-all route is how you end up
 * watching the wrong thing.
 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  let origin: string
  try {
    origin = new URL(siteUrl.includes('://') ? siteUrl : `https://${siteUrl}`).origin
  } catch {
    return null
  }

  const page = await fetchText(origin)
  if (page) {
    const links = [...page.matchAll(/<link\b([^>]*)>/gi)]
    for (const [, attrs] of links) {
      if (!/rel\s*=\s*["']?alternate/i.test(attrs)) continue
      if (!/type\s*=\s*["']?application\/(rss|atom)\+xml/i.test(attrs)) continue
      const href = /\bhref\s*=\s*["']([^"']+)/i.exec(attrs)?.[1]
      if (!href) continue
      try {
        // Normalised through the same guard the fetch uses, so what is
        // offered to the admin is exactly what will be requested — sites
        // routinely advertise their feed as http:// and it is upgraded.
        const resolved = new URL(decodeEntities(href), origin).toString()
        const safe = validatePublicUrl(resolved)
        if (safe.ok) return safe.url.toString()
      } catch {
        continue
      }
    }
  }

  for (const path of GUESSES) {
    const candidate = `${origin}${path}`
    const body = await fetchText(candidate)
    if (body && looksLikeFeed(body) && parseFeed(body).length > 0) return candidate
  }
  return null
}

export interface FeedCheck {
  ok: boolean
  message: string
  entries: FeedEntry[]
}

/** Read one feed without storing anything. The admin's "check" button. */
export async function checkFeed(url: string): Promise<FeedCheck> {
  const safe = validatePublicUrl(url)
  if (!safe.ok) {
    return { ok: false, message: safe.error || 'That URL cannot be fetched.', entries: [] }
  }
  const body = await fetchText(url)
  if (!body) return { ok: false, message: 'No answer from that address.', entries: [] }
  if (!looksLikeFeed(body)) {
    return {
      ok: false,
      message: 'That address answered, but with a web page rather than a feed.',
      entries: [],
    }
  }
  const entries = parseFeed(body)
  if (entries.length === 0) {
    return { ok: true, message: 'That is a feed, but it has no posts in it yet.', entries }
  }
  return {
    ok: true,
    message: `Found ${entries.length} post${entries.length === 1 ? '' : 's'}. Newest: “${entries[0].title}”.`,
    entries,
  }
}

export interface FeedSyncResult {
  ok: boolean
  message: string
  checked: number
  added: number
}

/**
 * Read every configured feed and store what is new.
 *
 * Deliberately additive. A post that disappears from the feed — feeds are
 * usually capped at the newest 10 or 20 — is NOT deleted here: it was still
 * published, and a history that shortens as it ages is not a history.
 */
export async function syncContentFeeds(clientId?: string): Promise<FeedSyncResult> {
  const clients = await prisma.client
    .findMany({
      where: {
        ...(clientId ? { id: clientId } : { status: 'ACTIVE' }),
        contentFeedUrl: { not: null },
      },
      select: { id: true, businessName: true, contentFeedUrl: true },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return {
      ok: true,
      checked: 0,
      added: 0,
      message: clientId
        ? 'No content feed set for this shop yet.'
        : 'No shops have a content feed set.',
    }
  }

  let added = 0
  const failures: string[] = []

  for (const client of clients) {
    const result = await checkFeed(client.contentFeedUrl as string)
    if (!result.ok) {
      failures.push(`${client.businessName}: ${result.message}`)
      await prisma.client
        .update({
          where: { id: client.id },
          data: { contentFeedCheckedAt: new Date(), contentFeedError: result.message },
        })
        .catch(() => {})
      continue
    }

    // Which of these we already have, so "new" is counted from the database
    // rather than inferred from an upsert's return value.
    const known = new Set(
      (
        await prisma.siteFeedItem
          .findMany({
            where: { clientId: client.id, guid: { in: result.entries.map((e) => e.guid) } },
            select: { guid: true },
          })
          .catch(() => [])
      ).map((row) => row.guid)
    )

    for (const entry of result.entries) {
      // Upsert rather than createMany+skipDuplicates: one round trip more,
      // but a headline the shop corrected after publishing follows through
      // instead of being silently skipped.
      const stored = await prisma.siteFeedItem
        .upsert({
          where: { clientId_guid: { clientId: client.id, guid: entry.guid } },
          create: {
            clientId: client.id,
            guid: entry.guid,
            title: entry.title,
            url: entry.url,
            publishedAt: entry.publishedAt,
          },
          update: { title: entry.title, url: entry.url, publishedAt: entry.publishedAt },
        })
        .catch(() => null)
      if (stored && !known.has(entry.guid)) added++
    }

    await prisma.client
      .update({
        where: { id: client.id },
        data: { contentFeedCheckedAt: new Date(), contentFeedError: null },
      })
      .catch(() => {})
  }

  const parts = [`${clients.length} feed${clients.length === 1 ? '' : 's'} checked`]
  if (added) parts.push(`${added} new post${added === 1 ? '' : 's'}`)
  if (failures.length) parts.push(`could not read: ${failures.join('; ')}`)

  return {
    ok: failures.length === 0,
    checked: clients.length,
    added,
    message: parts.join(', ') + '.',
  }
}
