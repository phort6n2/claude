import { LIVE_STATUSES } from '@/lib/site-preview'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { siteSitemap } from '@/lib/site-sitemap'

export const dynamic = 'force-dynamic'

/**
 * Per-client sitemap, resolved from the requesting host.
 *
 * A client subdomain gets that client's own page set; the app host gets an
 * empty sitemap (the admin app is not for indexing). Reads the Host header
 * directly rather than going through the middleware rewrite, so it works for
 * subdomains and for custom domains.
 *
 * The page list itself lives in lib/site-sitemap so the Website tab can show
 * a person exactly what this file tells a crawler. Two implementations of
 * "what pages does this site have" would drift, and the first anyone would
 * hear of it is a client asking why a page is not in Google.
 */
function clientLabelFromHost(host: string): string | null {
  const bare = host.split(':')[0].toLowerCase()
  if (!bare.endsWith('.glassleads.app')) return null
  const label = bare.slice(0, -'.glassleads.app'.length)
  if (!label || label === 'www' || label.includes('.')) return null
  return label
}

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const bare = host.split(':')[0].toLowerCase()
  const label = clientLabelFromHost(host)

  const xml = (body: string) =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`,
      { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } }
    )

  // A custom domain has no label; it is resolved by hostname instead.
  if (!label && !bare.includes('.')) return xml('')

  const client = await prisma.client.findFirst({
    where: label
      ? { OR: [{ slug: label }, { siteSubdomain: label }], status: { in: [...LIVE_STATUSES] } }
      : { domains: { some: { domain: bare } }, status: { in: [...LIVE_STATUSES] } },
    select: { id: true },
  })
  if (!client) return xml('')

  // The host is passed through: only the canonical one lists URLs, and that
  // rule lives with the list rather than here.
  const { entries } = await siteSitemap(client.id, host)
  return xml(
    entries
      .map(
        (e) =>
          `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`
      )
      .join('\n')
  )
}
