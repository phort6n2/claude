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
  // Rotate the featured set each hour (matches revalidate) so all featured
  // shops get homepage time, not just the top 9.
  const rotation = Math.floor(Date.now() / 3_600_000)
  const featured = await withReviews(await enrichShops(getFeaturedShops(9, rotation)))
  const nearShops = await withReviews(await enrichShops(getAllShops()))
  const cities = getCitySummaries()
  const states = getStateSummaries()
  const shopCount = getShopCount()

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-blue-800 px-4 py-20 text-white sm:py-28">
        {/* Depth: base gradient */}
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-gradient-to-b from-blue-800 via-blue-700 to-blue-600"
        />
        {/* Depth: layered radial glows (top focal + corners) */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, rgba(56,189,248,0.35), transparent 70%), radial-gradient(40% 40% at 85% 15%, rgba(37,99,235,0.45), transparent 70%), radial-gradient(45% 45% at 12% 88%, rgba(29,78,216,0.5), transparent 70%)',
          }}
        />
        {/* Depth: subtle glass-grid motif, faded toward the edges */}
        <svg
          aria-hidden
          className="absolute inset-0 -z-10 h-full w-full opacity-[0.07]"
          style={{
            maskImage: 'radial-gradient(80% 60% at 50% 20%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(80% 60% at 50% 20%, black, transparent)',
          }}
        >
          <defs>
            <pattern id="glassgrid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#glassgrid)" />
        </svg>

        <div className="mx-auto max-w-3xl text-center">
          {/* Eyebrow */}
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-blue-50 ring-1 ring-inset ring-white/20 backdrop-blur">
              <ShieldCheck width={15} height={15} className="text-cyan-300" />
              Free directory · independent shops in all 50 states
            </span>
          </div>

          <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Find a trusted auto glass shop{' '}
            <span className="bg-gradient-to-r from-cyan-200 to-white bg-clip-text text-transparent">
              near you
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-blue-50/90">
            {HERO.subtitle}
          </p>

          {/* Elevated search with a soft glow behind it */}
          <div className="relative mx-auto mt-9 max-w-2xl">
            <div
              aria-hidden
              className="absolute -inset-x-6 -inset-y-3 -z-10 rounded-[2rem] bg-cyan-400/20 blur-2xl"
            />
            <HeroSearch states={states} />
            <p className="mt-3 text-sm text-blue-100/80">
              Free to search · no account needed.
            </p>
          </div>

          {/* Trust chips */}
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-2.5 text-sm">
            {[
              { icon: MapPin, label: `${shopCount}+ shops listed` },
              { icon: Truck, label: 'Mobile service available' },
              { icon: ShieldCheck, label: 'Insurance-approved shops' },
              { icon: Star, label: 'Real Google reviews' },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 font-medium text-blue-50 ring-1 ring-inset ring-white/15 backdrop-blur"
              >
                <Icon width={15} height={15} className="text-cyan-300" />
                {label}
              </li>
            ))}
          </ul>

          {/* Truthful confidence strip */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-blue-100/80">
            <span>
              <span className="font-semibold text-white">Independent</span> &amp; locally owned
            </span>
            <span aria-hidden className="hidden h-4 w-px bg-white/20 sm:block" />
            <span>
              Covering all <span className="font-semibold text-white">50 states + DC</span>
            </span>
            <span aria-hidden className="hidden h-4 w-px bg-white/20 sm:block" />
            <span>
              <span className="font-semibold text-white">Free</span> forever
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
          {/* 3 on mobile, 6 on tablet, 9 on desktop — clean rows at each size. */}
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((shop, i) => (
              <div
                key={shop.slug}
                className={i >= 6 ? 'hidden lg:block' : i >= 3 ? 'hidden sm:block' : ''}
              >
                <ShopCard shop={shop} />
              </div>
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
        eyebrow="For shop owners"
        title={OWNER_CTA.title}
        description={OWNER_CTA.body}
        primary={{ label: OWNER_CTA.primary, href: '/directory/claim' }}
        secondary={{ label: OWNER_CTA.secondary, href: '/directory/for-shops' }}
      />
    </>
  )
}
