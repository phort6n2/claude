import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Truck, ShieldCheck, Phone } from 'lucide-react'
import {
  getCitySummaries,
  getCitySummary,
  getShopsByCity,
} from '@/lib/directory/data'
import { ShopCard } from '@/components/directory/ShopCard'

export function generateStaticParams() {
  return getCitySummaries().map((c) => ({ state: c.state, city: c.citySlug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>
}): Promise<Metadata> {
  const { state, city } = await params
  const summary = getCitySummary(state, city)
  if (!summary) return { title: 'City not found' }
  const title = `Auto Glass Repair in ${summary.city}, ${summary.state.toUpperCase()}`
  return {
    title,
    description: `Compare ${summary.count} auto glass and windshield shops in ${summary.city}, ${summary.stateFull}. Windshield replacement, chip repair, ADAS calibration, and mobile service near you.`,
    alternates: { canonical: `/directory/${summary.state}/${summary.citySlug}` },
  }
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>
}) {
  const { state, city } = await params
  const summary = getCitySummary(state, city)
  if (!summary) notFound()

  const shops = getShopsByCity(summary.state, summary.city)
  const mobileCount = shops.filter((s) => s.mobileService).length

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/directory" className="hover:text-blue-600">
          Directory
        </Link>
        <span>/</span>
        <Link href={`/directory/${summary.state}`} className="hover:text-blue-600">
          {summary.stateFull}
        </Link>
        <span>/</span>
        <span className="text-gray-700">{summary.city}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">
        Auto glass &amp; windshield repair in {summary.city}, {summary.state.toUpperCase()}
      </h1>
      <p className="mt-2 max-w-3xl text-gray-600">
        {summary.count} local auto glass {summary.count === 1 ? 'shop' : 'shops'} in{' '}
        {summary.city} offering windshield replacement, rock chip repair, and ADAS
        camera calibration. {mobileCount > 0 && `${mobileCount} offer mobile service that comes to you.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
          <Truck width={14} height={14} /> {mobileCount} mobile
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">
          <ShieldCheck width={14} height={14} /> Insurance-approved
        </span>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shops.map((shop) => (
          <ShopCard key={shop.slug} shop={shop} />
        ))}
      </div>

      {/* Local SEO copy block */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-bold text-gray-900">
          Choosing an auto glass shop in {summary.city}
        </h2>
        <div className="prose prose-sm mt-3 text-gray-600">
          <p>
            A cracked or chipped windshield rarely stays small. In {summary.city},
            temperature swings and road debris can turn a coin-sized chip into a
            crack that spreads across your line of sight — and once damage reaches
            the edge of the glass or a driver&apos;s primary viewing area, repair is
            usually no longer an option and full replacement is required.
          </p>
          <p>
            When comparing the shops above, look for three things: whether they
            handle your insurance directly (most comprehensive policies cover glass),
            whether they offer <strong>mobile service</strong> so you don&apos;t have
            to drive on damaged glass, and whether they perform{' '}
            <strong>ADAS calibration</strong>. Any vehicle with lane-keep assist or
            automatic emergency braking needs its forward-facing camera recalibrated
            after a windshield replacement — skipping this step can leave safety
            systems misaligned.
          </p>
        </div>
      </section>

      <div className="mt-10 rounded-xl bg-gray-900 p-8 text-center text-white">
        <h2 className="text-xl font-bold">
          Run an auto glass shop in {summary.city}?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-gray-300">
          List your business here for free and get found by local drivers searching
          for windshield repair.
        </p>
        <Link
          href="/directory/claim"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          <Phone width={18} height={18} /> Add your shop — free
        </Link>
      </div>
    </div>
  )
}
