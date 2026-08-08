import { notFound } from 'next/navigation'
import Script from 'next/script'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import {
  UtilBar,
  SiteHeader,
  SiteFooter,
  MobileCallBar,
  ReviewsBand,
  RatingChip,
  SiteUnavailable,
  WarrantyBand,
  GalleryGrid,
  FaqSection,
  FinalCta,
  Eyebrow,
  SectionHead,
  CallButton,
  StatBand,
  ProcessSection,
  InsuranceBand,
  MapSection,
  AreasBand,
  BulletCheck,
  SiteBaseStyles,
  TrustRow,
  ChapterSections,
  faqJsonLd,
  type ReviewsData,
  type ReviewQuote,
} from '@/components/sites/shared'
import { getSiteExtras } from '@/lib/site-content'
import { sitePaletteVars } from '@/lib/site-theme'
import {
  ArrowRight,
  Car,
  Wrench,
  CircleDot,
  DoorOpen,
  CarFront,
  Sun,
  ScanLine,
  CheckCircle2,
  Truck,
  ShieldCheck,
  BadgeCheck,
  Clock,
  type LucideIcon,
} from 'lucide-react'

/**
 * Hosted client landing page, styled after the landing-template reference
 * build (collisionglass.co): light theme on brand-tinted surfaces, section
 * order and rhythm matching the reference.
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

const SERVICE_ICONS: Record<string, LucideIcon> = {
  'windshield-replacement': Car,
  'windshield-repair': Wrench,
  'rock-chip-repair': CircleDot,
  'side-window-replacement': DoorOpen,
  'back-glass-replacement': CarFront,
  'sunroof-repair': Sun,
  'adas-calibration': ScanLine,
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
  const nav = services.slice(0, 4).map((s) => ({
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

  const trustItems = [
    ...(client.offersMobileService
      ? [{ icon: <Truck className="h-5 w-5" />, title: 'Mobile service', text: 'We come to your home or work' }]
      : []),
    ...(client.offersAdasCalibration
      ? [{ icon: <ScanLine className="h-5 w-5" />, title: 'ADAS calibration', text: 'Cameras recalibrated after replacement' }]
      : []),
    { icon: <ShieldCheck className="h-5 w-5" />, title: 'Insurance claims handled', text: 'We work with your carrier directly' },
    ...(extras.warrantyText
      ? [{ icon: <BadgeCheck className="h-5 w-5" />, title: extras.warrantyTitle || 'Workmanship warranty', text: 'Full terms further down this page' }]
      : []),
    { icon: <Clock className="h-5 w-5" />, title: 'Fast scheduling', text: 'Most jobs done same or next day' },
  ].slice(0, 4)

  const heroBullets =
    extras.heroBullets.length > 0
      ? extras.heroBullets
      : [
          ...(client.offersMobileService
            ? [{ lead: 'Mobile service available.', text: 'Home, office, or roadside.' }]
            : []),
          ...(client.offersAdasCalibration
            ? [{ lead: 'ADAS calibration.', text: 'Cameras recalibrated after replacement.' }]
            : []),
          { lead: 'Insurance claims handled.', text: 'We work with your carrier directly.' },
          { lead: 'Fast scheduling.', text: 'Most jobs done same or next day.' },
        ]

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

      <UtilBar
        client={client}
        note={
          client.offersMobileService
            ? `Mobile service across ${client.city} & nearby — we come to your home or workplace`
            : `Serving ${client.city}, ${client.state} and nearby`
        }
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={nav} />

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
            <div className="mt-5 mb-[18px]">
              <RatingChip reviews={reviews} client={client} />
            </div>
          </div>

          {/* Quote widget — above the fold on desktop, right under the
              headline on mobile */}
          <div id="quote" className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end">
            <div data-glassleads-widget></div>
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
        chapters={extras.chapters}
        fallbackPhotos={extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)}
      />

      {/* Services — on paper, per the reference rhythm */}
      {services.length > 0 && (
        <section className="border-t border-[var(--line)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <SectionHead
              eyebrow="Services"
              title="What we handle"
              lead="Every job backed by professional installation and quality glass."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.map((s) => {
                const Icon = SERVICE_ICONS[s.slug] || CheckCircle2
                return (
                  <a
                    key={s.slug}
                    href={`${basePath}/services/${s.slug}`}
                    className="group p-6 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm hover:shadow-md hover:border-[var(--line-strong)] hover:-translate-y-0.5 transition-all no-underline"
                  >
                    <div className="h-10 w-10 rounded-[14px] flex items-center justify-center mb-4 bg-[var(--tint)]">
                      <Icon className="h-5 w-5 text-[var(--brand)]" />
                    </div>
                    <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold text-[var(--tx)] m-0">
                      {s.name}
                    </h3>
                    <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">{s.short}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]">
                      {s.name}
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </a>
                )
              })}
              {client.offersMobileService && (
                <a
                  href="#quote"
                  className="group p-6 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm hover:shadow-md hover:border-[var(--line-strong)] hover:-translate-y-0.5 transition-all no-underline"
                >
                  <div className="h-10 w-10 rounded-[14px] flex items-center justify-center mb-4 bg-[var(--tint)]">
                    <Truck className="h-5 w-5 text-[var(--brand)]" />
                  </div>
                  <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold text-[var(--tx)] m-0">
                    Mobile Service
                  </h3>
                  <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">
                    Home, office, or roadside — the shop comes to you.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]">
                    Get a quote
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* How it works — numbered steps on the s2 tint */}
      <ProcessSection client={client} offersMobileService={client.offersMobileService} />

      {/* Stat band — dark, data-derived, strips without enough data */}
      <StatBand reviews={reviews} areasCount={areas.length} servicesCount={services.length} />

      {/* Insurance — the warm band */}
      <InsuranceBand />

      {/* Range-of-work gallery (stripped when no photos) */}
      <GalleryGrid extras={extras} />

      {/* Reviews (live GBP data only; stripped when absent) */}
      <ReviewsBand reviews={reviews} />

      {/* Map + Google listing (shop locations only) */}
      <MapSection client={client} reviews={reviews} />

      {/* Service areas — dark coverage band */}
      <AreasBand client={client} areas={areas} />

      {/* Warranty (rendered only when defined in full) */}
      <WarrantyBand extras={extras} />

      {/* FAQ (stripped when empty) */}
      <FaqSection extras={extras} />

      <FinalCta client={client} quoteHref="#quote" />

      <SiteFooter
        client={client}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
      />
      <MobileCallBar client={client} quoteHref="#quote" />

      {/* Quote widget — relative src makes it load and submit same-origin */}
      <Script src="/widget.js" data-client={client.slug} strategy="afterInteractive" />
    </div>
  )
}
