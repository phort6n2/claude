'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Truck, Clock, SlidersHorizontal } from 'lucide-react'
import type { Shop, ServiceKey } from '@/lib/directory/types'
import { SERVICES } from '@/lib/directory/data'
import { openStatus } from '@/lib/directory/hours'
import { cn } from '@/lib/utils'
import { ShopCard } from './ShopCard'

type SortKey = 'rating' | 'reviews'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function CityShopExplorer({ shops }: { shops: Shop[] }) {
  const [service, setService] = useState<ServiceKey | ''>('')
  const [mobileOnly, setMobileOnly] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('rating')
  const [hovered, setHovered] = useState<string | null>(null)
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

  // ---- Leaflet map ----
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const L = useRef<any>(null)
  const markers = useRef<Record<string, any>>({})

  function pin(active: boolean) {
    const color = active ? '#1d4ed8' : '#2563eb'
    const size = active ? 42 : 30
    return L.current.divIcon({
      className: '',
      html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2.3" fill="white" stroke="none"/></svg>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
    })
  }

  function drawMarkers() {
    if (!L.current || !map.current) return
    Object.values(markers.current).forEach((m: any) => map.current.removeLayer(m))
    markers.current = {}
    const pts: [number, number][] = []
    filtered.forEach((s) => {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return
      const m = L.current
        .marker([s.lat, s.lng], { icon: pin(false) })
        .addTo(map.current)
        .bindPopup(
          `<strong>${s.name}</strong><br/><a href="/directory/shop/${s.slug}">View details →</a>`
        )
      m.on('mouseover', () => setHovered(s.slug))
      m.on('mouseout', () => setHovered(null))
      markers.current[s.slug] = m
      pts.push([s.lat, s.lng])
    })
    if (pts.length) map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 13 })
  }

  // init once
  useEffect(() => {
    let cancelled = false
    import('leaflet').then((mod) => {
      const leaflet = (mod as any).default ?? mod
      if (cancelled || !mapEl.current || map.current) return
      L.current = leaflet
      map.current = leaflet
        .map(mapEl.current, { scrollWheelZoom: false })
        .setView([39.5, -98.35], 4)
      leaflet
        .tileLayer('https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap · © CARTO',
          subdomains: 'abcd',
          maxZoom: 20,
        })
        .addTo(map.current)
      drawMarkers()
      // Leaflet renders blank if the container was sized after init — force a
      // recalculation once layout settles.
      setTimeout(() => map.current && map.current.invalidateSize(), 200)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // redraw on filter change
  useEffect(() => {
    drawMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  // reflect hover state on pins
  useEffect(() => {
    if (!L.current) return
    Object.entries(markers.current).forEach(([slug, m]: [string, any]) => {
      m.setIcon(pin(slug === hovered))
      m.setZIndexOffset(slug === hovered ? 1000 : 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered])

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
        <button
          type="button"
          onClick={() => setMobileOnly((v) => !v)}
          className={chip(mobileOnly)}
        >
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
          <div
            ref={mapEl}
            className="isolate h-[320px] w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 lg:sticky lg:top-20 lg:h-[560px]"
            style={{ zIndex: 0 }}
          />
        </div>

        {/* List */}
        <div className="space-y-4">
          {filtered.map((s) => (
            <div
              key={s.slug}
              onMouseEnter={() => setHovered(s.slug)}
              onMouseLeave={() => setHovered(null)}
            >
              <ShopCard
                shop={s}
                className={cn(
                  'transition-shadow',
                  hovered === s.slug && 'border-blue-400 ring-2 ring-blue-400'
                )}
              />
            </div>
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
