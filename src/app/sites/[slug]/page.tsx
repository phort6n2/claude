import { notFound } from 'next/navigation'
import Script from 'next/script'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import {
  SiteHeader,
  SiteFooter,
  MobileCallBar,
  ReviewsBand,
  SiteUnavailable,
  telHrefFor,
  type ReviewsData,
  type ReviewQuote,
} from '@/components/sites/shared'
import {
  Phone,
  MapPin,
  ShieldCheck,
  Truck,
  Star,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react'

/**
 * Hosted client landing page.
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
  return prisma.client.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
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
    alternates: { canonical: `https://${client.slug}.glassleads.app/` },
  }
}

export default async function ClientSitePage({ params }: PageProps) {
  const { slug } = await params
  const client = await getClient(slug)

  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />

  const reviews = await getReviews(client.id)
  const primary = client.primaryColor || '#1e40af'
  const accent = client.accentColor || '#f59e0b'
  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
  const telHref = telHrefFor(client.phone)
  const areas = client.serviceAreas || []
  const basePath = `/sites/${client.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: client.businessName,
    telephone: client.phone,
    email: client.email,
    url: `https://${client.slug}.glassleads.app/`,
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
    <div className="min-h-screen bg-white text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader client={client} basePath={basePath} />

      {/* Hero */}
      <section className="relative" style={{ backgroundColor: primary }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 items-start">
          <div className="text-white">
            <p
              className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4"
              style={{ backgroundColor: accent, color: '#1f2937' }}
            >
              {client.city}, {client.state} Auto Glass Experts
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight">
              Cracked Windshield?
              <br />
              Fixed Fast. Done Right.
            </h1>
            <p className="mt-4 text-lg opacity-90 max-w-xl">
              Windshield repair and replacement in {client.city} —
              {client.offersMobileService
                ? ' we come to your home or office, or visit our shop.'
                : ' fast turnaround at our local shop.'}{' '}
              Free quotes and help with your insurance claim.
            </p>
            {reviews && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
                <Star className="h-4 w-4" fill="currentColor" style={{ color: accent }} />
                {reviews.rating.toFixed(1)} stars · {reviews.reviewCount} Google reviews
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#quote"
                className="px-6 py-3.5 rounded-xl font-bold text-gray-900 shadow-lg"
                style={{ backgroundColor: accent }}
              >
                Get My Free Quote
              </a>
              <a
                href={telHref}
                className="px-6 py-3.5 rounded-xl font-bold bg-white/15 ring-1 ring-white/40 flex items-center gap-2"
              >
                <Phone className="h-4 w-4" />
                {client.phone}
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm opacity-90">
              {client.offersMobileService && (
                <span className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4" /> Mobile service available
                </span>
              )}
              {client.offersAdasCalibration && (
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> ADAS calibration
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Insurance claims handled
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Fast scheduling
              </span>
            </div>
          </div>

          {/* Quote widget, above the fold on desktop */}
          <div id="quote" className="lg:justify-self-end w-full max-w-[440px] scroll-mt-24">
            <div data-glassleads-widget></div>
          </div>
        </div>
      </section>

      {/* Services */}
      {services.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-3xl font-extrabold text-center">What We Fix</h2>
          <p className="text-gray-500 text-center mt-2 mb-10">
            Every job backed by professional installation and quality glass.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((s) => (
              <a
                key={s.slug}
                href={`${basePath}/services/${s.slug}`}
                className="group p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all"
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${primary}1a` }}
                >
                  <CheckCircle2 className="h-5 w-5" style={{ color: primary }} />
                </div>
                <h3 className="font-bold text-lg">{s.name}</h3>
                <p className="text-gray-500 text-sm mt-1.5">{s.short}</p>
                <span
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
                  style={{ color: primary }}
                >
                  Learn more
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Reviews (live GBP data only; stripped when absent) */}
      <ReviewsBand reviews={reviews} client={client} />

      {/* Why us */}
      <section className="bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-3 gap-8 text-center">
          <div>
            <Star className="h-8 w-8 mx-auto mb-3" style={{ color: accent }} />
            <h3 className="font-bold text-lg">Local &amp; Trusted</h3>
            <p className="text-gray-500 text-sm mt-1.5">
              A {client.city} business, not a national call center. You talk to the
              people doing the work.
            </p>
            {client.googleMapsUrl && (
              <a
                href={client.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm font-semibold underline underline-offset-2"
                style={{ color: primary }}
              >
                Read our Google reviews
              </a>
            )}
          </div>
          <div>
            <ShieldCheck className="h-8 w-8 mx-auto mb-3" style={{ color: accent }} />
            <h3 className="font-bold text-lg">Insurance Made Easy</h3>
            <p className="text-gray-500 text-sm mt-1.5">
              We work with your insurance company directly and help you navigate the
              claim — many repairs cost you nothing out of pocket.
            </p>
          </div>
          <div>
            <Truck className="h-8 w-8 mx-auto mb-3" style={{ color: accent }} />
            <h3 className="font-bold text-lg">
              {client.offersMobileService ? 'We Come To You' : 'Fast Turnaround'}
            </h3>
            <p className="text-gray-500 text-sm mt-1.5">
              {client.offersMobileService
                ? 'Home, office, or roadside — our mobile unit brings the shop to you at no extra charge.'
                : 'Most windshields replaced same or next day, ready to drive fast.'}
            </p>
          </div>
        </div>
      </section>

      {/* Service areas */}
      {areas.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="text-3xl font-extrabold text-center">Areas We Serve</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {areas.map((area) => (
              <span
                key={area}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700"
              >
                <MapPin className="h-3.5 w-3.5" style={{ color: primary }} />
                {area}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="text-white" style={{ backgroundColor: primary }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 text-center">
          <h2 className="text-3xl font-extrabold">Ready to fix that glass?</h2>
          <p className="mt-2 opacity-90">
            Get a free quote in minutes — or call and talk to a real person now.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="#quote"
              className="px-6 py-3.5 rounded-xl font-bold text-gray-900"
              style={{ backgroundColor: accent }}
            >
              Get My Free Quote
            </a>
            <a
              href={telHref}
              className="px-6 py-3.5 rounded-xl font-bold bg-white/15 ring-1 ring-white/40 flex items-center gap-2"
            >
              <Phone className="h-4 w-4" />
              Call {client.phone}
            </a>
          </div>
        </div>
      </section>

      <SiteFooter client={client} />
      <MobileCallBar client={client} quoteHref="#quote" />

      {/* Quote widget — relative src makes it load and submit same-origin */}
      <Script src="/widget.js" data-client={client.slug} strategy="afterInteractive" />
    </div>
  )
}
