import Link from 'next/link'
import { MapPin, Search, Truck, ShieldCheck, Star, ArrowRight } from 'lucide-react'
import {
  getFeaturedShops,
  getCitySummaries,
  getShopCount,
  getStateSummaries,
  SERVICES,
  cityHref,
} from '@/lib/directory/data'
import { ShopCard } from '@/components/directory/ShopCard'
import { HeroSearch } from '@/components/directory/HeroSearch'

export default function DirectoryHome() {
  const featured = getFeaturedShops(6)
  const cities = getCitySummaries()
  const states = getStateSummaries()
  const shopCount = getShopCount()

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-700 to-blue-600 px-4 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Find a trusted auto glass shop near you
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100">
            Compare {shopCount}+ local windshield repair, replacement, and mobile
            auto glass shops. Read reviews, check services, and call directly — no
            middleman.
          </p>
          <div className="mt-8">
            <HeroSearch states={states} />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-blue-100">
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
      <section className="bg-gray-900 px-4 py-16 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Own an auto glass shop?</h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-300">
            Get a free listing and start showing up when local drivers search for
            windshield repair. When you&apos;re ready to grow, we offer done-for-you
            SEO and Google Ads management built specifically for auto glass shops.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/directory/claim"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              <Search width={18} height={18} /> Add your shop — free
            </Link>
            <Link
              href="/directory/for-shops"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-6 py-3 font-semibold text-white hover:bg-gray-800"
            >
              See SEO &amp; ads services
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
