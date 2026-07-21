import Link from 'next/link'
import { MapPin, Truck, ShieldCheck, Star, ArrowRight } from 'lucide-react'
import {
  getAllShops,
  getFeaturedShops,
  getCitySummaries,
  getShopCount,
  getStateSummaries,
  SERVICES,
  cityHref,
} from '@/lib/directory/data'
import { HERO, OWNER_CTA } from '@/lib/directory/content'
import { ShopCard } from '@/components/directory/ShopCard'
import { HeroSearch } from '@/components/directory/HeroSearch'
import { CTASection } from '@/components/directory/CTASection'
import { NearYou } from '@/components/directory/NearYou'
import { enrichShops } from '@/lib/directory/photos'
import { withReviews } from '@/lib/directory/reviews'

// Refresh periodically so website hero images stay current.
export const revalidate = 3600

export default async function DirectoryHome() {
  const featured = await withReviews(await enrichShops(getFeaturedShops(6)))
  const nearShops = await withReviews(await enrichShops(getAllShops()))
  const cities = getCitySummaries()
  const states = getStateSummaries()
  const shopCount = getShopCount()

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-700 to-blue-600 px-4 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            {HERO.title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100">
            {HERO.subtitle}
          </p>
          <div className="mt-8">
            <HeroSearch states={states} />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-blue-100">
            <span className="inline-flex items-center gap-1.5">
              <MapPin width={16} height={16} /> {shopCount}+ shops listed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck width={16} height={16} /> Mobile service available
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck width={16} height={16} /> Insurance-approved shops
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Star width={16} height={16} /> Verified reviews
            </span>
          </div>
        </div>
      </section>

      {/* Near you — location-aware default (IP-based, upgradeable to GPS) */}
      <NearYou shops={nearShops} />

      {/* Services */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold text-gray-900">
          Browse by service
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SERVICES.map((s) => (
            <Link
              key={s.key}
              href={`/directory/search?service=${s.key}`}
              className="group rounded-xl border border-gray-200 p-4 text-center transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="text-sm font-semibold text-gray-800 group-hover:text-blue-700">
                {s.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured shops */}
      <section className="bg-gray-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Featured shops</h2>
              <p className="mt-1 text-gray-600">
                Top-rated auto glass providers across our coverage areas.
              </p>
            </div>
            <Link
              href="/directory/search"
              className="hidden items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 sm:inline-flex"
            >
              View all <ArrowRight width={16} height={16} />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((shop) => (
              <ShopCard key={shop.slug} shop={shop} />
            ))}
          </div>
        </div>
      </section>

      {/* Cities */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-gray-900">Popular cities</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cities.map((c) => (
            <Link
              key={`${c.state}-${c.citySlug}`}
              href={cityHref({ state: c.state, city: c.city })}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                <MapPin width={15} height={15} className="text-gray-400" />
                {c.city}, {c.state.toUpperCase()}
              </span>
              <span className="text-xs text-gray-400">{c.count}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Shop-owner CTA — this is the lead magnet */}
      <CTASection
        title={OWNER_CTA.title}
        description={OWNER_CTA.body}
        primary={{ label: OWNER_CTA.primary, href: '/directory/claim' }}
        secondary={{ label: OWNER_CTA.secondary, href: '/directory/for-shops' }}
      />
    </>
  )
}
