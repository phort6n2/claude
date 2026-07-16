'use client'

import { useEffect, useMemo, useState } from 'react'
import { Truck, Clock, SlidersHorizontal } from 'lucide-react'
import type { Shop, ServiceKey } from '@/lib/directory/types'
import { SERVICES } from '@/lib/directory/data'
import { openStatus } from '@/lib/directory/hours'
import { cn } from '@/lib/utils'
import { ShopCard } from './ShopCard'

type SortKey = 'rating' | 'reviews'

export function CityShopExplorer({ shops }: { shops: Shop[] }) {
  const [service, setService] = useState<ServiceKey | ''>('')
  const [mobileOnly, setMobileOnly] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('rating')
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => setNow(new Date()), [])

  const availableServices = useMemo(() => {
    const present = new Set<ServiceKey>()
    shops.forEach((s) => s.services.forEach((k) => present.add(k)))
    return SERVICES.filter((m) => present.has(m.key))
  }, [shops])

  const filtered = useMemo(() => {
    const list = shops.filter((s) => {
      if (service && !s.services.includes(service)) return false
      if (mobileOnly && !s.mobileService) return false
      if (openOnly && now && !openStatus(s.hours, now).open) return false
      return true
    })
    return list.sort((a, b) =>
      sort === 'reviews'
        ? (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
        : (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
    )
  }, [shops, service, mobileOnly, openOnly, sort, now])

  // Keyless Google Maps embed. A single-shop city pins the business; a
  // multi-shop city shows the city area. Stable (not tied to filters), so the
  // iframe doesn't reload as you filter the list.
  const mapSrc = useMemo(() => {
    const first = shops[0]
    if (!first) return null
    const q =
      shops.length === 1
        ? [first.name, first.street, `${first.city}, ${first.state.toUpperCase()} ${first.zip}`]
            .filter(Boolean)
            .join(', ')
        : `auto glass, ${first.city}, ${first.state.toUpperCase()}`
    const zoom = shops.length === 1 ? 14 : 11
    return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`
  }, [shops])

  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
    )

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500">
          <SlidersHorizontal width={15} height={15} /> Filter
        </span>
        <button type="button" onClick={() => setMobileOnly((v) => !v)} className={chip(mobileOnly)}>
          <Truck width={14} height={14} /> Mobile
        </button>
        <button type="button" onClick={() => setOpenOnly((v) => !v)} className={chip(openOnly)}>
          <Clock width={14} height={14} /> Open now
        </button>
        {availableServices.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setService((cur) => (cur === m.key ? '' : m.key))}
            className={chip(service === m.key)}
          >
            {m.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-500" htmlFor="city-sort">
            Sort
          </label>
          <select
            id="city-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="cursor-pointer rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none hover:border-gray-400"
          >
            <option value="rating">Top rated</option>
            <option value="reviews">Most reviewed</option>
          </select>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Showing {filtered.length} of {shops.length}{' '}
        {shops.length === 1 ? 'shop' : 'shops'}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Map */}
        <div className="order-first">
          {mapSrc && (
            <iframe
              src={mapSrc}
              title={`Map of auto glass shops in ${shops[0]?.city}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[320px] w-full rounded-2xl border border-gray-200 lg:sticky lg:top-20 lg:h-[560px]"
              style={{ border: 0 }}
            />
          )}
        </div>

        {/* List */}
        <div className="space-y-4">
          {filtered.map((s) => (
            <ShopCard key={s.slug} shop={s} />
          ))}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
              No shops match these filters.{' '}
              <button
                type="button"
                className="text-blue-600 hover:underline"
                onClick={() => {
                  setService('')
                  setMobileOnly(false)
                  setOpenOnly(false)
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
