import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import {
  searchShops,
  getStateSummaries,
  SERVICES,
  serviceLabel,
} from '@/lib/directory/data'
import type { ServiceKey } from '@/lib/directory/types'
import { ShopCard } from '@/components/directory/ShopCard'
import { SearchFilters } from '@/components/directory/SearchFilters'
import { enrichShops } from '@/lib/directory/photos'
import { withReviews } from '@/lib/directory/reviews'

export const metadata: Metadata = {
  title: 'Search Auto Glass Shops',
  description:
    'Search local auto glass and windshield repair shops by city, service, and mobile availability.',
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const get = (k: string) => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  }

  const q = get('q')
  const state = get('state')
  const serviceParam = get('service')
  const service = SERVICES.some((s) => s.key === serviceParam)
    ? (serviceParam as ServiceKey)
    : undefined
  const mobileOnly = get('mobile') === '1'

  const results = await withReviews(
    await enrichShops(searchShops({ q, state, service, mobileOnly }))
  )
  const states = getStateSummaries()

  const activeLabel = [
    q && `“${q}”`,
    service && serviceLabel(service),
    state && states.find((s) => s.state === state)?.stateFull,
    mobileOnly && 'mobile service',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Find an auto glass shop</h1>
      <p className="mt-1 text-gray-600">
        {results.length} {results.length === 1 ? 'result' : 'results'}
        {activeLabel && <span className="text-gray-400"> — {activeLabel}</span>}
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <SearchFilters
            states={states}
            services={SERVICES}
            initial={{ q, state, service, mobileOnly }}
          />
        </div>

        <div className="lg:col-span-3">
          {results.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {results.map((shop) => (
                <ShopCard key={shop.slug} shop={shop} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
              <SearchX width={40} height={40} className="text-gray-300" />
              <p className="mt-4 font-medium text-gray-700">No shops matched</p>
              <p className="mt-1 text-sm text-gray-500">
                Try widening your filters or{' '}
                <Link href="/directory/search" className="text-blue-600 hover:underline">
                  clear all
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
