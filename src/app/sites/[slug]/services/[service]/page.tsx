import { notFound } from 'next/navigation'
import Script from 'next/script'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { getServicePage, servicesForClient, type ServiceFlag } from '@/lib/site-services'
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
import { Phone, CheckCircle2 } from 'lucide-react'

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

  const reviews = await getReviews(client.id)
  const primary = client.primaryColor || '#1e40af'
  const accent = client.accentColor || '#f59e0b'
  const basePath = `/sites/${client.slug}`
  const otherServices = servicesForClient(client as Record<ServiceFlag, boolean>).filter(
    (s) => s.slug !== page.slug
  )

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
    <div className="min-h-screen bg-white text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader client={client} basePath={basePath} />

      {/* Hero */}
      <section style={{ backgroundColor: primary }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 text-white">
          <p
            className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4"
            style={{ backgroundColor: accent, color: '#1f2937' }}
          >
            {client.city}, {client.state}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight max-w-3xl">
            {page.name}
          </h1>
          <p className="mt-4 text-lg opacity-90 max-w-2xl">{page.heroLine}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#quote"
              className="px-6 py-3.5 rounded-xl font-bold text-gray-900 shadow-lg"
              style={{ backgroundColor: accent }}
            >
              Get My Free Quote
            </a>
            <a
              href={telHrefFor(client.phone)}
              className="px-6 py-3.5 rounded-xl font-bold bg-white/15 ring-1 ring-white/40 flex items-center gap-2"
            >
              <Phone className="h-4 w-4" />
              {client.phone}
            </a>
          </div>
        </div>
      </section>

      {/* Body + quote form */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid lg:grid-cols-[1fr_400px] gap-10 items-start">
        <div className="space-y-10">
          {page.sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-2xl font-extrabold">{s.heading}</h2>
              <p className="mt-3 text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}

          {otherServices.length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                Also from {client.businessName}
              </h3>
              <div className="flex flex-wrap gap-2">
                {otherServices.map((s) => (
                  <a
                    key={s.slug}
                    href={`${basePath}/services/${s.slug}`}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color: primary }} />
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

      <ReviewsBand reviews={reviews} client={client} />

      <SiteFooter client={client} />
      <MobileCallBar client={client} quoteHref="#quote" />

      <Script src="/widget.js" data-client={client.slug} strategy="afterInteractive" />
    </div>
  )
}
