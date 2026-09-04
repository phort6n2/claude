import { prisma } from '@/lib/db'
import { servicePath, locationPath, readPathOverrides } from '@/lib/site-paths'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import { locationPages, mergeServiceAreas } from '@/lib/site-locations'
import { canonicalHostFor } from '@/lib/site-origin'
import { cityIsIndexable, getCityContent } from '@/lib/city-content'
import { LIVE_STATUSES } from '@/lib/site-preview'

/**
 * Which pages a hosted site publishes, as one list.
 *
 * ONE source, read by two callers: /sitemap.xml renders it as XML for
 * crawlers, and the Website tab renders it as a list for a person. They were
 * always going to be asked the same question — "what pages does this site
 * have" — and a second implementation of that answer is one that drifts, then
 * disagrees with the file Google actually reads.
 *
 * The exclusions are part of the answer, not a footnote. "Why is that city
 * missing from Google" is the question this card exists to end, and the honest
 * reply is usually that the page carries noindex because nobody has written
 * anything specific about that city yet — which is invisible from the XML.
 */

export type SitemapGroup = 'home' | 'service' | 'city' | 'kept' | 'legal'

export interface SitemapEntry {
  path: string
  loc: string
  group: SitemapGroup
  priority: string
  changefreq: string
  lastmod: string
}

export interface ExcludedPage {
  path: string
  group: SitemapGroup
  /** Why it is served but not listed, in words an operator can act on. */
  reason: string
}

export interface SiteSitemap {
  ok: boolean
  /** Empty when the site is not live or this is not its canonical host. */
  entries: SitemapEntry[]
  excluded: ExcludedPage[]
  canonicalHost: string | null
  sitemapUrl: string | null
  /** Set when the sitemap is deliberately empty — says which case it is. */
  note: string | null
}

const EMPTY: SiteSitemap = {
  ok: false,
  entries: [],
  excluded: [],
  canonicalHost: null,
  sitemapUrl: null,
  note: null,
}

/**
 * Build the page list for one client.
 *
 * `host` is the host the request arrived on, which decides whether anything
 * is listed at all: only the canonical host may list URLs, because a sitemap
 * served from a host whose pages carry noindex asks a crawler to index what
 * the pages tell it not to — a contradiction it resolves by trusting neither.
 * The admin card passes no host, meaning "the canonical one", since it is
 * asking what the site publishes rather than answering a crawler.
 */
export async function siteSitemap(
  clientId: string,
  requestHost?: string | null
): Promise<SiteSitemap> {
  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: {
        id: true,
        slug: true,
        status: true,
        siteSubdomain: true,
        updatedAt: true,
        serviceAreas: true,
      pathOverrides: true,
        domains: {
          where: { isPrimary: true },
          select: { domain: true, verified: true, misconfigured: true },
          take: 1,
        },
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
    .catch(() => null)
  if (!client) return EMPTY

  const canonicalHost = canonicalHostFor(client)
  const sitemapUrl = `https://${canonicalHost}/sitemap.xml`

  if (!LIVE_STATUSES.includes(client.status as (typeof LIVE_STATUSES)[number])) {
    return {
      ...EMPTY,
      canonicalHost,
      sitemapUrl,
      note: `This site is ${client.status}. Nothing is published, so the sitemap is empty until it goes live.`,
    }
  }
  const bare = (requestHost || canonicalHost).split(':')[0].toLowerCase()
  if (bare !== canonicalHost) {
    return {
      ...EMPTY,
      canonicalHost,
      sitemapUrl,
      note: `${bare} is not the canonical host. Its pages carry noindex, so its sitemap is deliberately empty — the listed one is ${canonicalHost}.`,
    }
  }

  const shopCities = await prisma.clientLocation
    .findMany({ where: { clientId: client.id }, select: { city: true } })
    .catch(() => [])
  const cities = shopCities.map((s) => s.city)
  const areas = mergeServiceAreas(client.serviceAreas || [], cities)
  const cityContent = await getCityContent(client.id)

  const keptPages = await prisma.clientPage
    .findMany({
      where: { clientId: client.id },
      select: { path: true, updatedAt: true, publishedAt: true, title: true },
      orderBy: { path: 'asc' },
    })
    .catch(() => [])

  const origin = `https://${canonicalHost}`
  const lastmod = client.updatedAt.toISOString()
  const at = (
    path: string,
    group: SitemapGroup,
    priority: string,
    changefreq: string,
    modified = lastmod
  ): SitemapEntry => ({ path, loc: `${origin}${path}`, group, priority, changefreq, lastmod: modified })

  const overrides = readPathOverrides(client.pathOverrides)
  const allCities = locationPages(areas)
  const indexable = allCities.filter((l) => cityIsIndexable(l.area, cityContent, cities))
  const thin = allCities.filter((l) => !indexable.includes(l))

  const entries: SitemapEntry[] = [
    at('/', 'home', '1.0', 'weekly'),
    ...servicesForClient(client as unknown as Record<ServiceFlag, boolean>).map((s) =>
      at(servicePath(s.slug, overrides), 'service', '0.8', 'monthly')
    ),
    ...indexable.map((l) => at(locationPath(l.slug, overrides), 'city', '0.7', 'monthly')),
    ...keptPages
      .filter((p) => p.publishedAt)
      .map((p) => at(p.path, 'kept', '0.6', 'monthly', p.updatedAt.toISOString())),
    at('/privacy', 'legal', '0.1', 'yearly'),
    at('/terms', 'legal', '0.1', 'yearly'),
  ]

  const excluded: ExcludedPage[] = [
    ...thin.map((l) => ({
      path: locationPath(l.slug, overrides),
      group: 'city' as const,
      reason:
        'Served, but carries noindex and is left out: no shop in that city and under 60 words written about it. Write city copy to have it listed.',
    })),
    ...keptPages
      .filter((p) => !p.publishedAt)
      .map((p) => ({
        path: p.path,
        group: 'kept' as const,
        reason: 'Held, not published — the address 404s until you publish it.',
      })),
  ]

  return { ok: true, entries, excluded, canonicalHost, sitemapUrl, note: null }
}
