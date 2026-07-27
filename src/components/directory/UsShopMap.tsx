'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { MapPin, ArrowLeft, X, Plus, Minus, Crosshair } from 'lucide-react'
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

// Two shops closer than this on screen can't be told apart, let alone tapped
// individually, so they group into one cluster bubble instead.
const CLUSTER_PX = 22
// Radius of the fan when a cluster is opened in place.
const SPIDER_PX = 46
const MAX_K = 80

interface Cluster {
  id: string
  x: number
  y: number
  members: MapPoint[]
  /** Largest gap between members, in map units — zero when they're stacked. */
  spread: number
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
 * Group points that would land on top of each other at the current zoom.
 *
 * Greedy single-pass rather than a proper hierarchy: a state holds at most a
 * couple of hundred pins, and the clusters need to be recomputed on every zoom
 * step, so predictable and cheap beats optimal.
 */
function clusterPoints(pts: MapPoint[], radius: number): Cluster[] {
  const out: Cluster[] = []
  for (const p of pts) {
    const hit = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) <= radius)
    if (hit) {
      hit.members.push(p)
      // Re-centre on the mean so the bubble sits among its members.
      hit.x = hit.members.reduce((t, m) => t + m.x, 0) / hit.members.length
      hit.y = hit.members.reduce((t, m) => t + m.y, 0) / hit.members.length
    } else {
      out.push({ id: p.slug, x: p.x, y: p.y, members: [p], spread: 0 })
    }
  }
  for (const c of out) {
    let s = 0
    for (const m of c.members) s = Math.max(s, Math.hypot(m.x - c.x, m.y - c.y))
    c.spread = s
  }
  return out
}

