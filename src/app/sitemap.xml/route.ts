import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import { locationPages, mergeServiceAreas } from '@/lib/site-locations'
import { canonicalHostFor } from '@/lib/site-origin'
import { cityIsIndexable, getCityContent } from '@/lib/city-content'

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
      ? { OR: [{ slug: label }, { siteSubdomain: label }], status: 'ACTIVE' }
      : { domains: { some: { domain: bare } }, status: 'ACTIVE' },
    select: {
      id: true,
      slug: true,
      domains: {
        where: { isPrimary: true },
        select: { domain: true, verified: true, misconfigured: true },
        take: 1,
      },
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

  // Only the canonical host lists URLs. A sitemap on a host whose pages carry
  // noindex asks the crawler to index what the pages tell it not to, which is
  // a contradiction it resolves by trusting neither.
  if (bare !== canonicalHostFor(client)) return xml('')

  // Shop cities get pages ahead of coverage-only cities, so the sitemap has
  // to resolve the same merged list the router does.
  const shopCities = await prisma.clientLocation
    .findMany({ where: { clientId: client.id }, select: { city: true } })
    .catch(() => [])
  const areas = mergeServiceAreas(client.serviceAreas || [], shopCities.map((s) => s.city))
  const cityContent = await getCityContent(client.id)

  const origin = `https://${host}`
  const lastmod = client.updatedAt.toISOString()
  const entry = (path: string, priority: string, freq: string) =>
    `  <url><loc>${origin}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`

  const urls = [
    entry('/', '1.0', 'weekly'),
    ...servicesForClient(client as unknown as Record<ServiceFlag, boolean>).map((s) =>
      entry(`/services/${s.slug}`, '0.8', 'monthly')
    ),
    // Only cities the page can say something specific about. A sitemap entry
    // for a page carrying noindex asks the crawler to index what the page
    // tells it not to.
    ...locationPages(areas)
      .filter((l) => cityIsIndexable(l.area, cityContent, shopCities.map((s) => s.city)))
      .map((l) => entry(`/locations/${l.slug}`, '0.7', 'monthly')),
    entry('/privacy', '0.1', 'yearly'),
    entry('/terms', '0.1', 'yearly'),
  ]

  return xml(urls.join('\n'))
}
