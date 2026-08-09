import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import {
  UtilBar,
  SiteHeader,
  RatingChip,
  SiteUnavailable,
  Eyebrow,
  BulletCheck,
  CallButton,
  SiteBaseStyles,
  SkipLink,
  TrustRow,
  ChapterSections,
  faqJsonLd,
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

/**
 * Hosted client landing page, styled after the landing-template reference
 * build (collisionglass.co): light theme on brand-tinted surfaces, section
 * order and rhythm matching the reference. Service and location pages render
 * the same shell (SiteBody) with their own hero and lead-in content.
 *
 * Served at {slug}.glassleads.app (middleware rewrite) and directly at
 * /sites/{slug} for previewing before DNS is set up. Everything on the page —
 * name, phone, colors, services, service areas, reviews — renders from the
 * database, so improving this template improves every client's site on the
 * next deploy. Rating claims render only from live cached GBP data and are
 * stripped entirely when absent. Regenerated at most every 5 minutes (ISR),
 * never at build time.
 */

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getClient(slug: string) {
  // The label in the URL may be the full slug or the short siteSubdomain.
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
    // Table may not exist yet; the band is simply stripped.
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client || client.status !== 'ACTIVE') return { title: 'Not Found' }

  const title = `${client.businessName} | Auto Glass Repair & Replacement in ${client.city}, ${client.state}`
  const description = `Fast, professional windshield repair and replacement in ${client.city}, ${client.state}. Free quotes, insurance assistance${client.offersMobileService ? ', mobile service to your home or office' : ''}. Call ${client.phone}.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: { canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app/` },
  }
}

export default async function ClientSitePage({ params }: PageProps) {
  const { slug } = await params
  const client = await getClient(slug)

  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />

  const [reviews, extras] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
  ])
  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
  const areas = client.serviceAreas || []
  const basePath = `/sites/${client.slug}`
  const faqLd = faqJsonLd(extras)
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const flags = {
    offersMobileService: client.offersMobileService,
    offersAdasCalibration: client.offersAdasCalibration,
  }
  const nav = prioritizeServices(services).slice(0, 4).map((s) => ({
    href: `${basePath}/services/${s.slug}`,
    label: s.name,
  }))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: client.businessName,
    telephone: client.phone,
    email: client.email,
    url: `https://${client.siteSubdomain || client.slug}.glassleads.app/`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: client.streetAddress,
      addressLocality: client.city,
      addressRegion: client.state,
      postalCode: client.postalCode,
      addressCountry: 'US',
    },
    areaServed: areas.map((a) => ({ '@type': 'City', name: a })),
    ...(client.googleMapsUrl ? { hasMap: client.googleMapsUrl } : {}),
    ...(client.logoUrl ? { image: client.logoUrl } : {}),
    // Emitted ONLY from live cached review data, never fabricated.
    ...(reviews
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: reviews.rating,
            reviewCount: reviews.reviewCount,
          },
        }
      : {}),
  }

  // Headline names the location and the highest-value service the client
  // actually offers, like the reference — never a generic slogan.
  const heroTitle = client.offersAdasCalibration
    ? `Auto glass and ADAS calibration across the ${client.city} area`
    : client.offersMobileService
      ? `Auto glass repair and replacement — we come to you in ${client.city}`
      : `Windshield repair and replacement in ${client.city}`

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
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      <SkipLink />
      <UtilBar
        client={client}
        note={
          client.offersMobileService
            ? `Mobile service across ${client.city} & nearby — we come to your home or workplace`
            : `Serving ${client.city}, ${client.state} and nearby`
        }
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={nav} />

      <main id="main">
      {/* Hero — light gradient over the brand tint. Mobile order is the
          conversion spec from the reference: headline, then the FORM, then
          the supporting bullets; on desktop the form spans both rows on the
          right. When the client has photos, the first gallery shot sits
          underneath at low opacity (the owner's request — keep it). */}
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
              {client.city}, {client.state} auto glass experts
            </Eyebrow>
            <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
              {heroTitle}
            </h1>
            <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-[48ch]">
              Windshield repair and replacement in {client.city}
              <span className="max-[599px]:hidden">
                {' '}
                —
                {client.offersMobileService
                  ? ' we come to your home or office, or visit our shop.'
                  : ' fast turnaround at our local shop.'}{' '}
                Free quotes and help with your insurance claim.
              </span>
              <span className="min-[600px]:hidden">.</span>
            </p>
            <div className="mt-5 mb-[18px] hidden lg:block">
              <RatingChip reviews={reviews} client={client} />
            </div>
          </div>

          {/* Quote widget — above the fold on desktop, right under the
              headline on mobile */}
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
              <CallButton client={client} withLabel />
            </div>
          </div>
        </div>

        {/* Reference's .tb strip: four short factual claims under the hero */}
        <TrustRow items={trustItems} />
      </section>

      {/* Editorial chapters — the reference's long-form middle. Stripped
          entirely when the client has none. */}
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
      />

      <WidgetScript client={client} />
    </div>
  )
}
