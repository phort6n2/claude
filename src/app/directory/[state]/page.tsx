import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, ArrowRight } from 'lucide-react'
import {
  getStateSummaries,
  getShopsByState,
  cityHref,
} from '@/lib/directory/data'
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  jsonLdScript,
} from '@/lib/directory/seo'
import { ShopCard } from '@/components/directory/ShopCard'
import { enrichShops } from '@/lib/directory/photos'
import { withReviews } from '@/lib/directory/reviews'

export const revalidate = 3600

export function generateStaticParams() {
  return getStateSummaries().map((s) => ({ state: s.state }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>
}): Promise<Metadata> {
  const { state } = await params
  const summary = getStateSummaries().find((s) => s.state === state.toLowerCase())
  if (!summary) return { title: 'State not found' }
  const title = `Auto Glass & Windshield Shops in ${summary.stateFull}`
  return {
    title,
    description: `Find ${summary.count} auto glass and windshield repair shops across ${summary.stateFull}. Compare services, reviews, and mobile availability by city.`,
    alternates: { canonical: `/directory/${summary.state}` },
  }
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ state: string }>
}) {
  const { state } = await params
  const summary = getStateSummaries().find((s) => s.state === state.toLowerCase())
  if (!summary) notFound()

  const shops = await withReviews(await enrichShops(getShopsByState(summary.state)))
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Directory', path: '/directory' },
    { name: summary.stateFull, path: `/directory/${summary.state}` },
  ])
  const itemList = itemListJsonLd(shops)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }}
      />
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/directory" className="hover:text-blue-600">
          Directory
        </Link>
        <span>/</span>
        <span className="text-gray-700">{summary.stateFull}</span>
      </nav>

      <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-blue-600">
        Statewide
      </p>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">
        Auto glass shops in {summary.stateFull}
      </h1>
      <p className="mt-2 text-gray-600">
        {summary.count} windshield repair and replacement shops across{' '}
        {summary.cities.length}{' '}
        {summary.cities.length === 1 ? 'city' : 'cities'}.
      </p>

      {/* Cities in state */}
      <div className="mt-6 flex flex-wrap gap-2">
        {summary.cities.map((c) => (
          <Link
            key={c.citySlug}
            href={cityHref({ state: c.state, city: c.city })}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50"
          >
            <MapPin width={14} height={14} className="text-gray-400" />
            {c.city} <span className="text-gray-400">({c.count})</span>
            <ArrowRight width={13} height={13} className="text-gray-300" />
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shops.map((shop) => (
          <ShopCard key={shop.slug} shop={shop} />
        ))}
      </div>
    </div>
  )
}
