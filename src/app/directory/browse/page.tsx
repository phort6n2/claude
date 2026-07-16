import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { getStateSummaries, cityHref } from '@/lib/directory/data'

export const metadata: Metadata = {
  title: 'Browse Auto Glass Shops by City & State',
  description:
    'Browse the full directory of auto glass and windshield repair shops by state and city.',
}

export default function BrowsePage() {
  const states = getStateSummaries()

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">Browse by location</h1>
      <p className="mt-2 text-gray-600">
        Find auto glass shops in every city we cover.
      </p>

      <div className="mt-10 space-y-10">
        {states.map((state) => (
          <div key={state.state}>
            <h2 className="flex items-center gap-2 border-b border-gray-200 pb-2 text-xl font-bold text-gray-900">
              <Link href={`/directory/${state.state}`} className="hover:text-blue-600">
                {state.stateFull}
              </Link>
              <span className="text-sm font-normal text-gray-400">
                {state.count} shops
              </span>
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {state.cities.map((c) => (
                <Link
                  key={c.citySlug}
                  href={cityHref({ state: c.state, city: c.city })}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                    <MapPin width={15} height={15} className="text-gray-400" />
                    {c.city}
                  </span>
                  <span className="text-xs text-gray-400">{c.count}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
