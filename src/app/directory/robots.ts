import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/directory/seo'

// Public crawl rules. Allow the whole public site, but keep internal
// operational areas (admin, partner portal, lead tooling, and API routes)
// out of the index. Points crawlers at the directory sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/portal', '/master-leads', '/api/'],
    },
    sitemap: absoluteUrl('/directory/sitemap.xml'),
  }
}
