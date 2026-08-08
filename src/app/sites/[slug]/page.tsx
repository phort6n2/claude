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
  CtaButton,
  CallButton,
  faqJsonLd,
  type ReviewsData,
  type ReviewQuote,
} from '@/components/sites/shared'
import { getSiteExtras } from '@/lib/site-content'
import { sitePaletteVars } from '@/lib/site-theme'
import {
  MapPin,
  ShieldCheck,
  Truck,
  Star,
  CheckCircle2,
  Clock,
  ArrowRight,
  BadgeDollarSign,
} from 'lucide-react'

/**
 * Hosted client landing page, styled after the landing-template reference
 * build (collisionglass.co): light theme on brand-tinted surfaces.
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

  return (
    <div
      className="min-h-screen bg-[var(--paper)] text-[var(--tx)]"
      style={palette as React.CSSProperties}
    >
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
            ? `Mobile service across ${client.city} & nearby — we come to you`
            : `Serving ${client.city}, ${client.state} and nearby`
        }
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} />

      {/* Hero — light gradient over the brand tint, form card to the right */}
      <section
        className="pt-6 pb-10"
        style={{
          background: 'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,1fr)_430px] gap-8 items-start">
          <div className="pt-4">
            <Eyebrow>
              {client.city}, {client.state} auto glass experts
            </Eyebrow>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight text-[var(--tx)]">
              Cracked windshield?
              <br />
              Fixed fast. Done right.
            </h1>
            <p className="mt-4 text-[17px] leading-relaxed text-[var(--tx2)] max-w-[48ch]">
              Windshield repair and replacement in {client.city} —
              {client.offersMobileService
                ? ' we come to your home or office, or visit our shop.'
                : ' fast turnaround at our local shop.'}{' '}
              Free quotes and help with your insurance claim.
            </p>
            <div className="mt-5">
              <RatingChip reviews={reviews} client={client} />
            </div>
            <ul className="mt-6 space-y-2.5 list-none p-0 m-0 max-w-xl">
              {(extras.heroBullets.length > 0
                ? extras.heroBullets.map((b) => ({
                    lead: b.lead,
                    text: b.text,
                  }))
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
              ).map((b) => (
                <li key={b.lead} className="flex items-start gap-2.5 text-[var(--tx2)]">
                  <CheckCircle2 className="h-[18px] w-[18px] mt-1 shrink-0 text-[var(--success)]" />
                  <span>
                    <strong className="text-[var(--tx)]">{b.lead}</strong>
                    {b.text ? ` ${b.text}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <CtaButton href="#quote">Get my free quote</CtaButton>
              <CallButton client={client} />
            </div>
          </div>

          {/* Quote widget, above the fold on desktop */}
          <div id="quote" className="w-full scroll-mt-24">
            <div data-glassleads-widget></div>
          </div>
        </div>
      </section>

      {/* Services */}
      {services.length > 0 && (
        <section className="bg-[var(--s1)] border-t border-[var(--line)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <div className="text-center max-w-xl mx-auto mb-10">
              <Eyebrow center>Services</Eyebrow>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">What we handle</h2>
              <p className="mt-2 text-[var(--tx-muted)]">
                Every job backed by professional installation and quality glass.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.map((s) => (
                <a
                  key={s.slug}
                  href={`${basePath}/services/${s.slug}`}
                  className="group p-6 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm hover:shadow-md transition-shadow no-underline"
                >
                  <div className="h-10 w-10 rounded-[14px] flex items-center justify-center mb-4 bg-[var(--tint)]">
                    <CheckCircle2 className="h-5 w-5 text-[var(--brand)]" />
                  </div>
                  <h3 className="font-bold text-lg text-[var(--tx)] m-0">{s.name}</h3>
                  <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">{s.short}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]">
                    Learn more
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why us */}
      <section className="border-t border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="text-center max-w-xl mx-auto mb-10">
            <Eyebrow center>Why us</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why people pick us over the chains
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <Star className="h-8 w-8 mx-auto mb-3 text-[var(--brand)]" />
              <h3 className="font-bold text-lg m-0">Local &amp; trusted</h3>
              <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">
                A {client.city} business, not a national call center. You talk to the people doing
                the work.
              </p>
              {client.googleMapsUrl && (
                <a
                  href={client.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-sm font-bold underline underline-offset-[3px] text-[var(--brand)]"
                >
                  Read our Google reviews
                </a>
              )}
            </div>
            <div>
              <Clock className="h-8 w-8 mx-auto mb-3 text-[var(--brand)]" />
              <h3 className="font-bold text-lg m-0">Fast scheduling</h3>
              <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">
                Most windshields replaced same or next day, ready to drive fast.
              </p>
            </div>
            <div>
              <Truck className="h-8 w-8 mx-auto mb-3 text-[var(--brand)]" />
              <h3 className="font-bold text-lg m-0">
                {client.offersMobileService ? 'We come to you' : 'Quality installation'}
              </h3>
              <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">
                {client.offersMobileService
                  ? 'Home, office, or roadside — our mobile unit brings the shop to you.'
                  : 'Quality glass and adhesives, installed to manufacturer spec.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Insurance — the warm accent band */}
      <section className="bg-[var(--tint-warm)] border-y border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
          <BadgeDollarSign className="h-12 w-12 text-[var(--brand)] hidden md:block" />
          <div>
            <Eyebrow>Insurance made easy</Eyebrow>
            <h2 className="text-3xl font-extrabold tracking-tight">
              We handle the claim with your carrier
            </h2>
            <p className="mt-3 text-[var(--tx2)] max-w-3xl">
              We work with your insurance company directly and help you navigate the claim — many
              repairs cost you nothing out of pocket. Not going through insurance? You&apos;ll get a
              straight cash price up front, before any work starts.
            </p>
          </div>
        </div>
      </section>

      {/* Range-of-work gallery (stripped when no photos) */}
      <GalleryGrid extras={extras} />

      {/* Reviews (live GBP data only; stripped when absent) */}
      <ReviewsBand reviews={reviews} />

      {/* Service areas */}
      {areas.length > 0 && (
        <section className="border-t border-[var(--line)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <div className="text-center max-w-xl mx-auto mb-8">
              <Eyebrow center>Coverage</Eyebrow>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Areas we serve</h2>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {areas.map((area) => (
                <span
                  key={area}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--line-card)] bg-white text-sm font-semibold text-[var(--tx2)] shadow-sm"
                >
                  <MapPin className="h-3.5 w-3.5 text-[var(--brand)]" />
                  {area}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Warranty (rendered only when defined in full) */}
      <WarrantyBand extras={extras} />

      {/* FAQ (stripped when empty) */}
      <FaqSection extras={extras} />

      <FinalCta client={client} quoteHref="#quote" />

      <SiteFooter client={client} extras={extras} />
      <MobileCallBar client={client} quoteHref="#quote" />

      {/* Quote widget — relative src makes it load and submit same-origin */}
      <Script src="/widget.js" data-client={client.slug} strategy="afterInteractive" />
    </div>
  )
}
