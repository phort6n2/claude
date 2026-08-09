import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import { findLocation, mergeServiceAreas } from '@/lib/site-locations'
import {
  UtilBar,
  SiteHeader,
  RatingChip,
  SiteUnavailable,
  Eyebrow,
  BulletCheck,
  CallButton,
  CtaButton,
  SiteBaseStyles,
  SkipLink,
  TrustRow,
  ChapterSections,
  type ReviewsData,
  type ReviewQuote,
} from '@/components/sites/shared'
import {
  SiteBody,
  SiteChrome,
  WidgetMount,
  WidgetScript,
  buildTrustItems,
  defaultHeroBullets,
  prioritizeServices,
} from '@/components/sites/site-body'
import { getSiteExtras } from '@/lib/site-content'
import { sitePaletteVars } from '@/lib/site-theme'
import { getClientLocations } from '@/lib/client-locations'
import { locationJsonLd } from '@/lib/site-schema'

/**
 * Per-city location page — the full homepage shell with a city-specific hero.
 * Pages exist only for cities in the client's serviceAreas (capped, see
 * site-locations.ts), and every claim on them is flag-derived or shared real
 * content (reviews, photos, warranty) — city copy states the relationship the
 * data supports (mobile service to that city, or the shop serving it),
 * nothing invented.
 */

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string; city: string }>
}

async function getClient(slug: string) {
  return prisma.client.findFirst({
    where: { OR: [{ slug }, { siteSubdomain: slug }] },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      status: true,
      businessName: true,
      phone: true,
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      offersMobileService: true,
      offersWindshieldRepair: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
      serviceAreas: true,
      googleMapsUrl: true,
    },
  })
}

async function getReviews(clientId: string): Promise<ReviewsData | null> {
  try {
    const row = await prisma.clientGbpReviews.findUnique({ where: { clientId } })
    if (!row) return null
    return {
      rating: row.rating,
      reviewCount: row.reviewCount,
      quotes: (row.reviews as unknown as ReviewQuote[]) || [],
    }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, city } = await params
  const client = await getClient(slug)
  if (!client || client.status !== 'ACTIVE') return { title: 'Not Found' }
  const locations = await getClientLocations(client.id, client)
  const location = findLocation(
    mergeServiceAreas(client.serviceAreas || [], locations.map((l) => l.city)),
    city
  )
  if (!location) return { title: 'Not Found' }

  // Same origin as the page itself, and the same host the canonical names — a
  // share card served from a different host than the page it describes gets
  // dropped by some scrapers.
  const siteRoot = `https://${client.siteSubdomain || client.slug}.glassleads.app`
  const title = `Auto Glass in ${location.area}, ${client.state} | ${client.businessName}`
  const description = `Windshield repair and replacement in ${location.area}, ${client.state}${client.offersMobileService ? ' — mobile service to your home or office' : ''}. Free quotes from ${client.businessName}. Call ${client.phone}.`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: client.businessName,
      images: [`${siteRoot}/api/site-og/${client.slug}`],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${siteRoot}/api/site-og/${client.slug}`] },
    alternates: {
      canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app/locations/${location.slug}`,
    },
  }
}

