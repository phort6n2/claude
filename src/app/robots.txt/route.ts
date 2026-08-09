import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { canonicalHostFor } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

/**
 * Host-aware robots.txt.
 *
 * The app host (admin, portal, APIs) is disallowed outright — a private back
 * office, not a destination.
 *
 * A client host invites crawling. When it is the canonical host it also
 * advertises its sitemap. When it is NOT — the platform subdomain once a
 * custom domain is live — it stays crawlable and simply stops advertising a
 * sitemap.
 *
 * It deliberately does NOT Disallow the non-canonical host. Blocking the
 * crawl would stop the crawler ever fetching the page, and therefore ever
 * seeing the noindex the page carries, leaving the duplicates indexed
 * indefinitely. Crawlable-and-noindex is the combination that actually
 * removes them.
 */
async function clientForHost(host: string) {
  const label = host.endsWith('.glassleads.app')
    ? host.slice(0, -'.glassleads.app'.length)
    : null

  try {
    return await prisma.client.findFirst({
      where: label
        ? { OR: [{ slug: label }, { siteSubdomain: label }] }
        : { domains: { some: { domain: host } } },
      select: {
        slug: true,
        siteSubdomain: true,
        domains: {
          where: { isPrimary: true },
          select: { domain: true, verified: true, misconfigured: true },
          take: 1,
        },
      },
    })
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase()
  const isAppHost = host === 'glassleads.app' || host === 'www.glassleads.app' || !host.includes('.')

  if (isAppHost) {
    return text(`User-agent: *\nDisallow: /\n`)
  }

  const client = await clientForHost(host)
  if (!client) return text(`User-agent: *\nDisallow: /\n`)

  // /api/ is back office, with one exception: the share card is an image the
  // page's own metadata points at, so it has to stay fetchable.
  const base = `User-agent: *\nAllow: /\nAllow: /api/site-og/\nDisallow: /api/\n`
  const canonical = canonicalHostFor(client)

  if (host !== canonical) {
    return text(
      `${base}\n# This site's canonical home is https://${canonical}/ — pages here are\n` +
        `# served with noindex, and are left crawlable so that is seen.\n`
    )
  }

  return text(`${base}\nSitemap: https://${host}/sitemap.xml\n`)
}

function text(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' },
  })
}
