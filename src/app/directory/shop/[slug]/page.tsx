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
  Navigation,
  Award,
  Trophy,
} from 'lucide-react'
import {
  getAllShops,
  getShopBySlug,
  getRelatedShops,
  cityHasFoundingMember,
  serviceMeta,
  cityHref,
  shopHref,
} from '@/lib/directory/data'
import {
  autoRepairJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
  jsonLdScript,
} from '@/lib/directory/seo'
import { GENERAL_AUTO_GLASS_FAQS } from '@/lib/directory/faqs'
import { dayLabel, formatTime, telHref, directionsHref } from '@/lib/directory/format'
import { StarRating } from '@/components/directory/StarRating'
import { ShopCard } from '@/components/directory/ShopCard'
import { ShopPhoto } from '@/components/directory/ShopPhoto'
import { ShopHero } from '@/components/directory/ShopHero'
import { ShopMap } from '@/components/directory/ShopMap'
import { SocialLinks } from '@/components/directory/SocialLinks'
import { ExternalLink } from 'lucide-react'
import { OpenNow } from '@/components/directory/OpenNow'
import { StickyCallBar } from '@/components/directory/StickyCallBar'
import { QuoteForm } from '@/components/directory/QuoteForm'
import { IndependentBadge } from '@/components/directory/IndependentBadge'
import { enrichShop } from '@/lib/directory/photos'
import { applyOwnerProfile } from '@/lib/directory/profiles'
import { getReview, withReviews, googlePlaceUrl } from '@/lib/directory/reviews'
import { GoogleReviews } from '@/components/directory/GoogleReviews'
import { hydratePaidFeatured } from '@/lib/directory/featured'

// Rebuild periodically so newly uploaded owner photos appear.
export const revalidate = 300

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