export default async function LocationPage({ params }: PageProps) {
  const { slug, city } = await params
  const client = await getClient(slug)
  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />

  const [reviews, extras, locations] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
    getClientLocations(client.id, client),
  ])

  // Shop cities are part of the coverage list and lead the location pages —
  // a city we have an address in outranks one we only drive to. The page set
  // is resolved from the merged list, so a second shop always has a page.
  const areas = mergeServiceAreas(client.serviceAreas || [], locations.map((l) => l.city))
  const location = findLocation(areas, city)
  if (!location) notFound()

  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
  const basePath = `/sites/${client.slug}`
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const flags = {
    offersMobileService: client.offersMobileService,
    offersAdasCalibration: client.offersAdasCalibration,
  }
  const nav = prioritizeServices(services).slice(0, 4).map((s) => ({
    href: `${basePath}/services/${s.slug}`,
    label: s.name,
  }))

  const siteOrigin = `https://${client.siteSubdomain || client.slug}.glassleads.app`
  // A shop physically in this city, if the client has one. Naming it is the
  // difference between a page about a place and a page about coverage.
  const shopInCity =
    locations.find(
      (shop) => shop.city.trim().toLowerCase() === location.area.trim().toLowerCase()
    ) || null
  const jsonLd = locationJsonLd({
    origin: siteOrigin,
    client,
    area: location.area,
    slug: location.slug,
    shop: shopInCity,
  })

  // City copy states only what the data supports. A shop is named here ONLY
  // when one is genuinely in this city — telling a Tualatin visitor to "visit
  // the shop in Portland" because Portland is the address we happen to store
  // contradicts the rest of the page and sends them to the wrong door. When no
  // shop sits in the city, the map section shows the real addresses instead.
  const shopClause = shopInCity ? `, or visit our ${shopInCity.label} shop at ${shopInCity.streetAddress}` : ''
  const heroSub = client.offersMobileService
    ? `Our mobile unit covers ${location.area} — windshield repair and replacement at your home, office, or roadside${shopClause}. Free quotes and help with your insurance claim.`
    : shopInCity
      ? `${client.businessName} is in ${location.area} at ${shopInCity.streetAddress}. Free quotes and help with your insurance claim.`
      : `${client.businessName} serves ${location.area} and the surrounding area. Free quotes and help with your insurance claim.`

  const trustItems = buildTrustItems(client, flags, extras)
  const heroBullets = extras.heroBullets.length > 0 ? extras.heroBullets : defaultHeroBullets(flags)

  return (
    <div
      className="gl-site min-h-screen bg-[var(--paper)] text-[var(--tx)] leading-[1.62]"
      style={palette as React.CSSProperties}
    >
      <SiteBaseStyles />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SkipLink />
      <UtilBar
        client={client}
        note={
          client.offersMobileService
            ? `Mobile service in ${location.area} — we come to your home or workplace`
            : `Serving ${location.area}, ${client.state} and nearby`
        }
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={nav} />

      <main id="main">
      {/* Hero — identical composition to the homepage, city-specific copy */}
      <section
        className="relative overflow-hidden pt-5 pb-9 lg:pt-[52px] lg:pb-[68px]"
        style={{
          background: 'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)',
        }}
      >
        {extras.galleryPhotos[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={extras.galleryPhotos[0].url}
            alt=""
            aria-hidden="true"
            fetchPriority="low"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-[0.13] pointer-events-none select-none"
          />
        )}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_452px] lg:grid-rows-[auto_1fr] lg:gap-x-[52px] lg:gap-y-[18px]">
          <div className="lg:col-start-1 lg:row-start-1">
            <Eyebrow>
              {location.area}, {client.state}
            </Eyebrow>
            <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
              {client.offersAdasCalibration
                ? `Auto glass and ADAS calibration in ${location.area}`
                : `Windshield repair and replacement in ${location.area}`}
            </h1>
            <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-[48ch]">{heroSub}</p>
            <div className="mt-5 mb-[18px] hidden lg:block">
              <RatingChip reviews={reviews} client={client} />
            </div>
          </div>

          <div id="quote" className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end">
            <WidgetMount client={client} />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <ul className="space-y-2.5 list-none p-0 m-0 max-w-xl">
              {heroBullets.map((b) => (
                <li key={b.lead} className="flex items-start gap-2.5 text-[var(--tx2)]">
                  <BulletCheck />
                  <span>
                    <strong className="text-[var(--tx)]">{b.lead}</strong>
                    {b.text ? ` ${b.text}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 max-[719px]:flex max-[719px]:flex-col max-[719px]:[&>a]:w-full flex flex-wrap gap-3">
              <CtaButton href="#quote">Get my free quote</CtaButton>
              <CallButton client={client} withLabel />
            </div>
          </div>
        </div>

        <TrustRow items={trustItems} />
      </section>

      {/* Business chapters give location pages the same substance as home */}
      <ChapterSections
        client={client}
        chapters={extras.chapters}
        fallbackPhotos={extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)}
      />

      <SiteBody
        client={client}
        flags={flags}
        reviews={reviews}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        locations={locations}
        activeCity={location.area}
      />
      </main>

      <SiteChrome
        client={client}
        flags={flags}
        reviews={reviews}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        locations={locations}
      />

      <WidgetScript client={client} basePath={basePath} />
    </div>
  )
}
