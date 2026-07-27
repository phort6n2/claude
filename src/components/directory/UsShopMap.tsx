'use client'

import { useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { MapPin, ArrowLeft, X } from 'lucide-react'
import type { StateShape, MapPoint } from '@/lib/directory/usmap'

interface Props {
  states: StateShape[]
  points: MapPoint[]
  /** Shops per state, including those we couldn't geocode. */
  counts: Record<string, number>
  width: number
  height: number
  /**
   * Set when the surrounding page already supplies a heading and a state list
   * (the homepage does). Suppresses both so they aren't said twice — but keeps
   * the state name and the back button once a state is open, since those are
   * the only way to tell where you are and how to get out.
   */
  embedded?: boolean
}

/** Zoom is applied as a transform on a <g>, so CSS can animate it — the SVG
 *  viewBox attribute is not reliably transitionable. */
function zoomFor(
  bounds: [number, number, number, number],
  w: number,
  h: number
): { k: number; x: number; y: number } {
  const [x0, y0, x1, y1] = bounds
  const dx = Math.max(x1 - x0, 1)
  const dy = Math.max(y1 - y0, 1)
  // Cap the zoom so a small state (Rhode Island, DC) doesn't fill the frame at
  // an absurd scale where the outline is all you can see.
  const k = Math.min(9, 0.85 / Math.max(dx / w, dy / h))
  return { k, x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}

export function UsShopMap({ states, points, counts, width, height, embedded }: Props) {
  const [active, setActive] = useState<StateShape | null>(null)
  const [selected, setSelected] = useState<MapPoint | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const max = useMemo(
    () => Math.max(1, ...Object.values(counts)),
    [counts]
  )
  const byState = useMemo(() => {
    const m: Record<string, MapPoint[]> = {}
    for (const p of points) (m[p.state] ||= []).push(p)
    return m
  }, [points])

  const view = active
    ? zoomFor(active.bounds, width, height)
    : { k: 1, x: width / 2, y: height / 2 }

  const open = useCallback((s: StateShape) => {
    setActive(s)
    setSelected(null)
  }, [])

  const reset = useCallback(() => {
    setActive(null)
    setSelected(null)
  }, [])

  // Shade by shop count. Pale but never white, so a state with one shop still
  // reads as covered rather than as a hole in the map.
  function fill(code: string): string {
    // The zoomed state goes pale: its shade already told the story on the way
    // in, and a dense state like Texas is dark enough that blue pins on top of
    // it are almost invisible.
    if (active?.state === code) return '#eef4ff'
    const n = counts[code] ?? 0
    if (!n) return '#f1f5f9'
    const t = Math.sqrt(n / max) // sqrt — a few dense states would flatten linear
    const light = 92 - t * 45
    return `hsl(214, 88%, ${light}%)`
  }

  const visible = active ? byState[active.state] ?? [] : []
  const missing = active ? (counts[active.state] ?? 0) - visible.length : 0

  return (
    <div className="relative">
      {(!embedded || active) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {active ? active.name : 'Auto glass shops across the US'}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {active
                ? `${counts[active.state] ?? 0} shop${(counts[active.state] ?? 0) === 1 ? '' : 's'} — tap a pin for details`
                : 'Tap a state to zoom in and see individual shops.'}
            </p>
          </div>
          {active && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft width={15} height={15} /> All states
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={
            active
              ? `Map of auto glass shops in ${active.name}`
              : 'Map of the United States. Select a state to see its shops.'
          }
        >
          <g
            style={{
              transform: `translate(${width / 2}px, ${height / 2}px) scale(${view.k}) translate(${-view.x}px, ${-view.y}px)`,
              transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {states.map((s) => {
              const isActive = active?.state === s.state
              const dim = !!active && !isActive
              return (
                <path
                  key={s.state}
                  d={s.d}
                  fill={fill(s.state)}
                  stroke="#fff"
                  strokeWidth={active ? 0.5 / view.k : 0.75}
                  opacity={dim ? 0.25 : 1}
                  className={active ? '' : 'cursor-pointer'}
                  style={{
                    transition: 'opacity 400ms, fill 200ms',
                    filter: hover === s.state && !active ? 'brightness(0.93)' : undefined,
                  }}
                  onClick={() => !active && open(s)}
                  onMouseEnter={() => setHover(s.state)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${s.name} — ${counts[s.state] ?? 0} shops`}</title>
                </path>
              )
            })}

            {visible.map((p) => {
              const on = selected?.slug === p.slug
              return (
                <g
                  key={p.slug}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(p)
                  }}
                >
                  {/* Generous invisible hit area — the visible dot is ~3px on
                      screen and would be unusable on touch otherwise. */}
                  <circle cx={p.x} cy={p.y} r={9 / view.k} fill="transparent" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={(on ? 5.5 : 3.5) / view.k}
                    fill={on ? '#1d4ed8' : '#2563eb'}
                    stroke="#fff"
                    strokeWidth={1.2 / view.k}
                  >
                    <title>{`${p.name} — ${p.city}`}</title>
                  </circle>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Detail card for the selected pin. */}
      {selected && (
        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
              <MapPin width={13} height={13} /> {selected.city}, {selected.state.toUpperCase()}
            </p>
            <p className="mt-1 truncate text-lg font-bold text-gray-900">{selected.name}</p>
            <Link
              href={`/directory/shop/${selected.slug}`}
              className="mt-1 inline-block text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              View listing →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-600"
          >
            <X width={18} height={18} />
          </button>
        </div>
      )}

      {active && missing > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {missing} {missing === 1 ? 'shop is' : 'shops are'} not pinned — we don&apos;t have exact
          coordinates for {missing === 1 ? 'it' : 'them'} yet.{' '}
          <Link href={`/directory/${active.state}`} className="font-semibold text-blue-700 hover:underline">
            See all {active.name} shops
          </Link>
        </p>
      )}

      {/* Real links, so the map is navigable without a pointer and crawlers can
          follow it. Visible as a state list under the map when zoomed out. */}
      {!active && !embedded && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900">Or jump straight to a state</h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {states
              .filter((s) => (counts[s.state] ?? 0) > 0)
              .map((s) => (
                <Link
                  key={s.state}
                  href={`/directory/${s.state}`}
                  className="text-sm text-gray-600 hover:text-blue-700 hover:underline"
                >
                  {s.name} <span className="text-xs text-gray-400">{counts[s.state]}</span>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
