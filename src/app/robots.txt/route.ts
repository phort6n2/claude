import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Host-aware robots.txt.
 *
 * Client sites invite crawling and point at their own sitemap. The app host
 * (admin, portal, APIs) is disallowed outright — it is a private back office,
 * not a destination.
 */
export async function GET(request: NextRequest) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase()
  const isClientSite =
    host.endsWith('.glassleads.app') && host !== 'glassleads.app' && host !== 'www.glassleads.app'

  const body = isClientSite
    ? // /api/ is back office, with one exception: the share card is an image
      // the page's own metadata points at, so it has to stay fetchable.
      `User-agent: *\nAllow: /\nAllow: /api/site-og/\nDisallow: /api/\n\nSitemap: https://${host}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' },
  })
}