export function UsShopMap({ states, points, counts, width, height, embedded }: Props) {
  const [active, setActive] = useState<StateShape | null>(null)
  const [selected, setSelected] = useState<MapPoint | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [hoverShop, setHoverShop] = useState<string | null>(null)
  const [spider, setSpider] = useState<string | null>(null)
  const [view, setView] = useState({ k: 1, x: width / 2, y: height / 2 })
  const [animate, setAnimate] = useState(true)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  // Rendered pixels per map unit at k=1. Needed to turn "22 px apart on screen"
  // into map units, which is the only space the SVG understands.
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
  const byState = useMemo(() => {
    const m: Record<string, MapPoint[]> = {}
    for (const p of points) (m[p.state] ||= []).push(p)
    return m
  }, [points])

  const visible = useMemo(
    () => (active ? byState[active.state] ?? [] : []),
    [active, byState]
  )

  // Map-unit distance that corresponds to CLUSTER_PX on screen right now.
  const screenToUnits = useCallback(
    (px: number) => px / Math.max(pxPerUnit * view.k, 0.0001),
    [pxPerUnit, view.k]
  )

  const clusters = useMemo(
    () => clusterPoints(visible, screenToUnits(CLUSTER_PX)),
    [visible, screenToUnits]
  )

  /**
   * City labels, derived from our own shops rather than an external gazetteer.
   *
   * Two rules keep them readable. They follow the viewport, because "San Diego"
   * is noise when you're zoomed into the Bay Area. And they're placed greedily
   * biggest-city-first, dropping any that would collide with one already
   * placed — an unreadable pile of overlapping names is worse than fewer names.
   */
  const labels = useMemo(() => {
    if (!active) return []
    const halfW = width / 2 / view.k
    const halfH = height / 2 / view.k
    const inView = visible.filter(
      (p) =>
        p.x >= view.x - halfW &&
        p.x <= view.x + halfW &&
        p.y >= view.y - halfH &&
        p.y <= view.y + halfH
    )
    const byCity: Record<string, { city: string; x: number; y: number; n: number }> = {}
    for (const p of inView) {
      const e = (byCity[p.city] ||= { city: p.city, x: 0, y: 0, n: 0 })
      e.x += p.x
      e.y += p.y
      e.n += 1
    }
    const candidates = Object.values(byCity)
      .map((e) => ({ city: e.city, x: e.x / e.n, y: e.y / e.n, n: e.n }))
      .sort((a, b) => b.n - a.n)

    const fontUnits = screenToUnits(11)
    const bubble = screenToUnits(30)
    // Bubbles are obstacles too — a name sitting across a count is worse than
    // no name. But a city's OWN bubble is the thing it labels, so that one is
    // excluded, otherwise the densest cities (the ones most worth naming) are
    // exactly the ones that never get a label.
    const bubbles = clusters.map((c) => ({ x: c.x, y: c.y, w: bubble, h: bubble }))
    const boxes: { x: number; y: number; w: number; h: number }[] = []

    const placed: { city: string; x: number; y: number }[] = []
    for (const c of candidates) {
      if (placed.length >= 10) break
      const w = c.city.length * fontUnits * 0.58
      const h = fontUnits * 1.5

      // Candidate positions, in order of preference. The horizontal ones must
      // clear the bubble by half the label's own width — a fixed offset works
      // for "Fresno" and puts "Huntington Beach" straight back through it.
      const side = screenToUnits(17) + w / 2
      const offsets: [number, number][] = [
        [0, -screenToUnits(27)],
        [0, screenToUnits(30)],
        [side, screenToUnits(4)],
        [-side, screenToUnits(4)],
      ]
      // The bubble this label belongs to — allowed to be overlapped.
      let own = -1
      let bestD = Infinity
      bubbles.forEach((b, i) => {
        const d = Math.hypot(b.x - c.x, b.y - c.y)
        if (d < bestD) {
          bestD = d
          own = i
        }
      })
      const obstacles = [...boxes, ...bubbles.filter((_, i) => i !== own)]

      for (const [dx, dy] of offsets) {
        const x = c.x + dx
        const y = c.y + dy
        const clash = obstacles.some(
          (o) => Math.abs(o.x - x) < (o.w + w) / 2 && Math.abs(o.y - y) < (o.h + h) / 2
        )
        if (clash) continue
        boxes.push({ x, y, w, h })
        placed.push({ city: c.city, x, y })
        break
      }
    }
    return placed
  }, [active, visible, view, width, height, screenToUnits, clusters])

  const openState = useCallback(
    (s: StateShape) => {
      setAnimate(true)
      setActive(s)
      setSelected(null)
      setSpider(null)
      setView(fitView(s.bounds, width, height))
    },
    [width, height]
  )

  const reset = useCallback(() => {
    setAnimate(true)
    setActive(null)
    setSelected(null)
    setSpider(null)
    setView({ k: 1, x: width / 2, y: height / 2 })
  }, [width, height])

  const zoomBy = useCallback((factor: number) => {
    setAnimate(true)
    setSpider(null)
    setView((v) => ({ ...v, k: Math.min(MAX_K, Math.max(1, v.k * factor)) }))
  }, [])

  const recentre = useCallback(() => {
    if (!active) return
    setAnimate(true)
    setSpider(null)
    setView(fitView(active.bounds, width, height))
  }, [active, width, height])

  function onClusterClick(c: Cluster) {
    if (c.members.length === 1) {
      setSelected(c.members[0])
      return
    }
    // Zoom in on the cluster while that would actually separate it; once the
    // members are effectively stacked, zooming forever won't help — fan them
    // out in place instead. This is the clustering + spiderfy combination the
    // Leaflet and Google marker plugins settled on.
    const separable = c.spread > screenToUnits(CLUSTER_PX) * 0.55 && view.k < MAX_K * 0.6
    if (separable) {
      setAnimate(true)
      setSpider(null)
      setView({ k: Math.min(MAX_K, view.k * 2.6), x: c.x, y: c.y })
    } else {
      setSpider((s) => (s === c.id ? null : c.id))
    }
  }

  // ---- panning ------------------------------------------------------------
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!active) return
    drag.current = { x: e.clientX, y: e.clientY, cx: view.x, cy: view.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
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

  function fill(code: string): string {
    if (active?.state === code) return '#eef4ff'
    const n = counts[code] ?? 0
    if (!n) return '#f1f5f9'
    const t = Math.sqrt(n / max)
    return `hsl(214, 88%, ${92 - t * 45}%)`
  }

  const missing = active ? (counts[active.state] ?? 0) - visible.length : 0
  const u = (px: number) => screenToUnits(px) // shorthand: screen px → map units
  const spiderCluster = clusters.find((c) => c.id === spider) ?? null

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
                ? `${counts[active.state] ?? 0} shop${(counts[active.state] ?? 0) === 1 ? '' : 's'} — drag to pan, tap a pin for details`
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

      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`block h-auto w-full touch-none ${active ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
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
                    filter: hover === s.state && !active ? 'brightness(0.93)' : undefined,
                  }}
                  onClick={() => !active && openState(s)}
                  onMouseEnter={() => setHover(s.state)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${s.name} — ${counts[s.state] ?? 0} shops`}</title>
                </path>
              )
            })}

            {/* City names, for orientation — without them a zoomed state is an
                outline full of anonymous dots. */}
            {labels.map((l) => (
              <text
                key={l.city}
                x={l.x}
                y={l.y}
                textAnchor="middle"
                fontSize={u(11)}
                className="pointer-events-none select-none"
                fill="#334155"
                stroke="#fff"
                strokeWidth={u(2.4)}
                paintOrder="stroke"
                style={{ fontWeight: 600 }}
              >
                {l.city}
              </text>
            ))}

            {clusters.map((c) => {
              const single = c.members.length === 1
              const isSpider = spider === c.id
              if (single) {
                const p = c.members[0]
                const on = selected?.slug === p.slug || hoverShop === p.slug
                return (
                  <g
                    key={c.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(p)
                    }}
                    onMouseEnter={() => setHoverShop(p.slug)}
                    onMouseLeave={() => setHoverShop(null)}
                  >
                    <circle cx={p.x} cy={p.y} r={u(14)} fill="transparent" />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={u(on ? 8 : 5)}
                      fill={on ? '#1d4ed8' : '#2563eb'}
                      stroke="#fff"
                      strokeWidth={u(1.8)}
                    >
                      <title>{`${p.name} — ${p.city}`}</title>
                    </circle>
                  </g>
                )
              }
              // Data brushing: a row hovered in the list must highlight its
              // marker whatever form that marker currently takes — otherwise
              // the highlight silently does nothing for any shop that happens
              // to be inside a cluster, which is most of them when zoomed out.
              const holdsHovered =
                (!!hoverShop && c.members.some((m) => m.slug === hoverShop)) ||
                (!!selected && c.members.some((m) => m.slug === selected.slug))
              return (
                <g
                  key={c.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClusterClick(c)
                  }}
                >
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={u((c.members.length > 9 ? 15 : 13) + (holdsHovered ? 4 : 0))}
                    fill={isSpider || holdsHovered ? '#1d4ed8' : '#2563eb'}
                    stroke={holdsHovered ? '#1e3a8a' : '#fff'}
                    strokeWidth={u(holdsHovered ? 2.5 : 2)}
                    opacity={0.95}
                  >
                    <title>{`${c.members.length} shops here — tap to open`}</title>
                  </circle>
                  <text
                    x={c.x}
                    y={c.y + u(4)}
                    textAnchor="middle"
                    fontSize={u(11)}
                    fill="#fff"
                    className="pointer-events-none select-none"
                    style={{ fontWeight: 700 }}
                  >
                    {c.members.length}
                  </text>
                </g>
              )
            })}

            {/* Fanned-out cluster: drawn last so its legs and pins sit on top. */}
            {spiderCluster &&
              spiderCluster.members.map((m, i) => {
                const n = spiderCluster.members.length
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2
                const r = u(SPIDER_PX) * (n > 8 ? 1 + i / (n * 2) : 1)
                const sx = spiderCluster.x + Math.cos(angle) * r
                const sy = spiderCluster.y + Math.sin(angle) * r
                const on = selected?.slug === m.slug || hoverShop === m.slug
                return (
                  <g
                    key={m.slug}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(m)
                    }}
                    onMouseEnter={() => setHoverShop(m.slug)}
                    onMouseLeave={() => setHoverShop(null)}
                  >
                    <line
                      x1={spiderCluster.x}
                      y1={spiderCluster.y}
                      x2={sx}
                      y2={sy}
                      stroke="#94a3b8"
                      strokeWidth={u(1)}
                    />
                    <circle cx={sx} cy={sy} r={u(14)} fill="transparent" />
                    <circle
                      cx={sx}
                      cy={sy}
                      r={u(on ? 8 : 6)}
                      fill={on ? '#1d4ed8' : '#2563eb'}
                      stroke="#fff"
                      strokeWidth={u(1.8)}
                    >
                      <title>{`${m.name} — ${m.city}`}</title>
                    </circle>
                  </g>
                )
              })}
          </g>
        </svg>

        {active && (
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
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

      {/* The list is the escape hatch: however tightly pins overlap, every shop
          is still reachable here, and hovering a row highlights its pin. */}
      {active && visible.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">
            All {visible.length} pinned shops in {active.name}
          </p>
          <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
            {visible.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/directory/shop/${p.slug}`}
                  onMouseEnter={() => setHoverShop(p.slug)}
                  onMouseLeave={() => setHoverShop(null)}
                  onFocus={() => setHoverShop(p.slug)}
                  onBlur={() => setHoverShop(null)}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors ${
                    hoverShop === p.slug ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate font-medium text-gray-900">{p.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">{p.city}</span>
                </Link>
              </li>
            ))}
          </ul>
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
