'use client'

import { useEffect, useMemo, useState } from 'react'
import { LocateFixed, Navigation } from 'lucide-react'
import type { Shop } from '@/lib/directory/types'
import { formatMiles } from '@/lib/directory/distance'
import { ShopCard } from './ShopCard'

interface NearState {
  loaded: boolean
  available: boolean
  precise: boolean
  location: string | null
  order: { slug: string; distance: number }[]
}

const EMPTY: NearState = {
  loaded: false,
  available: false,
  precise: false,
  location: null,
  order: [],
}

/**
 * "Auto glass shops near you" — the location-aware default.
 * On mount it uses Vercel's IP geolocation (no permission prompt). The
 * "Use my location" button upgrades to precise GPS coordinates. Renders
 * nothing until a usable location is found, so it never shows an empty shell.
 */
export function NearYou({ shops }: { shops: Shop[] }) {
  const [state, setState] = useState<NearState>(EMPTY)
  const [locating, setLocating] = useState(false)
  const bySlug = useMemo(
    () => Object.fromEntries(shops.map((s) => [s.slug, s])),
    [shops]
  )

  async function load(coords?: { lat: number; lng: number }) {
    try {
      const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : ''
      const res = await fetch(`/api/directory/near${qs}`)
      const json = await res.json()
      setState({
        loaded: true,
        available: !!json.available,
        precise: !!json.precise,
        location: json.location ?? null,
        order: Array.isArray(json.order) ? json.order : [],
      })
    } catch {
      setState((s) => ({ ...s, loaded: true }))
    }
  }

  useEffect(() => {
    load()
  }, [])

  function useMyLocation() {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        load({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  if (!state.loaded || !state.available) return null

  const nearest = state.order
    .map((o) => ({ shop: bySlug[o.slug], distance: o.distance }))
    .filter((x) => x.shop)
    .slice(0, 3)

  if (nearest.length === 0) return null

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Navigation width={20} height={20} className="text-blue-600" />
            Auto glass shops near {state.location ?? 'you'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {state.precise
              ? 'Sorted by distance from your location.'
              : 'Based on your approximate location.'}
          </p>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <LocateFixed width={16} height={16} />
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {nearest.map(({ shop, distance }) => (
          <div key={shop.slug}>
            <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-blue-700">
              <Navigation width={12} height={12} /> {formatMiles(distance)} away
            </div>
            <ShopCard shop={shop} />
          </div>
        ))}
      </div>
    </section>
  )
}
