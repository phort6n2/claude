import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import {
  getApiKey,
  getArticle,
  listAllArticles,
  type BlgArticleSummary,
} from '@/lib/baby-love-growth'
import { flagsFrom, reviewArticle } from '@/lib/seo-article-review'

/**
 * Sync BabyLoveGrowth's articles into our own table and decide which are
 * allowed onto a shop's site.
 *
 * Each shop is normally its own BabyLoveGrowth organisation with its own key,
 * held on the client record. That is the reliable arrangement: the key itself
 * says which shop an article belongs to, so there is nothing to match and
 * nothing to get wrong. An account-wide key still works — its articles are
 * matched by the website they were written for — but that path can leave an
 * article unplaced, and an unplaced article is held rather than guessed at,
 * because publishing one shop's content under another's name is worse than
 * publishing nothing.
 *
 * The second gate is the content scan. It holds rather than rewrites: a claim
 * about a real business is a human's call.
 */

/** Bare lowercase host, no scheme, no www, no path. */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value.trim().toLowerCase()
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return url.hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

interface MatchableClient {
  id: string
  slug: string
  siteSubdomain: string | null
  websiteUrl: string | null
  domains: Array<{ domain: string }>
}

/**
 * Every host that identifies a shop, so an article written for their old
 * site, their custom domain or their hosted subdomain all land on the same
 * client.
 */
function hostsFor(client: MatchableClient): string[] {
  const hosts = [
    ...client.domains.map((d) => hostOf(d.domain)),
    hostOf(client.websiteUrl),
    `${client.siteSubdomain || client.slug}.glassleads.app`,
  ]
  return [...new Set(hosts.filter((h): h is string => !!h))]
}

export function buildHostIndex(clients: MatchableClient[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const client of clients) {
    for (const host of hostsFor(client)) {
      // First writer wins. Two clients claiming one host is a data problem
      // to fix in the admin, not something to resolve silently here.
      if (!index.has(host)) index.set(host, client.id)
    }
  }
  return index
}

/** URL-safe slug, used when the provider sends none. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'article'
  )
}

export interface SyncResult {
  ok: boolean
  message: string
  fetched: number
  created: number
  updated: number
  published: number
  held: number
  unmatched: number
}

/** One key to pull with, and the shop it belongs to when it belongs to one. */
interface Source {
  apiKey: string
  clientId: string | null
  label: string
}

async function sourcesFor(clientId?: string): Promise<Source[]> {
  const clients = await prisma.client
    .findMany({
      where: {
        status: 'ACTIVE',
        seoContentEnabled: true,
        blgApiKey: { not: null },
        ...(clientId ? { id: clientId } : {}),
      },
      select: { id: true, businessName: true, blgApiKey: true },
    })
    .catch(() => [])

  const sources: Source[] = []
  for (const client of clients) {
    const apiKey = decrypt(client.blgApiKey || '')
    if (!apiKey) {
      console.warn(`[SEO] ${client.businessName} has a key that could not be decrypted`)
      continue
    }
    sources.push({ apiKey, clientId: client.id, label: client.businessName })
  }

  // The account-wide key covers a single BabyLoveGrowth account holding
  // several organisations. Skipped when syncing one client on demand.
  if (!clientId) {
    const shared = await getApiKey()
    if (shared && !sources.some((s) => s.apiKey === shared)) {
      sources.push({ apiKey: shared, clientId: null, label: 'account-wide key' })
    }
  }

  return sources
}

/**
 * Pull everything, store what is new, publish what is clean.
 *
 * Bodies are fetched only for articles whose content we do not already have —
 * the list endpoint returns summaries, so a full re-sync of an account with a
 * hundred articles would otherwise be a hundred extra requests against a rate
 * limit for content that has not changed.
 */
