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

export function blogEnabled(): boolean {
  return !!process.env.BABYLOVEGROWTH_API_KEY
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

/** All published articles for this site (summaries only). */
export async function listArticles(): Promise<ArticleSummary[]> {
  if (!blogEnabled()) return []
  return cachedList()
}

/** A single full article (with content_html) by its slug. */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  if (!blogEnabled()) return null
  const summary = (await cachedList()).find((a) => a.slug === slug)
  if (!summary) return null
  return cachedArticle(summary.id)
}
