import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllShops, getStateSummaries, citySlug } from '@/lib/directory/data'
import { hydrateDirectory } from '@/lib/directory/listings'
import {
  getStateShapes,
  projectPoint,
  MAP_WIDTH,
  MAP_HEIGHT,
  type MapPoint,
} from '@/lib/directory/usmap'
import { UsShopMap } from '@/components/directory/UsShopMap'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Auto Glass Shop Map — Browse by State',
  description:
    'An interactive map of independent auto glass and windshield repair shops across the United States. Select a state to see individual shops and open their listings.',
  alternates: { canonical: '/directory/map' },
}

export default async function MapPage() {
  await hydrateDirectory()
  const shops = getAllShops()
  const states = getStateShapes()

  // Counts cover every shop; points cover only the ones we can place. Keeping
  // them separate is what lets the map say "3 shops aren't pinned" instead of
  // quietly under-reporting a state.
  const counts: Record<string, number> = {}
  for (const s of shops) counts[s.state] = (counts[s.state] ?? 0) + 1

  const points: MapPoint[] = []
  for (const s of shops) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue
    const p = projectPoint(s.lat, s.lng)
    if (!p) continue
    points.push({
      slug: s.slug,
      name: s.name,
      city: s.city,
      citySlug: citySlug(s.city),
      state: s.state,
      x: p[0],
      y: p[1],
    })
  }

  // Count only places the map can actually draw. getStateSummaries() counts
  // every distinct `state` value in the data, which currently includes a
  // Canadian listing — "52 states" would be wrong on the face of the page.
  const drawable = new Set(states.map((s) => s.state))
  const covered = getStateSummaries().filter((s) => drawable.has(s.state))
  const stateCount = covered.filter((s) => s.state !== 'dc').length
  const hasDc = covered.some((s) => s.state === 'dc')

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/directory" className="hover:text-blue-700">
          Directory
        </Link>{' '}
        <span className="mx-1">/</span> Map
      </nav>

      <h1 className="text-3xl font-bold text-gray-900">Auto glass shops by state</h1>
      <p className="mt-2 max-w-2xl text-gray-600">
        {shops.length.toLocaleString()} independent shops across {stateCount} states
        {hasDc ? ' and Washington, D.C' : ''}. Select a state to see the cities we cover there, then
        tap a city for the shops in it.
      </p>

      <div className="mt-10">
        <UsShopMap
          states={states}
          points={points}
          counts={counts}
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
        />
      </div>
    </div>
  )
}