export default async function ShopDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const baseShop = getShopBySlug(slug)
  if (!baseShop) notFound()

  await hydratePaidFeatured()

  // Auto-detect from the website, then let the owner's saved overrides win.
  const shop = await applyOwnerProfile(await enrichShop(baseShop))
  // Live Google rating + count (no-op without an API key). Feeds the inline
  // StarRating and the sidebar reviews widget.
  const review = await getReview(shop)
  if (review) {
    shop.rating = review.rating
    shop.reviewCount = review.count
    // Backfill hours from the shop's Google Business Profile when we don't
    // already have curated hours on file.
    if (review.hours && shop.hours.length === 0) shop.hours = review.hours
  }
  const photos = shop.photos ?? []
  const foundingAvailable = !cityHasFoundingMember(shop)
  const mapQuery = [
    shop.name,
    shop.street,
    `${shop.city}, ${shop.state.toUpperCase()} ${shop.zip}`,
  ]
    .filter(Boolean)
    .join(', ')
  const related = await withReviews(getRelatedShops(shop, 3))
  const autoRepair = autoRepairJsonLd(shop)
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Directory', path: '/directory' },
    { name: shop.stateFull, path: `/directory/${shop.state}` },
    { name: shop.city, path: cityHref(shop) },
    { name: shop.name, path: shopHref(shop) },
  ])
  const faq = faqPageJsonLd(GENERAL_AUTO_GLASS_FAQS.slice(0, 5))

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(autoRepair) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faq) }}
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

      {/* Hero — business name over an uploaded photo or a branded cover */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <ShopHero shop={shop} photo={photos[0]} />
        {photos.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {photos.slice(1, 6).map((url) => (
              <div
                key={url}
                className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200"
              >
                <ShopPhoto src={url} alt={shop.name} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pb-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main column */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Link
                href={cityHref(shop)}
                className="inline-flex items-center gap-1.5 text-gray-600 hover:text-blue-600"
              >
                <MapPin width={16} height={16} />
                {shop.street ? `${shop.street}, ` : ''}
                {shop.city}, {shop.state.toUpperCase()} {shop.zip}
              </Link>
              {shop.claimed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                  <BadgeCheck width={15} height={15} /> Verified listing
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {shop.client && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-sm font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                  <Trophy width={15} height={15} className="text-amber-500" /> Featured partner
                </span>
              )}
              <IndependentBadge />
              {shop.rating != null && (
                <span className="inline-flex items-center gap-1.5">
                  <StarRating rating={shop.rating} reviewCount={shop.reviewCount} size={18} />
                  <span className="text-xs text-gray-400">on Google</span>
                </span>
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
              <OpenNow hours={shop.hours} />
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

            {/* Certifications */}
            {shop.certifications && shop.certifications.length > 0 && (
              <>
                <h2 className="mt-10 flex items-center gap-2 text-xl font-bold text-gray-900">
                  <Award width={20} height={20} className="text-blue-600" />
                  Certifications &amp; training
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {shop.certifications.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700"
                    >
                      <Award width={14} height={14} className="text-blue-500" /> {c}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Location + directions */}
            <h2 className="mt-10 flex items-center gap-2 text-xl font-bold text-gray-900">
              <MapPin width={20} height={20} className="text-blue-600" />
              Location
            </h2>
            <div className="mt-4 h-64 overflow-hidden rounded-xl border border-gray-200">
              <ShopMap query={mapQuery} name={shop.name} />
            </div>
            <a
              href={directionsHref(shop)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Navigation width={16} height={16} /> Get directions
            </a>

            {/* Deep links to the business's own pages (owner-provided on claim) */}
            {shop.links && shop.links.length > 0 && (
              <>
                <h2 className="mt-10 flex items-center gap-2 text-xl font-bold text-gray-900">
                  <ExternalLink width={20} height={20} className="text-blue-600" />
                  More from {shop.name}
                </h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {shop.links.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                    >
                      {l.label}
                      <ExternalLink width={15} height={15} className="shrink-0 text-gray-400" />
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* FAQ — in the main column so it fills the space beside the
                taller sidebar (no gap under the map). */}
            <section className="mt-10">
              <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
                Good to know
              </p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">
                Auto glass questions, answered
              </h2>
              <dl className="mt-5 space-y-6">
                {GENERAL_AUTO_GLASS_FAQS.slice(0, 5).map((f) => (
                  <div key={f.q}>
                    <dt className="font-semibold text-gray-900">{f.q}</dt>
                    <dd className="mt-1 text-gray-600">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
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
                      {shop.street && (
                        <>
                          {shop.street}
                          <br />
                        </>
                      )}
                      {shop.city}, {shop.state.toUpperCase()} {shop.zip}
                    </span>
                  </div>
                  <a
                    href={directionsHref(shop)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Navigation width={16} height={16} /> Get directions
                  </a>
                </div>
              </div>

              {/* Live Google rating + count */}
              {review && (
                <GoogleReviews
                  rating={review.rating}
                  count={review.count}
                  url={googlePlaceUrl(review.placeId)}
                />
              )}

              {/* Lead capture — free quote request straight to the shop */}
              <QuoteForm
                shopSlug={shop.slug}
                shopName={shop.name}
                services={shop.services}
              />

              {/* Social profiles (auto-discovered from the website) */}
              {shop.socials && shop.socials.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-5">
                  <SocialLinks socials={shop.socials} />
                </div>
              )}

              {/* Hours */}
              <div className="rounded-xl border border-gray-200 p-5">
                <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                  <Clock width={16} height={16} /> Hours
                </h3>
                {shop.hours.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">
                    Call to confirm hours.
                  </p>
                ) : (
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
                )}
              </div>

              {shop.claimed ? (
                <div className="rounded-xl border border-gray-200 p-5 text-sm">
                  <p className="font-semibold text-gray-900">Own this business?</p>
                  <p className="mt-1 text-gray-600">
                    Manage your listing, add photos, and keep your details current.
                  </p>
                  <Link
                    href="/directory/owner"
                    className="mt-3 inline-block rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Manage this listing
                  </Link>
                </div>
              ) : (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm">
                  {foundingAvailable ? (
                    <>
                      <p className="flex items-center gap-1.5 font-semibold text-blue-900">
                        <Trophy width={16} height={16} className="text-amber-500" /> Founding offer
                        for {shop.city}
                      </p>
                      <p className="mt-1 text-blue-800">
                        We feature one <strong>founding member</strong> per city. Claim this free
                        listing now to become {shop.city}&apos;s founding member — priority
                        placement, exclusive quote leads sent straight to you, and your photos —
                        before a competitor does.
                      </p>
                      <Link
                        href={`/directory/claim?shop=${shop.slug}`}
                        className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                      >
                        Claim {shop.city}&apos;s founding spot — free
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-blue-900">Is this your shop?</p>
                      <p className="mt-1 text-blue-800">
                        Claim this free listing to edit your details, add photos, and get exclusive
                        quote leads sent straight to you.
                      </p>
                      <Link
                        href={`/directory/claim?shop=${shop.slug}`}
                        className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                      >
                        Claim this listing — free
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-14">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
              Nearby
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">
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

      <StickyCallBar phone={shop.phone} />
    </>
  )
}
