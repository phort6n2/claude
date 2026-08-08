import { notFound } from 'next/navigation'
import Script from 'next/script'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { getServicePage, servicesForClient, type ServiceFlag } from '@/lib/site-services'
import {
  UtilBar,
  SiteHeader,
  SiteFooter,
  MobileCallBar,
  ReviewsBand,
  RatingChip,
  SiteUnavailable,
  GalleryGrid,
  FinalCta,
  Eyebrow,
  CtaButton,
  CallButton,
  SiteBaseStyles,
  type ReviewsData,
  type ReviewQuote,
} from '@/components/sites/shared'
import { getSiteExtras } from '@/lib/site-content'
import { sitePaletteVars } from '@/lib/site-theme'
import { CheckCircle2 } from 'lucide-react'

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
      email: true,
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
  const basePath = `/sites/${client.slug}`
  const otherServices = servicesForClient(client as Record<ServiceFlag, boolean>).filter(
    (s) => s.slug !== page.slug
  )
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: client.businessName,
        item: `https://${client.siteSubdomain || client.slug}.glassleads.app/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: page.name,
        item: `https://${client.siteSubdomain || client.slug}.glassleads.app/services/${page.slug}`,
      },
    ],
  }

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

      <UtilBar
        client={client}
        note={
          client.offersMobileService
            ? `Mobile service across ${client.city} & nearby — we come to you`
            : `Serving ${client.city}, ${client.state} and nearby`
        }
      />
      <SiteHeader
        client={client}
        basePath={basePath}
        reviews={reviews}
        nav={otherServices.slice(0, 4).map((s) => ({
          href: `${basePath}/services/${s.slug}`,
          label: s.name,
        }))}
      />

      {/* Hero — light gradient, matching the home page */}
      <section
        className="pt-8 pb-10"
        style={{
          background: 'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Eyebrow>
            {client.city}, {client.state}
          </Eyebrow>
          <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] max-w-3xl">
            {page.name}
          </h1>
          <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-2xl">
            {page.heroLine}
          </p>
          <div className="mt-5">
            <RatingChip reviews={reviews} client={client} />
          </div>
          <div className="mt-7 max-[719px]:flex max-[719px]:flex-col max-[719px]:[&>a]:w-full flex flex-wrap gap-3">
            <CtaButton href="#quote">Get my free quote</CtaButton>
            <CallButton client={client} withLabel />
          </div>
        </div>
      </section>

      {/* Body + quote form */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid lg:grid-cols-[1fr_400px] gap-10 items-start">
        <div className="space-y-10">
          {page.sections.map((s, index) => {
            const photo = extras.bodyPhotos[Math.floor(index / 2)]
            return (
              <div key={s.heading}>
                <h2 className="text-2xl font-extrabold tracking-tight m-0">{s.heading}</h2>
                <p className="mt-3 mb-0 text-[var(--tx2)] leading-relaxed">{s.body}</p>
                {index % 2 === 0 && photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={photo.alt}
                    loading="lazy"
                    className="mt-6 w-full aspect-[16/9] object-cover rounded-[20px] border border-[var(--line-card)]"
                  />
                )}
              </div>
            )
          })}

          {otherServices.length > 0 && (
            <div className="pt-4 border-t border-[var(--line)]">
              <h3 className="text-sm font-bold text-[var(--tx-muted)] uppercase tracking-wider mb-3">
                Also from {client.businessName}
              </h3>
              <div className="flex flex-wrap gap-2">
                {otherServices.map((s) => (
                  <a
                    key={s.slug}
                    href={`${basePath}/services/${s.slug}`}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[var(--line-card)] bg-white text-sm font-semibold text-[var(--tx2)] no-underline hover:border-[var(--line-strong)]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand)]" />
                    {s.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div id="quote" className="w-full scroll-mt-24 lg:sticky lg:top-20">
          <div data-glassleads-widget></div>
        </div>
      </section>

      <ReviewsBand reviews={reviews} />

      <GalleryGrid extras={extras} />

      <FinalCta client={client} quoteHref="#quote" />

      <SiteFooter
        client={client}
        extras={extras}
        services={servicesForClient(client as Record<ServiceFlag, boolean>)}
        areas={client.serviceAreas || []}
        basePath={basePath}
        reviews={reviews}
        offersMobileService={client.offersMobileService}
        offersAdasCalibration={client.offersAdasCalibration}
      />
      <MobileCallBar client={client} quoteHref="#quote" />

      <Script src="/widget.js" data-client={client.slug} strategy="afterInteractive" />
    </div>
  )
}
