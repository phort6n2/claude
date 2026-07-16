import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  MapPin,
  Phone,
  Globe,
  Mail,
  Truck,
  BadgeCheck,
  Clock,
  ShieldCheck,
  Calendar,
} from 'lucide-react'
import {
  getAllShops,
  getShopBySlug,
  getRelatedShops,
  serviceMeta,
  cityHref,
} from '@/lib/directory/data'
import { dayLabel, formatTime, telHref } from '@/lib/directory/format'
import { StarRating } from '@/components/directory/StarRating'
import { ShopCard } from '@/components/directory/ShopCard'
import type { Shop } from '@/lib/directory/types'

export function generateStaticParams() {
  return getAllShops().map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const shop = getShopBySlug(slug)
  if (!shop) return { title: 'Shop not found' }

  const title = `${shop.name} — Auto Glass in ${shop.city}, ${shop.state.toUpperCase()}`
  const description = shop.description.slice(0, 155)
  return {
    title,
    description,
    alternates: { canonical: `/directory/shop/${shop.slug}` },
    openGraph: { title, description, type: 'website' },
  }
}

/** Build schema.org LocalBusiness / AutoRepair JSON-LD for rich results. */
function buildJsonLd(shop: Shop) {
  const openingHours = shop.hours
    .filter((h) => h.open && h.close)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ][h.day],
      opens: h.open,
      closes: h.close,
    }))

  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: shop.name,
    description: shop.description,
    telephone: shop.phone,
    ...(shop.email ? { email: shop.email } : {}),
    ...(shop.website ? { url: shop.website } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: shop.street,
      addressLocality: shop.city,
      addressRegion: shop.state.toUpperCase(),
      postalCode: shop.zip,
      addressCountry: 'US',
    },
    ...(shop.lat && shop.lng
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: shop.lat,
            longitude: shop.lng,
          },
        }
      : {}),
    ...(shop.rating && shop.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: shop.rating,
            reviewCount: shop.reviewCount,
            bestRating: 5,
          },
        }
      : {}),
    openingHoursSpecification: openingHours,
    makesOffer: shop.services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: serviceMeta(s).label },
    })),
  }
}

export default async function ShopDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const shop = getShopBySlug(slug)
  if (!shop) notFound()

  const related = getRelatedShops(shop, 3)
  const jsonLd = buildJsonLd(shop)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 py-3 text-sm text-gray-500">
          <Link href="/directory" className="hover:text-blue-600">
            Directory
          </Link>
          <span>/</span>
          <Link href={`/directory/${shop.state}`} className="hover:text-blue-600">
            {shop.stateFull}
          </Link>
          <span>/</span>
          <Link href={cityHref(shop)} className="hover:text-blue-600">
            {shop.city}
          </Link>
          <span>/</span>
          <span className="text-gray-700">{shop.name}</span>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main column */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{shop.name}</h1>
                <Link
                  href={cityHref(shop)}
                  className="mt-2 inline-flex items-center gap-1.5 text-gray-500 hover:text-blue-600"
                >
                  <MapPin width={16} height={16} />
                  {shop.street}, {shop.city}, {shop.state.toUpperCase()} {shop.zip}
                </Link>
              </div>
              {shop.claimed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                  <BadgeCheck width={15} height={15} /> Verified listing
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {shop.rating != null && (
                <StarRating rating={shop.rating} reviewCount={shop.reviewCount} size={18} />
              )}
              {shop.yearsInBusiness != null && (
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar width={15} height={15} /> {shop.yearsInBusiness} years in
                  business
                </span>
              )}
              {shop.mobileService && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
                  <Truck width={15} height={15} /> Mobile service
                </span>
              )}
            </div>

            <p className="mt-6 leading-relaxed text-gray-700">{shop.description}</p>

            {/* Services */}
            <h2 className="mt-10 text-xl font-bold text-gray-900">Services offered</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {shop.services.map((key) => {
                const meta = serviceMeta(key)
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="font-semibold text-gray-900">{meta.label}</div>
                    <p className="mt-1 text-sm text-gray-600">{meta.blurb}</p>
                  </div>
                )
              })}
            </div>

            {/* Insurance */}
            {shop.insurance.length > 0 && (
              <>
                <h2 className="mt-10 flex items-center gap-2 text-xl font-bold text-gray-900">
                  <ShieldCheck width={20} height={20} className="text-green-600" />
                  Works with your insurance
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {shop.insurance.map((ins) => (
                    <span
                      key={ins}
                      className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700"
                    >
                      {ins}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-xl border border-gray-200 p-5">
                <a
                  href={telHref(shop.phone)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  <Phone width={18} height={18} /> {shop.phone}
                </a>
                <div className="mt-4 space-y-3 text-sm">
                  {shop.website && (
                    <a
                      href={shop.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-center gap-2 text-gray-600 hover:text-blue-600"
                    >
                      <Globe width={16} height={16} /> Visit website
                    </a>
                  )}
                  {shop.email && (
                    <a
                      href={`mailto:${shop.email}`}
                      className="flex items-center gap-2 text-gray-600 hover:text-blue-600"
                    >
                      <Mail width={16} height={16} /> {shop.email}
                    </a>
                  )}
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin width={16} height={16} className="mt-0.5 shrink-0" />
                    <span>
                      {shop.street}
                      <br />
                      {shop.city}, {shop.state.toUpperCase()} {shop.zip}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hours */}
              <div className="rounded-xl border border-gray-200 p-5">
                <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                  <Clock width={16} height={16} /> Hours
                </h3>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {shop.hours.map((h) => (
                    <li key={h.day} className="flex justify-between">
                      <span className="text-gray-500">{dayLabel(h.day)}</span>
                      <span className="font-medium text-gray-800">
                        {h.open && h.close
                          ? `${formatTime(h.open)} – ${formatTime(h.close)}`
                          : 'Closed'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {!shop.claimed && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm">
                  <p className="font-semibold text-blue-900">Is this your shop?</p>
                  <p className="mt-1 text-blue-800">
                    Claim this free listing to edit your details and add photos.
                  </p>
                  <Link
                    href={`/directory/claim?shop=${shop.slug}`}
                    className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                  >
                    Claim this listing
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-bold text-gray-900">
              More auto glass shops in {shop.city}
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((s) => (
                <ShopCard key={s.slug} shop={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
