// ============================================
// DIRECTORY — BLOG (BabyLoveGrowth pull API)
// ============================================
// BabyLoveGrowth auto-generates SEO articles; we pull them into this site so
// the blog lives at /blog on the directory domain (never a subdomain). This is
// the "BabyLoveGrowth API" integration: a REST pull model authenticated with an
// X-API-Key header.
//
//   List:   GET https://api.babylovegrowth.ai/api/integrations/v1/articles
//   Single: GET https://api.babylovegrowth.ai/api/integrations/v1/articles/:id
//
// Responses are cached (unstable_cache) so we respect their rate limits and the
// pages stay fast; ISR refreshes them on an interval. With no API key the blog
// simply reports no posts yet — nothing breaks.

import { unstable_cache } from 'next/cache'
import { SEED_POSTS } from '@/data/directory-blog'

const BASE = 'https://api.babylovegrowth.ai/api/integrations'
const TIMEOUT = 8000

export interface ArticleSummary {
  id: number
  title: string
  slug: string
  hero_image_url?: string
  languageCode?: string
  meta_description?: string
  excerpt?: string
  orgWebsite?: string
  // The API's date field name varies; we read several below.
  createdAt?: string
  created_at?: string
  publishedAt?: string
  published_at?: string
}

export interface Article extends ArticleSummary {
  content_html?: string
  content_markdown?: string
  jsonLd?: unknown
  faqJsonLd?: unknown
}

// The blog is live whenever there are hand-written seed posts OR the
// BabyLoveGrowth feed is connected.
export function blogEnabled(): boolean {
  return SEED_POSTS.length > 0 || !!process.env.BABYLOVEGROWTH_API_KEY
}

export function articleDate(a: ArticleSummary): string | undefined {
  return a.createdAt ?? a.created_at ?? a.publishedAt ?? a.published_at
}

function apiHeaders(): HeadersInit {
  return {
    'X-API-Key': process.env.BABYLOVEGROWTH_API_KEY as string,
    'Content-Type': 'application/json',
  }
}

// Optional: if one API key spans multiple sites, keep only this site's posts.
function forThisSite(list: ArticleSummary[]): ArticleSummary[] {
  const site = process.env.BABYLOVEGROWTH_ORG_WEBSITE
  if (!site) return list
  const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  return list.filter(
    (a) => !a.orgWebsite || a.orgWebsite.toLowerCase().includes(host)
  )
}

async function fetchList(): Promise<ArticleSummary[]> {
  try {
    const res = await fetch(`${BASE}/v1/articles`, {
      headers: apiHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? forThisSite(data as ArticleSummary[]) : []
  } catch {
    return []
  }
}

async function fetchArticle(id: number): Promise<Article | null> {
  try {
    const res = await fetch(`${BASE}/v1/articles/${id}`, {
      headers: apiHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return null
    return (await res.json()) as Article
  } catch {
    return null
  }
}

const cachedList = unstable_cache(fetchList, ['blg-articles-list-v1'], {
  revalidate: 3600,
})

const cachedArticle = (id: number) =>
  unstable_cache(() => fetchArticle(id), ['blg-article-v1', String(id)], {
    revalidate: 3600,
  })()

function sortByDateDesc(list: ArticleSummary[]): ArticleSummary[] {
  return [...list].sort((a, b) => {
    const da = articleDate(a) ?? ''
    const db = articleDate(b) ?? ''
    return da < db ? 1 : da > db ? -1 : 0
  })
}

/**
 * All published articles for this site (summaries only) — hand-written seed
 * posts merged with the live BabyLoveGrowth feed, newest first. If a live post
 * shares a slug with a seed, the live one wins.
 */
export async function listArticles(): Promise<ArticleSummary[]> {
  const api = process.env.BABYLOVEGROWTH_API_KEY ? await cachedList() : []
  const apiSlugs = new Set(api.map((a) => a.slug))
  const seeds = SEED_POSTS.filter((s) => !apiSlugs.has(s.slug))
  return sortByDateDesc([...api, ...seeds])
}

/** A single full article (with content_html) by its slug. */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  // Live feed takes precedence over a same-slug seed.
  if (process.env.BABYLOVEGROWTH_API_KEY) {
    const summary = (await cachedList()).find((a) => a.slug === slug)
    if (summary) return cachedArticle(summary.id)
  }
  return SEED_POSTS.find((s) => s.slug === slug) ?? null
}
