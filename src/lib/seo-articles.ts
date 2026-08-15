import { prisma } from '@/lib/db'
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
 * Two things have to be true before an article appears anywhere: it must be
 * matched to a shop, and it must survive the content scan. Neither is a
 * formality. An article that cannot be matched is held rather than guessed
 * at, because putting one shop's content on another's site is worse than
 * publishing nothing; an article that trips the scan is held rather than
 * rewritten, because a claim about a real business is a human's call.
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

/**
 * Pull everything, store what is new, publish what is clean.
 *
 * Bodies are fetched only for articles whose content we do not already have —
 * the list endpoint returns summaries, so a full re-sync of an account with a
 * hundred articles would otherwise be a hundred extra requests against a rate
 * limit for content that has not changed.
 */
export async function syncSeoArticles(): Promise<SyncResult> {
  const empty = { fetched: 0, created: 0, updated: 0, published: 0, held: 0, unmatched: 0 }

  const apiKey = await getApiKey()
  if (!apiKey) {
    return {
      ok: false,
      message: 'No BabyLoveGrowth API key saved in Settings → API keys.',
      ...empty,
    }
  }

  let summaries: BlgArticleSummary[]
  try {
    summaries = await listAllArticles(apiKey)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not reach BabyLoveGrowth',
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
    .findMany({ select: { externalId: true, contentHtml: true, publishedAt: true } })
    .catch(() => [])
  const stored = new Map(existing.map((a) => [a.externalId, a]))

  let created = 0
  let updated = 0
  let published = 0
  let held = 0
  let unmatched = 0

  for (const summary of summaries) {
    const externalId = String(summary.id)
    if (!externalId) continue

    const known = stored.get(externalId)
    const needsBody = !known?.contentHtml

    let full = summary as Awaited<ReturnType<typeof getArticle>>
    if (needsBody) {
      try {
        full = await getArticle(externalId, apiKey)
      } catch (error) {
        console.warn(
          `[SEO] could not fetch article ${externalId}:`,
          error instanceof Error ? error.message : error
        )
        continue
      }
    }

    const clientId = index.get(hostOf(full.orgWebsite) || '') || null
    if (!clientId) unmatched++

    const findings = reviewArticle({
      title: full.title,
      excerpt: full.excerpt,
      metaDescription: full.meta_description,
      contentHtml: full.content_html,
      contentMarkdown: full.content_markdown,
    })
    const flags = flagsFrom(findings)

    // Clean and matched goes live. Anything else waits in the admin queue.
    // An article already published stays published: unpublishing under a
    // shop is a decision, not a side effect of a re-scan.
    const publishable = clientId !== null && flags.length === 0
    const publishedAt = known?.publishedAt ?? (publishable ? new Date() : null)
    if (publishedAt) published++
    else held++

    const data = {
      clientId,
      title: full.title || 'Untitled',
      slug: (full.slug && slugify(full.slug)) || slugify(full.title || externalId),
      excerpt: full.excerpt || null,
      metaDescription: full.meta_description || null,
      heroImageUrl: full.hero_image_url || null,
      languageCode: full.languageCode || null,
      orgWebsite: full.orgWebsite || null,
      seedKeyword: full.seedKeyword || null,
      keywords: Array.isArray(full.keywords) ? full.keywords.filter((k) => typeof k === 'string') : [],
      reviewFlags: flags,
      publishedAt,
      authoredAt: full.created_at ? new Date(full.created_at) : null,
      syncedAt: new Date(),
      // Only overwrite a body we actually fetched — a summary-only pass must
      // not blank the content of an article we already have in full.
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

  const parts = [`${summaries.length} fetched`, `${created} new`, `${updated} updated`]
  if (held) parts.push(`${held} held for review`)
  if (unmatched) parts.push(`${unmatched} not matched to a shop`)

  return {
    ok: true,
    message: parts.join(' · '),
    fetched: summaries.length,
    created,
    updated,
    published,
    held,
    unmatched,
  }
}
