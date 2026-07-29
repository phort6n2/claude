'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, X, Plus, Minus, Crosshair, ArrowRight, Truck, Star } from 'lucide-react'
import { coverGradient } from './ShopCover'
import type { MapCityShop } from '@/app/api/directory/map/city/route'
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

const MAX_K = 40

interface City {
  key: string
  city: string
  state: string
  x: number
  y: number
  shops: MapPoint[]
}

function fitView(
  bounds: [number, number, number, number],
  w: number,
  h: number
): { k: number; x: number; y: number } {
  const [x0, y0, x1, y1] = bounds
  const dx = Math.max(x1 - x0, 1)
  const dy = Math.max(y1 - y0, 1)
  const k = Math.min(9, 0.85 / Math.max(dx / w, dy / h))
  return { k, x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}

/**
 * Shop thumbnail with a monogram fallback.
 *
 * Most photos are hotlinked from the shop's own website, so some will 404, be
 * hotlink-protected, or simply be slow. Hiding a broken image leaves an empty
 * box; falling back to the slug-derived gradient used by the shop cards keeps
 * every row looking deliberate.
 */
function ShopThumb({ slug, name, photo }: { slug: string; name: string; photo?: string }) {
  const [failed, setFailed] = useState(false)
  const initials = name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?'
  if (!photo || failed) {
    return (
      <span
        aria-hidden
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold tracking-wide text-white/90 ${coverGradient(slug)}`}
      >
        {initials}
      </span>
    )
  }
  return (
    <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </span>
  )
}

export function UsShopMap({ states, points, counts, width, height, embedded }: Props) {
  const [active, setActive] = useState<StateShape | null>(null)
  const [openCity, setOpenCity] = useState<string | null>(null)
  const [hoverState, setHoverState] = useState<string | null>(null)
  const [hoverCity, setHoverCity] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, MapCityShop[]>>({})
  const [view, setView] = useState({ k: 1, x: width / 2, y: height / 2 })
  const [animate, setAnimate] = useState(true)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const [pxPerUnit, setPxPerUnit] = useState(1)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => setPxPerUnit(el.getBoundingClientRect().width / width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  const max = useMemo(() => Math.max(1, ...Object.values(counts)), [counts])

  /**
   * The map's unit is the city, not the shop.
   *
   * Individual shop pins piled up in exactly the places with the most shops —
   * you could see there were shops in Los Angeles but not pick one. Cities are
   * separated by definition, they're what people search for, and a city marker
   * can say how many shops it holds before you click it.
   */
  const citiesByState = useMemo(() => {
    const byKey: Record<string, City> = {}
    for (const p of points) {
      const key = `${p.state}|${p.city}`
      const e = (byKey[key] ||= { key, city: p.city, state: p.state, x: 0, y: 0, shops: [] })
      e.shops.push(p)
    }
    const out: Record<string, City[]> = {}
    for (const c of Object.values(byKey)) {
      c.x = c.shops.reduce((t, s) => t + s.x, 0) / c.shops.length
      c.y = c.shops.reduce((t, s) => t + s.y, 0) / c.shops.length
      c.shops.sort((a, b) => a.name.localeCompare(b.name))
      ;(out[c.state] ||= []).push(c)
    }
    for (const list of Object.values(out)) list.sort((a, b) => b.shops.length - a.shops.length)
    return out
  }, [points])

  const cities = useMemo(
    () => (active ? citiesByState[active.state] ?? [] : []),
    [active, citiesByState]
  )
  const selected = useMemo(
    () => cities.find((c) => c.key === openCity) ?? null,
    [cities, openCity]
  )

  const u = useCallback(
    (px: number) => px / Math.max(pxPerUnit * view.k, 0.0001),
    [pxPerUnit, view.k]
  )

  /** Marker radius in screen px — area roughly tracks shop count. */
  const cityRadius = useCallback(
    (n: number) => Math.min(24, 8 + Math.sqrt(n) * 3),
    []
  )

  /**
   * Cities whose markers would overlap at this zoom are shown as one group.
   *
   * California has 79 cities and at state zoom the Bay Area and LA basin are a
   * pile of touching circles — the same "which one do I want" problem, moved up
   * a level. A group marker says how many cities are underneath and zooms in
   * when clicked; once they separate, they're ordinary city markers again.
   * Groups never open a card, so "click a city, get its shops" always holds.
   */
  const groups = useMemo(() => {
    const out: { key: string; x: number; y: number; members: City[] }[] = []
    for (const c of cities) {
      const r = u(cityRadius(c.shops.length))
      const hit = out.find((g) => {
        const gr = u(cityRadius(Math.max(...g.members.map((m) => m.shops.length))))
        return Math.hypot(g.x - c.x, g.y - c.y) < (r + gr) * 0.95
      })
      if (hit) {
        hit.members.push(c)
        hit.x = hit.members.reduce((t, m) => t + m.x, 0) / hit.members.length
        hit.y = hit.members.reduce((t, m) => t + m.y, 0) / hit.members.length
      } else {
        out.push({ key: c.key, x: c.x, y: c.y, members: [c] })
      }
    }
    return out
  }, [cities, u, cityRadius])

  const soloCities = useMemo(
    () => groups.filter((g) => g.members.length === 1).map((g) => g.members[0]),
    [groups]
  )

  /**
   * Which cities get a name next to them.
   *
   * Every city is clickable, but not every city can be labelled — California
   * has 79 and at state zoom their names overlap into mush. So: biggest first,
   * only those in view, four candidate positions each, and skip any that would
   * collide with a name already placed or with any marker. Fewer names that can
   * be read beats every name illegible.
   */
  const labels = useMemo(() => {
    if (!active) return []
    const halfW = width / 2 / view.k
    const halfH = height / 2 / view.k
    // Only cities standing on their own get a name; a group has no single name.
    const inView = soloCities.filter(
      (c) =>
        c.x >= view.x - halfW &&
        c.x <= view.x + halfW &&
        c.y >= view.y - halfH &&
        c.y <= view.y + halfH
    )
    const font = u(12)
    const markers = groups.map((c) => {
      const n = Math.max(...c.members.map((m) => m.shops.length))
      const d = u(cityRadius(n) * 2 + 4)
      return { x: c.x, y: c.y, w: d, h: d }
    })
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    const placed: { key: string; city: string; x: number; y: number }[] = []

    for (const c of inView) {
      if (placed.length >= 14) break
      const w = c.city.length * font * 0.58
      const h = font * 1.5
      const r = u(cityRadius(c.shops.length))
      // Own marker is what the label points at, so it isn't an obstacle.
      const others = markers.filter((m) => !(m.x === c.x && m.y === c.y))
      const side = r + u(6) + w / 2
      const offsets: [number, number][] = [
        [0, -(r + u(9))],
        [0, r + u(15)],
        [side, u(4)],
        [-side, u(4)],
      ]
      for (const [dx, dy] of offsets) {
        const x = c.x + dx
        const y = c.y + dy
        const clash = [...boxes, ...others].some(
          (o) => Math.abs(o.x - x) < (o.w + w) / 2 && Math.abs(o.y - y) < (o.h + h) / 2
        )
        if (clash) continue
        boxes.push({ x, y, w, h })
        placed.push({ key: c.key, city: c.city, x, y })
        break
      }
    }
    return placed
  }, [active, soloCities, groups, view, width, height, u, cityRadius])

  const openState = useCallback(
    (s: StateShape) => {
      setAnimate(true)
      setActive(s)
      setOpenCity(null)
      setView(fitView(s.bounds, width, height))
    },
    [width, height]
  )

  const reset = useCallback(() => {
    setAnimate(true)
    setActive(null)
    setOpenCity(null)
    setView({ k: 1, x: width / 2, y: height / 2 })
  }, [width, height])

  const zoomBy = useCallback((factor: number) => {
    setAnimate(true)
    setView((v) => ({ ...v, k: Math.min(MAX_K, Math.max(1, v.k * factor)) }))
  }, [])

  const recentre = useCallback(() => {
    if (!active) return
    setAnimate(true)
    setView(fitView(active.bounds, width, height))
  }, [active, width, height])

  // ---- panning ------------------------------------------------------------
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!active) return
    drag.current = { x: e.clientX, y: e.clientY, cx: view.x, cy: view.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true
    if (!d.moved) return
    const scale = Math.max(pxPerUnit * view.k, 0.0001)
    setAnimate(false)
    setView((v) => ({
      ...v,
      x: d.cx - (e.clientX - d.x) / scale,
      y: d.cy - (e.clientY - d.y) / scale,
    }))
  }
  function endDrag() {
    drag.current = null
  }

  /**
   * Closing the card shouldn't depend on hitting a small X. Escape and a click
   * on empty map both dismiss it — the two things people try first.
   */
  useEffect(() => {
    if (!openCity) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenCity(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCity])

  /**
   * Photos and services for the open city, fetched on demand.
   *
   * The map payload carries only what it needs to draw; enriching all 985 shops
   * would mean a website-meta lookup each. A card shows five or six shops, so
   * fetch those six when it opens and keep them for the session.
   */
  useEffect(() => {
    if (!selected || detail[selected.key]) return
    const key = selected.key
    const params = new URLSearchParams({
      state: selected.state,
      city: selected.shops[0].citySlug,
    })
    let live = true
    fetch(`/api/directory/map/city?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        // Empty array on failure, so rows fall back to plain names rather than
        // spinning forever.
        if (live) setDetail((d) => ({ ...d, [key]: j.shops ?? [] }))
      })
      .catch(() => {
        if (live) setDetail((d) => ({ ...d, [key]: [] }))
      })
    return () => {
      live = false
    }
  }, [selected, detail])

  /**
   * Stop the page scrolling behind the full-screen card on phones — otherwise
   * a flick meant for the shop list drags the whole page instead.
   */
  useEffect(() => {
    if (!openCity) return
    if (!window.matchMedia('(max-width: 639px)').matches) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [openCity])
  /** A drag that ends over a marker must not also open it. */
  const dragged = () => !!drag.current?.moved

  function fill(code: string): string {
    if (active?.state === code) return '#eef4ff'
    const n = counts[code] ?? 0
    if (!n) return '#f1f5f9'
    const t = Math.sqrt(n / max)
    return `hsl(214, 88%, ${92 - t * 45}%)`
  }

  const missing = active
    ? (counts[active.state] ?? 0) - cities.reduce((t, c) => t + c.shops.length, 0)
    : 0

  // Keep the card clear of its own marker: put it on the opposite side of the
  // map from whichever half the city sits in.
  // Card docks on whichever half of the map the city isn't, so it never covers
  // the marker you just clicked...
  const cardOnLeft = !!selected && selected.x > view.x
  const cardSide = cardOnLeft ? 'sm:left-3' : 'sm:right-3'
  // ...and the zoom controls move to the other side, since a full-height card
  // otherwise sits straight on top of them.
  const controlsSide = cardOnLeft ? 'sm:left-auto sm:right-3' : 'sm:left-3 sm:right-auto'

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
                ? `${cities.length} ${cities.length === 1 ? 'city' : 'cities'} with shops. Tap a city for its shops — larger circles cover several nearby cities, tap those to zoom in.`
                : 'Tap a state to zoom in and see the cities we cover.'}
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

      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`block h-auto w-full touch-none ${active ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onClick={() => {
            // Markers stopPropagation, so a click that reaches the svg is a
            // click on empty map. Ignore it if the pointer was dragging.
            if (!drag.current?.moved) setOpenCity(null)
          }}
          onPointerLeave={endDrag}
          role="img"
          aria-label={
            active
              ? `Map of cities with auto glass shops in ${active.name}`
              : 'Map of the United States. Select a state to see the cities we cover.'
          }
        >
          <g
            style={{
              transform: `translate(${width / 2}px, ${height / 2}px) scale(${view.k}) translate(${-view.x}px, ${-view.y}px)`,
              transition: animate ? 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
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
                    filter: hoverState === s.state && !active ? 'brightness(0.93)' : undefined,
                  }}
                  onClick={() => !active && openState(s)}
                  onMouseEnter={() => setHoverState(s.state)}
                  onMouseLeave={() => setHoverState(null)}
                >
                  <title>{`${s.name} — ${counts[s.state] ?? 0} shops`}</title>
                </path>
              )
            })}

            {/* Only cities that actually have shops are drawn, and every one of
                them is clickable. Nothing on the map is decorative. */}
            {groups.map((g) => {
              const solo = g.members.length === 1
              const c = g.members[0]
              const shops = g.members.reduce((t, m) => t + m.shops.length, 0)
              const on = solo && (openCity === c.key || hoverCity === c.key)
              const r = cityRadius(solo ? c.shops.length : shops)
              return (
                <g
                  key={g.key}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (dragged()) return
                    if (solo) {
                      setOpenCity((k) => (k === c.key ? null : c.key))
                      return
                    }
                    // A group is an instruction to zoom, never a card — the
                    // card always answers "shops in one named city".
                    setAnimate(true)
                    setOpenCity(null)
                    setView((v) => ({ k: Math.min(MAX_K, v.k * 2.4), x: g.x, y: g.y }))
                  }}
                  onMouseEnter={() => solo && setHoverCity(c.key)}
                  onMouseLeave={() => setHoverCity(null)}
                >
                  <circle
                    cx={g.x}
                    cy={g.y}
                    r={u(r + (on ? 3 : 0))}
                    fill={on ? '#1d4ed8' : '#2563eb'}
                    stroke="#fff"
                    strokeWidth={u(solo ? 2 : 3)}
                    opacity={solo ? 0.95 : 0.9}
                  >
                    <title>
                      {solo
                        ? `${c.city} — ${c.shops.length} shop${c.shops.length === 1 ? '' : 's'}`
                        : `${g.members.length} nearby cities, ${shops} shops — tap to zoom in`}
                    </title>
                  </circle>
                  <text
                    x={g.x}
                    y={g.y + u(4)}
                    textAnchor="middle"
                    fontSize={u(12)}
                    fill="#fff"
                    className="pointer-events-none select-none"
                    style={{ fontWeight: 700 }}
                  >
                    {shops}
                  </text>
                </g>
              )
            })}

            {/* Names drawn after every marker so nothing paints over them. */}
            {labels.map((l) => (
              <text
                key={l.key}
                x={l.x}
                y={l.y}
                textAnchor="middle"
                fontSize={u(12)}
                fill="#0f172a"
                stroke="#fff"
                strokeWidth={u(2.6)}
                paintOrder="stroke"
                className="pointer-events-none select-none"
                style={{ fontWeight: 600 }}
              >
                {l.city}
              </text>
            ))}
          </g>
        </svg>

        {/* The card sits on the map, as asked, and lists every shop in the city
            so nothing depends on hitting a specific dot. */}
        {selected && (
          <div
            /* Full screen on phones. Constrained to the map container it was
               capped at a couple of hundred pixels tall — a city with eight
               shops gave a scroll window barely two rows high. From sm up
               there's room for a side panel, placed on whichever half of the
               map the city isn't. */
            className={`fixed inset-0 z-50 flex flex-col overflow-hidden border-gray-200 bg-white sm:absolute sm:inset-auto sm:bottom-3 sm:top-3 sm:z-auto sm:w-80 sm:rounded-xl sm:border sm:shadow-xl ${cardSide}`}
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-4 py-4 sm:py-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-gray-900 sm:text-base">{selected.city}</p>
                <p className="text-xs text-gray-500">
                  {selected.shops.length} shop{selected.shops.length === 1 ? '' : 's'} ·{' '}
                  {selected.state.toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenCity(null)}
                aria-label={`Close ${selected.city} shops`}
                title="Close (Esc)"
                className="-m-1 shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <X width={20} height={20} />
              </button>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
              {selected.shops.map((s) => {
                const d = detail[selected.key]?.find((x) => x.slug === s.slug)
                return (
                  <li key={s.slug}>
                    <Link
                      href={`/directory/shop/${s.slug}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50"
                    >
                      <ShopThumb slug={s.slug} name={s.name} photo={d?.photo} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-gray-900 sm:text-sm">
                          {s.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                          {typeof d?.rating === 'number' && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                              <Star width={12} height={12} fill="currentColor" /> {d.rating}
                              {d.reviewCount ? ` (${d.reviewCount})` : ''}
                            </span>
                          )}
                          {d?.mobileService && (
                            <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                              <Truck width={12} height={12} /> Mobile
                            </span>
                          )}
                          {d?.street && <span className="truncate">{d.street}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <Link
              href={`/directory/${selected.state}/${selected.shops[0].citySlug}`}
              className="flex items-center justify-between border-t border-gray-100 px-4 py-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:py-2.5"
            >
              Compare shops in {selected.city} <ArrowRight width={15} height={15} />
            </Link>
          </div>
        )}

        {/* A vertical stack is tall enough to reach the bottom-sheet card on a
            phone-sized map, so the controls lie flat there instead. */}
        {active && (
          <div className={`absolute left-3 top-3 flex flex-row gap-1.5 sm:flex-col ${controlsSide}`}>
            <button
              type="button"
              onClick={() => zoomBy(1.7)}
              aria-label="Zoom in"
              className="rounded-lg border border-gray-300 bg-white/95 p-2 text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Plus width={16} height={16} />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.7)}
              aria-label="Zoom out"
              className="rounded-lg border border-gray-300 bg-white/95 p-2 text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Minus width={16} height={16} />
            </button>
            <button
              type="button"
              onClick={recentre}
              aria-label={`Re-centre on ${active.name}`}
              className="rounded-lg border border-gray-300 bg-white/95 p-2 text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Crosshair width={16} height={16} />
            </button>
          </div>
        )}
      </div>

      {/* Real links under the map: keyboard-navigable, crawlable, and a way
          through for anyone who'd rather not use the map at all. */}
      {active && cities.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">
            Cities we cover in {active.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setOpenCity(c.key)}
                onMouseEnter={() => setHoverCity(c.key)}
                onMouseLeave={() => setHoverCity(null)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  openCity === c.key
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {c.city}
                <span className="text-xs text-gray-400">{c.shops.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {active && missing > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {missing} {missing === 1 ? 'shop is' : 'shops are'} not on the map — we don&apos;t have
          exact coordinates for {missing === 1 ? 'it' : 'them'} yet.{' '}
          <Link href={`/directory/${active.state}`} className="font-semibold text-blue-700 hover:underline">
            See all {active.name} shops
          </Link>
        </p>
      )}

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