export async function syncSeoArticles(clientId?: string): Promise<SyncResult> {
  const empty = { fetched: 0, created: 0, updated: 0, published: 0, held: 0, unmatched: 0 }

  const sources = await sourcesFor(clientId)
  if (sources.length === 0) {
    return {
      ok: false,
      message: clientId
        ? 'No BabyLoveGrowth key on this client, or SEO content is switched off for them.'
        : 'No BabyLoveGrowth keys configured — add one per client on their SEO tab, or an account-wide key in Settings → API keys.',
      ...empty,
    }
  }

  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      websiteUrl: true,
      domains: { select: { domain: true } },
    },
  })
  const index = buildHostIndex(clients)

  const existing = await prisma.seoArticle
    .findMany({ select: { externalId: true, contentHtml: true, publishedAt: true, clientId: true } })
    .catch(() => [])
  const stored = new Map(existing.map((a) => [a.externalId, a]))

  let fetched = 0
  let created = 0
  let updated = 0
  let published = 0
  let held = 0
  let unmatched = 0
  const failures: string[] = []

  for (const source of sources) {
    let summaries: BlgArticleSummary[]
    try {
      summaries = await listAllArticles(source.apiKey)
    } catch (error) {
      // One shop's bad key must not stop every other shop's sync.
      const message = error instanceof Error ? error.message : 'request failed'
      console.warn(`[SEO] ${source.label}: ${message}`)
      failures.push(`${source.label} (${message})`)
      continue
    }
    fetched += summaries.length

    for (const summary of summaries) {
      const externalId = String(summary.id)
      if (!externalId) continue

      const known = stored.get(externalId)

      // Their article ids look account-independent, but "look" is not a
      // guarantee — and an id collision across two accounts would silently
      // move one shop's article onto another's site. Refuse instead.
      if (known && known.clientId && source.clientId && known.clientId !== source.clientId) {
        console.warn(
          `[SEO] article ${externalId} is already stored for a different client; skipping ${source.label}`
        )
        continue
      }

      const needsBody = !known?.contentHtml
      let full = summary as Awaited<ReturnType<typeof getArticle>>
      if (needsBody) {
        try {
          full = await getArticle(externalId, source.apiKey)
        } catch (error) {
          console.warn(
            `[SEO] could not fetch article ${externalId}:`,
            error instanceof Error ? error.message : error
          )
          continue
        }
      }

      // A per-client key is the answer on its own. Only the account-wide key
      // has to work out which shop an article belongs to.
      const owner = source.clientId || index.get(hostOf(full.orgWebsite) || '') || null
      if (!owner) unmatched++

      const findings = reviewArticle({
        title: full.title,
        excerpt: full.excerpt,
        metaDescription: full.meta_description,
        contentHtml: full.content_html,
        contentMarkdown: full.content_markdown,
      })
      const flags = flagsFrom(findings)

      // Clean and placed goes live. Anything else waits in the admin queue.
      // An article already published stays published: taking one down under
      // a shop is a decision, not a side effect of a re-scan.
      const publishable = owner !== null && flags.length === 0
      const publishedAt = known?.publishedAt ?? (publishable ? new Date() : null)
      if (publishedAt) published++
      else held++

      const data = {
        clientId: owner,
        title: full.title || 'Untitled',
        slug: (full.slug && slugify(full.slug)) || slugify(full.title || externalId),
        excerpt: full.excerpt || null,
        metaDescription: full.meta_description || null,
        heroImageUrl: full.hero_image_url || null,
        languageCode: full.languageCode || null,
        orgWebsite: full.orgWebsite || null,
        seedKeyword: full.seedKeyword || null,
        keywords: Array.isArray(full.keywords)
          ? full.keywords.filter((k) => typeof k === 'string')
          : [],
        reviewFlags: flags,
        publishedAt,
        authoredAt: full.created_at ? new Date(full.created_at) : null,
        syncedAt: new Date(),
        // Only overwrite a body we actually fetched — a summary-only pass
        // must not blank the content of an article we already have in full.
        ...(needsBody
          ? {
              contentHtml: full.content_html || null,
              contentMarkdown: full.content_markdown || null,
              jsonLd: (full.jsonLd as object) ?? undefined,
              faqJsonLd: (full.faqJsonLd as object) ?? undefined,
            }
          : {}),
      }

      try {
        await prisma.seoArticle.upsert({
          where: { externalId },
          update: data,
          create: { externalId, ...data },
        })
        if (known) updated++
        else created++
      } catch (error) {
        console.error(`[SEO] failed to store article ${externalId}:`, error)
      }
    }
  }

  const parts = [`${fetched} fetched`, `${created} new`, `${updated} updated`]
  if (held) parts.push(`${held} held for review`)
  if (unmatched) parts.push(`${unmatched} not matched to a shop`)
  if (failures.length) parts.push(`failed: ${failures.join('; ')}`)

  return {
    ok: failures.length === 0,
    message: parts.join(' · '),
    fetched,
    created,
    updated,
    published,
    held,
    unmatched,
  }
}
