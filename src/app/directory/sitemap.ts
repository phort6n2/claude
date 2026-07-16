import type { MetadataRoute } from 'next'
import {
  getAllShops,
  getStateSummaries,
  getCitySummaries,
  shopHref,
} from '@/lib/directory/data'

// Base URL for absolute sitemap links. Set NEXT_PUBLIC_SITE_URL in production
// (e.g. https://www.autoglassdirectory.com). Falls back to a placeholder so the
// build never fails locally.
const BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://autoglassdirectory.example'
).replace(/\/$/, '')

export default function sitemap(): MetadataRoute.Sitemap {
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

  return [...staticPages, ...statePages, ...cityPages, ...shopPages]
}
