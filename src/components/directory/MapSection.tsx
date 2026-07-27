'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Map as MapIcon, ArrowRight } from 'lucide-react'
import { UsShopMap } from './UsShopMap'
import type { StateShape, MapPoint } from '@/lib/directory/usmap'

interface Data {
  states: StateShape[]
  points: MapPoint[]
  counts: Record<string, number>
}

/**
 * Homepage map. Geometry is ~310 KB, so it is fetched on first scroll into view
 * rather than shipped with the page — the homepage HTML stays as light as it
 * was before the map existed, and a visitor who never scrolls this far never
 * pays for it.
 *
 * The state links underneath are server-rendered by the parent and always
 * present, so navigation by location works with or without the map.
 */
export function MapSection({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // rootMargin starts the fetch just before it's visible, so the map is
    // usually painted by the time it scrolls in.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        fetch('/api/directory/map')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then(setData)
          .catch(() => setFailed(true))
      },
      { rootMargin: '400px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref}>
      {data ? (
        <UsShopMap
          states={data.states}
          points={data.points}
          counts={data.counts}
          width={width}
          height={height}
          embedded
        />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div
            className="flex items-center justify-center rounded-xl bg-gray-50"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            {failed ? (
              <Link
                href="/directory/map"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
              >
                <MapIcon width={16} height={16} /> Open the full map{' '}
                <ArrowRight width={15} height={15} />
              </Link>
            ) : (
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <MapIcon width={16} height={16} className="animate-pulse" /> Loading map…
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
