import type { MetadataRoute } from 'next'
import {
  getAllShops,
  getStateSummaries,
  getCitySummaries,
  shopHref,
} from '@/lib/directory/data'
import { listArticles } from '@/lib/directory/blog'

// Base URL for absolute sitemap links. Set NEXT_PUBLIC_SITE_URL in production
// (e.g. https://www.windshieldrepairhq.com). Falls back to the brand domain so the
// build never fails locally.
const BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://windshieldrepairhq.com'
).replace(/\/$/, '')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    '/directory',
    '/directory/search',
    '/directory/browse',
    '/directory/claim',
    '/directory/for-shops',
  ].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'weekly' as const,
    priority: path === '/directory' ? 1 : 0.7,
  }))

  const statePages = getStateSummaries().map((s) => ({
    url: `${BASE}/directory/${s.state}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const cityPages = getCitySummaries().map((c) => ({
    url: `${BASE}/directory/${c.state}/${c.citySlug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const shopPages = getAllShops().map((s) => ({
    url: `${BASE}${shopHref(s)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  const articles = await listArticles()
  const blogPages = articles.length
    ? [
        {
          url: `${BASE}/directory/blog`,
          changeFrequency: 'daily' as const,
          priority: 0.7,
        },
        ...articles.map((a) => ({
          url: `${BASE}/directory/blog/${a.slug}`,
          changeFrequency: 'monthly' as const,
          priority: 0.6,
        })),
      ]
    : []

  return [...staticPages, ...statePages, ...cityPages, ...shopPages, ...blogPages]
}
