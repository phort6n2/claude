import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import { locationPages } from '@/lib/site-locations'

export const dynamic = 'force-dynamic'

/**
 * Per-client sitemap, resolved from the requesting host.
 *
 * A client subdomain gets that client's own page set; the app host gets an
 * empty sitemap (the admin app is not for indexing). Reads the Host header
 * directly rather than going through the middleware rewrite, so it works for
 * subdomains and, later, custom domains.
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
  const label = clientLabelFromHost(host)

  const xml = (body: string) =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`,
      { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } }
    )

  if (!label) return xml('')

  const client = await prisma.client.findFirst({
    where: { OR: [{ slug: label }, { siteSubdomain: label }], status: 'ACTIVE' },
    select: {
      slug: true,
      siteSubdomain: true,
      updatedAt: true,
      serviceAreas: true,
      offersWindshieldRepair: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
      offersMobileService: true,
    },
  })
  if (!client) return xml('')

  const origin = `https://${host}`
  const lastmod = client.updatedAt.toISOString()
  const entry = (path: string, priority: string, freq: string) =>
    `  <url><loc>${origin}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`

  const urls = [
    entry('/', '1.0', 'weekly'),
    ...servicesForClient(client as unknown as Record<ServiceFlag, boolean>).map((s) =>
      entry(`/services/${s.slug}`, '0.8', 'monthly')
    ),
    ...locationPages(client.serviceAreas || []).map((l) =>
      entry(`/locations/${l.slug}`, '0.7', 'monthly')
    ),
    entry('/privacy', '0.1', 'yearly'),
    entry('/terms', '0.1', 'yearly'),
  ]

  return xml(urls.join('\n'))
}
