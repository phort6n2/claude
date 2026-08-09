import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { getServicePage, servicesForClient, type ServiceFlag } from '@/lib/site-services'
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
import { serviceJsonLd } from '@/lib/site-schema'

/**
 * Per-service page: the full homepage shell with a service-specific hero and
 * the service's own copy as its lead-in chapters — the reference build's
 * per-page model (same template, per-page hero and body).
 */

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string; service: string }>
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
    // Table may not exist yet; the band is simply stripped.
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, service } = await params
  const page = getServicePage(service)
  const client = await getClient(slug)
  if (!page || !client || client.status !== 'ACTIVE') return { title: 'Not Found' }

  const title = `${page.name} in ${client.city}, ${client.state} | ${client.businessName}`
  const description = `${page.short} Free quotes from ${client.businessName} in ${client.city}. Call ${client.phone}.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: { canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app/services/${page.slug}` },
  }
}

export default async function ServicePage({ params }: PageProps) {
  const { slug, service } = await params
  const page = getServicePage(service)
  if (!page) notFound()

  const client = await getClient(slug)
  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />
  if (!client[page.flag]) notFound()

  const [reviews, extras] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
  ])
  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
  const areas = client.serviceAreas || []
  const basePath = `/sites/${client.slug}`
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const flags = {
    offersMobileService: client.offersMobileService,
    offersAdasCalibration: client.offersAdasCalibration,
  }
  const nav = prioritizeServices(services)
    .filter((s) => s.slug !== page.slug)
    .slice(0, 4)
    .map((s) => ({ href: `${basePath}/services/${s.slug}`, label: s.name }))

  const siteOrigin = `https://${client.siteSubdomain || client.slug}.glassleads.app`
  const jsonLd = serviceJsonLd({
    origin: siteOrigin,
    client,
    service: { slug: page.slug, name: page.name },
  })

  const trustItems = buildTrustItems(client, flags, extras)
  const heroBullets = extras.heroBullets.length > 0 ? extras.heroBullets : defaultHeroBullets(flags)

  // The service's own copy leads the page, chapter-style, with body photos.
  const serviceChapters = page.sections.map((s) => ({
    heading: s.heading,
    body: s.body,
    photoUrl: '',
  }))

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
            ? `Mobile service across ${client.city} & nearby — we come to your home or workplace`
            : `Serving ${client.city}, ${client.state} and nearby`
        }
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={nav} />

      <main id="main">
      {/* Hero — identical composition to the homepage, service-specific copy */}
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
              {client.city}, {client.state}
            </Eyebrow>
            <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
              {page.name} in {client.city}
            </h1>
            <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-[48ch]">
              {page.heroLine}
            </p>
            <div className="mt-5 mb-[18px] hidden lg:block">
              <RatingChip reviews={reviews} client={client} />
            </div>
          </div>

          <div id="quote" className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end">
            <WidgetMount client={client} service={page.name} />
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

      {/* The service's own copy, chapter-style with body photos */}
      <ChapterSections
        client={client}
        chapters={serviceChapters}
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
        currentServiceSlug={page.slug}
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

      <WidgetScript client={client} basePath={basePath} />
    </div>
  )
}
