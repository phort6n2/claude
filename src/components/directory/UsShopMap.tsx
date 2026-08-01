'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  X,
  Plus,
  Minus,
  Crosshair,
  ArrowRight,
  Truck,
  Star,
  LocateFixed,
} from 'lucide-react'
import { coverGradient } from './ShopCover'
import { DistanceBadge } from './DistanceBadge'
import { useViewerLocation, requestPreciseLocation } from '@/lib/directory/viewer-location'
import type { MapCityShop } from '@/app/api/directory/map/city/route'
import type { StateShape, MapPoint } from '@/lib/directory/usmap'
import type { StateLayers } from '@/lib/directory/map-layers'

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

/**
 * Zoom ceiling.
 *
 * Was 40, which let you magnify until the reference layers ran out and the
 * screen was empty again. Highways and county lines are drawn from data
 * simplified for state-scale viewing; past ~18× there is nothing further to
 * reveal, so zooming only enlarges whitespace.
 */
const MAX_K = 18

/** Projected units → miles. geoAlbersUsa at scale 1300: 6371 km / 1300. */
const MILES_PER_UNIT = 3.0453

/**
 * Teardrop pin, tip at the origin, bulb centred 14 above it with radius 8.
 * Drawn in screen px and scaled by `u()`, so it stays the same size at every
 * zoom — and its tip, not its centre, marks the location.
 */
const PIN_PATH = 'M0 0C-5.5-7.6-8-10.6-8-14A8 8 0 1 1 8-14C8-10.6 5.5-7.6 0 0Z'

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
  const [layers, setLayers] = useState<Record<string, StateLayers | null>>({})
  const [view, setView] = useState({ k: 1, x: width / 2, y: height / 2 })
  const [animate, setAnimate] = useState(true)
  const [locating, setLocating] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const me = useViewerLocation()

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

  /**
   * Reference geometry for the open state, fetched on demand.
   *
   * Roads, county lines, built-up areas, water and town names — the layers
   * that turn an empty field into somewhere. Kept out of the national payload
   * because the homepage downloads that one on scroll; see map-layers.ts.
   */
  useEffect(() => {
    const code = active?.state
    if (!code || code in layers) return
    let live = true
    fetch(`/api/directory/map/layers/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: StateLayers) => {
        if (live) setLayers((l) => ({ ...l, [code]: j }))
      })
      .catch(() => {
        // The map is still usable without them, just less legible — so record
        // the miss and don't retry on every render.
        if (live) setLayers((l) => ({ ...l, [code]: null }))
      })
    return () => {
      live = false
    }
  }, [active, layers])

  const layer = active ? layers[active.state] ?? null : null

  /**
   * Marker radius in screen px.
   *
   * A single shop gets a pin rather than a disc (see the marker block), so
   * this only sizes the multi-shop discs and the group bubbles — which means
   * it no longer needs a floor big enough to fit a numeral, and the size
   * difference between counts is finally large enough to see.
   */
  const cityRadius = useCallback(
    (n: number) => (n <= 1 ? 8 : Math.min(22, 6.5 + Math.sqrt(n) * 3.4)),
    []
  )

  /**
   * How prominent a place name should be, from the Census place list.
   *
   * Without this every label is the same weight and collisions are resolved by
   * whatever order the API returned cities in — so Denver could lose its label
   * to Broomfield. Rank 1 is the largest places in the state.
   */
  const placeRank = useMemo(() => {
    const m: Record<string, { r: 1 | 2 | 3; o: number }> = {}
    const list = layer?.places ?? []
    list.forEach((p, i) => {
      m[p.n.toLowerCase()] = { r: p.r, o: i }
    })
    return m
  }, [layer])

  /** Type size tier — how big the name is drawn. */
  const rankOf = useCallback(
    (city: string): 1 | 2 | 3 => placeRank[city.toLowerCase()]?.r ?? 3,
    [placeRank]
  )

  /**
   * Exact position in the state's place list.
   *
   * The three size tiers are too coarse to order by on their own: Denver and
   * Aurora are both tier 1, so a tie-break on shop count named a merged Front
   * Range cluster "Aurora area". This keeps the underlying order.
   */
  const orderOf = useCallback(
    (city: string) => placeRank[city.toLowerCase()]?.o ?? 9999,
    [placeRank]
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
  /**
   * Real text width, measured once per string+size and cached.
   *
   * This used to be `city.length * font * 0.58`. A character count says
   * "Williamsburg" and "Illinois City" are the same width when they differ by
   * a third, so the collision test was wrong in both directions — real
   * overlaps got through and valid placements were rejected.
   */
  const measured = useRef<Record<string, number>>({})
  const textWidth = useCallback((s: string, px: number) => {
    const key = `${s}|${px}`
    const hit = measured.current[key]
    if (hit != null) return hit
    if (typeof document === 'undefined') return s.length * px * 0.58
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return s.length * px * 0.58
    ctx.font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`
    const w = ctx.measureText(s).width
    measured.current[key] = w
    return w
  }, [])

  /** Type size for a place, by rank. Bigger place, bigger name. */
  const labelSize = useCallback((rank: 1 | 2 | 3) => (rank === 1 ? 14 : rank === 2 ? 11.5 : 10), [])

  const labels = useMemo(() => {
    if (!active) return []
    const halfW = width / 2 / view.k
    const halfH = height / 2 / view.k
    const visible = (x: number, y: number) =>
      x >= view.x - halfW && x <= view.x + halfW && y >= view.y - halfH && y <= view.y + halfH

    // Only cities standing on their own get a name; a group has no single name.
    // Sorted by how big the place is first, so when names have to be dropped
    // the ones that survive are the ones a reader navigates by.
    const inView = soloCities
      .filter((c) => visible(c.x, c.y))
      .map((c) => ({ c, rank: rankOf(c.city) }))
      .sort((a, b) => orderOf(a.c.city) - orderOf(b.c.city) || b.c.shops.length - a.c.shops.length)

    const markers = groups.map((c) => {
      const n = Math.max(...c.members.map((m) => m.shops.length))
      const d = u(cityRadius(n) * 2 + 4)
      return { x: c.x, y: c.y, w: d, h: d }
    })
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    const placed: {
      key: string
      city: string
      x: number
      y: number
      rank: 1 | 2 | 3
      anchor: 'start' | 'middle' | 'end'
    }[] = []

    const place = (
      key: string,
      name: string,
      cx: number,
      cy: number,
      rank: 1 | 2 | 3,
      radius: number,
      own: boolean
    ) => {
      const px = labelSize(rank)
      const font = u(px)
      const w = u(textWidth(name, px))
      const h = font * 1.35
      const r = u(radius)
      // The label points at its own marker, so that one isn't an obstacle.
      const others = own ? markers.filter((m) => !(m.x === cx && m.y === cy)) : markers
      const side = r + u(6) + w / 2
      // Imhof's order: right first, then the diagonals, then left. Directly
      // above is a last resort because it collides with whatever is north.
      const offsets: [number, number][] = [
        [side, u(3.5)],
        [side, -(r + u(6))],
        [side, r + u(10)],
        [-side, u(3.5)],
        [0, -(r + u(7))],
      ]
      for (const [dx, dy] of offsets) {
        const x = cx + dx
        const y = cy + dy
        const clash = [...boxes, ...others].some(
          (o) => Math.abs(o.x - x) < (o.w + w) / 2 && Math.abs(o.y - y) < (o.h + h) / 2
        )
        if (clash) continue
        boxes.push({ x, y, w, h })
        placed.push({ key, city: name, x, y, rank, anchor: 'middle' })
        return true
      }
      return false
    }

    for (const { c, rank } of inView) {
      if (placed.length >= 16) break
      place(c.key, c.city, c.x, c.y, rank, cityRadius(c.shops.length), true)
    }

    // Groups get the name of their biggest member plus "area". Unlabelled they
    // were anonymous numbered bubbles — the Front Range read as three "2"s
    // with no way to tell which one was Denver.
    const merged = groups.filter((g) => g.members.length > 1 && visible(g.x, g.y))
    for (const g of merged) {
      if (placed.length >= 18) break
      const lead = [...g.members].sort(
        (a, b) => orderOf(a.city) - orderOf(b.city) || b.shops.length - a.shops.length
      )[0]
      const shops = g.members.reduce((t, m) => t + m.shops.length, 0)
      place(g.key, `${lead.city} area`, g.x, g.y, rankOf(lead.city), cityRadius(shops) + 5, false)
    }
    return placed
  }, [
    active,
    soloCities,
    groups,
    view,
    width,
    height,
    u,
    cityRadius,
    rankOf,
    orderOf,
    labelSize,
    textWidth,
  ])

  /**
   * Names of towns we DON'T have a shop in.
   *
   * The map only ever named cities with shops, so a gap could mean "nobody
   * here" or "we haven't mapped this yet" and there was no way to tell.
   * Naming the surrounding towns in grey makes the coverage honest and gives
   * the eye something to navigate by between markers.
   */
  const contextLabels = useMemo(() => {
    if (!active || !layer || view.k < 2.2) return []
    const halfW = width / 2 / view.k
    const halfH = height / 2 / view.k
    const ours = new Set(soloCities.map((c) => c.city.toLowerCase()))
    const taken = labels.map((l) => ({
      x: l.x,
      y: l.y,
      w: u(textWidth(l.city, labelSize(l.rank))),
      h: u(labelSize(l.rank)) * 1.35,
    }))
    const markers = groups.map((g) => {
      const n = Math.max(...g.members.map((m) => m.shops.length))
      const d = u(cityRadius(n) * 2 + 10)
      return { x: g.x, y: g.y, w: d, h: d }
    })
    const out: { n: string; x: number; y: number; r: 1 | 2 | 3 }[] = []
    // Minor places only earn a name once you're zoomed in enough to need them.
    const maxRank = view.k < 4 ? 1 : view.k < 7 ? 2 : 3
    for (const p of layer.places) {
      if (out.length >= 22) break
      if (p.r > maxRank) continue
      if (ours.has(p.n.toLowerCase())) continue
      if (p.x < view.x - halfW || p.x > view.x + halfW) continue
      if (p.y < view.y - halfH || p.y > view.y + halfH) continue
      const px = labelSize(p.r) - 1
      const w = u(textWidth(p.n, px))
      const h = u(px) * 1.35
      const clash = [...taken, ...markers, ...out.map((o) => ({
        x: o.x,
        y: o.y,
        w: u(textWidth(o.n, labelSize(o.r) - 1)),
        h: u(labelSize(o.r) - 1) * 1.35,
      }))].some((o) => Math.abs(o.x - p.x) < (o.w + w) / 2 && Math.abs(o.y - p.y) < (o.h + h) / 2)
      if (clash) continue
      out.push(p)
    }
    return out
  }, [
    active,
    layer,
    labels,
    soloCities,
    groups,
    view,
    width,
    height,
    u,
    cityRadius,
    labelSize,
    textWidth,
  ])

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
   * The map payload carries only what it needs to draw; enriching every shop
   * in the directory would mean a website-meta lookup each. A card shows five
   * or six shops, so fetch those six when it opens and keep them.
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

  /**
   * Land colour.
   *
   * The choropleth used to be the same blue family as the markers, so the data
   * you were meant to click competed with the ground it sat on. Land is now
   * warm neutral and the brand blue belongs to the markers alone — the
   * ordinary figure/ground rule for a basemap.
   *
   * The open state keeps its value from the ramp rather than flattening to a
   * single tint: the density that made you click it shouldn't disappear the
   * moment you do.
   */
  function fill(code: string): string {
    const n = counts[code] ?? 0
    // Zoomed out, the land IS the data — the choropleth is the only thing
    // telling you where we have coverage, so it keeps real contrast.
    if (!active) {
      if (!n) return '#f4f2ee'
      const t = Math.sqrt(n / max)
      return `hsl(203, ${28 + t * 22}%, ${93 - t * 34}%)`
    }
    // Zoomed in, the land is background. Markers and roads are the figure, so
    // it goes warm-neutral and gets out of their way — the ordinary
    // figure/ground rule, and previously the map broke it by painting the
    // ground in the same blue as the markers.
    if (!n) return '#f6f5f3'
    const t = Math.sqrt(n / max)
    return `hsl(35, ${14 + t * 8}%, ${95 - t * 6}%)`
  }

  const missing = active
    ? (counts[active.state] ?? 0) - cities.reduce((t, c) => t + c.shops.length, 0)
    : 0

  /**
   * Route badges that actually fit.
   *
   * The generator emits up to 40 per state; drawn unfiltered they stack on
   * each other and on the city names. Interstates first — "off I-25" is the
   * useful one — then whatever else still has room.
   */
  const shields = useMemo(() => {
    if (!active || !layer || view.k < 2) return []
    const halfW = width / 2 / view.k
    const halfH = height / 2 / view.k
    const boxes = [
      ...labels.map((l) => ({
        x: l.x,
        y: l.y,
        w: u(textWidth(l.city, labelSize(l.rank))),
        h: u(labelSize(l.rank)) * 1.4,
      })),
      ...contextLabels.map((p) => ({
        x: p.x,
        y: p.y,
        w: u(textWidth(p.n, labelSize(p.r) - 1)),
        h: u(labelSize(p.r) - 1) * 1.4,
      })),
      ...groups.map((g) => {
        const n = Math.max(...g.members.map((m) => m.shops.length))
        const d = u(cityRadius(n) * 2 + 6)
        return { x: g.x, y: g.y, w: d, h: d }
      }),
    ]
    const out: typeof layer.shields = []
    const drawn = new Set<string>()
    // Interstates first, and every candidate for a route is tried before
    // moving on — so a badge only disappears if the route has no room at all.
    const ranked = [...layer.shields].sort((a, b) => Number(b.i) - Number(a.i))
    for (const s of ranked) {
      if (out.length >= 9) break
      if (drawn.has(s.t)) continue
      if (s.x < view.x - halfW || s.x > view.x + halfW) continue
      if (s.y < view.y - halfH || s.y > view.y + halfH) continue
      const w = u(s.t.length * 5.4 + 8)
      const h = u(11)
      const clash = [
        ...boxes,
        ...out.map((o) => ({ x: o.x, y: o.y, w: u(o.t.length * 5.4 + 8), h: u(11) })),
      ].some((o) => Math.abs(o.x - s.x) < (o.w + w) / 2 && Math.abs(o.y - s.y) < (o.h + h) / 2)
      if (clash) continue
      drawn.add(s.t)
      out.push(s)
    }
    return out
  }, [
    active,
    layer,
    labels,
    contextLabels,
    groups,
    view,
    width,
    height,
    u,
    cityRadius,
    labelSize,
    textWidth,
  ])

  /** A round number of miles, rendered at roughly 90px wide. */
  const scale = useMemo(() => {
    const perPx = MILES_PER_UNIT / Math.max(pxPerUnit * view.k, 0.0001)
    const target = perPx * 90
    if (!isFinite(target) || target <= 0) return null
    const pow = 10 ** Math.floor(Math.log10(target))
    const nice = [1, 2, 5, 10]
      .map((m) => m * pow)
      .reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
    return { px: Math.round(nice / perPx), label: `${nice >= 1 ? nice : nice.toFixed(1)} mi` }
  }, [pxPerUnit, view.k])

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
                ? `${cities.length} ${cities.length === 1 ? 'city' : 'cities'} with shops.`
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
          // Was role="img", which prunes the entire subtree from the
          // accessibility tree — every state and city marker inside it simply
          // did not exist for a screen reader, while still being clickable for
          // everyone else. They're controls, so the SVG is a group.
          role="group"
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
                  stroke={active ? '#d9d4cc' : '#fff'}
                  strokeWidth={u(active ? 0.6 : 1)}
                  // Neighbours were faded to 25%, which erased the very context
                  // that tells you where the open state sits.
                  opacity={dim ? 0.6 : 1}
                  className={active ? '' : 'cursor-pointer'}
                  style={{
                    transition: 'opacity 400ms, fill 200ms',
                    filter: hoverState === s.state && !active ? 'brightness(0.96)' : undefined,
                    // Once zoomed, the state path still covered the whole
                    // canvas and swallowed hover — popping a browser tooltip
                    // about a shape you can no longer click.
                    pointerEvents: active ? 'none' : 'auto',
                  }}
                  // Only the national view has clickable states, so only then
                  // do they belong in the tab order.
                  {...(active
                    ? {}
                    : {
                        role: 'button' as const,
                        tabIndex: 0,
                        'aria-label': `${s.name} — ${counts[s.state] ?? 0} shops`,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          e.preventDefault()
                          openState(s)
                        },
                        onFocus: () => setHoverState(s.state),
                        onBlur: () => setHoverState(null),
                      })}
                  onClick={() => !active && openState(s)}
                  onMouseEnter={() => setHoverState(s.state)}
                  onMouseLeave={() => setHoverState(null)}
                >
                  {!active && <title>{`${s.name} — ${counts[s.state] ?? 0} shops`}</title>}
                </path>
              )
            })}

            {/* Reference layers, drawn over the land and under the markers.
                Order is the cartographic one: area fills, then water, then
                roads, so a highway crossing a lake reads as crossing it. */}
            {active && layer && (
              <g pointerEvents="none">
                {layer.urban && (
                  <path d={layer.urban} fill="#ded7c8" stroke="none" opacity={0.9} />
                )}
                {layer.counties && (
                  <path
                    d={layer.counties}
                    fill="none"
                    stroke="#cfc8bd"
                    strokeWidth={u(0.5)}
                    strokeDasharray={`${u(2.5)} ${u(2)}`}
                  />
                )}
                {layer.lakes && <path d={layer.lakes} fill="#cfe3ef" stroke="none" />}
                {layer.rivers && (
                  <path d={layer.rivers} fill="none" stroke="#cfe3ef" strokeWidth={u(0.9)} />
                )}
                {/* Casing under each road class so they read as ribbons rather
                    than hairlines, the way every basemap draws them. */}
                {layer.highways && (
                  <>
                    <path
                      d={layer.highways}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={u(2.6)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <path
                      d={layer.highways}
                      fill="none"
                      stroke="#dcc9a0"
                      strokeWidth={u(1.1)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </>
                )}
                {layer.interstates && (
                  <>
                    <path
                      d={layer.interstates}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={u(5.4)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <path
                      d={layer.interstates}
                      fill="none"
                      stroke="#e2a33c"
                      strokeWidth={u(3.4)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </g>
            )}

            {/* The open state's outline, redrawn on top so no neighbour paints
                over it. It was previously white on a near-white fill — a
                contrast ratio of 1.11, i.e. invisible. */}
            {active && (
              <path
                d={active.d}
                fill="none"
                stroke="#164b70"
                strokeWidth={u(1.6)}
                strokeLinejoin="round"
                pointerEvents="none"
                opacity={0.9}
              />
            )}

            {/* Route badges — "off I-25" is how people actually describe where
                a shop is. */}
            {shields.map((s) => {
                const w = u(s.t.length * 5.4 + 8)
                const h = u(11)
                return (
                  <g key={`${s.t}-${s.x}-${s.y}`} pointerEvents="none">
                    <rect
                      x={s.x - w / 2}
                      y={s.y - h / 2}
                      width={w}
                      height={h}
                      rx={u(2.5)}
                      fill={s.i ? '#164b70' : '#fffdf8'}
                      stroke={s.i ? '#fff' : '#a8987a'}
                      strokeWidth={u(0.8)}
                    />
                    <text
                      x={s.x}
                      y={s.y + u(3)}
                      textAnchor="middle"
                      fontSize={u(7.5)}
                      fill={s.i ? '#fff' : '#5c5138'}
                      className="select-none"
                      style={{ fontWeight: 700 }}
                    >
                      {s.t}
                    </text>
                  </g>
                )
              })}

            {/* Towns we don't have a shop in, so the gaps read as gaps rather
                than as unfinished map. */}
            {contextLabels.map((p) => (
              <text
                key={`ctx-${p.n}-${p.x}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                fontSize={u(labelSize(p.r) - 1)}
                fill="#8a8578"
                stroke="#f6f5f3"
                strokeWidth={u(1.8)}
                paintOrder="stroke"
                pointerEvents="none"
                className="select-none"
                style={{ fontWeight: 500, strokeLinejoin: 'round', strokeLinecap: 'round' }}
              >
                {p.n}
              </text>
            ))}

            {/* Only cities that actually have shops are drawn, and every one of
                them is clickable. Nothing on the map is decorative. */}
            {groups.map((g) => {
              const solo = g.members.length === 1
              const c = g.members[0]
              const shops = g.members.reduce((t, m) => t + m.shops.length, 0)
              const on = solo && (openCity === c.key || hoverCity === c.key)
              const r = cityRadius(solo ? c.shops.length : shops)
              const single = solo && c.shops.length === 1
              const activate = () => {
                if (solo) {
                  setOpenCity((k) => (k === c.key ? null : c.key))
                  return
                }
                // A group is an instruction to zoom, never a card — the
                // card always answers "shops in one named city".
                setAnimate(true)
                setOpenCity(null)
                setView((v) => ({ k: Math.min(MAX_K, v.k * 2.4), x: g.x, y: g.y }))
              }
              return (
                <g
                  key={g.key}
                  className="cursor-pointer focus:outline-none"
                  // A marker is a button, so it should behave like one:
                  // reachable by Tab, operable by Enter or Space, and
                  // announced with what it will do.
                  role="button"
                  tabIndex={0}
                  aria-label={
                    solo
                      ? `${c.city} — ${c.shops.length} shop${c.shops.length === 1 ? '' : 's'}`
                      : `${g.members.length} nearby cities, ${shops} shops. Zoom in.`
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    if (dragged()) return
                    activate()
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    e.stopPropagation()
                    activate()
                  }}
                  onFocus={() => {
                    setFocused(g.key)
                    if (solo) setHoverCity(c.key)
                  }}
                  onBlur={() => {
                    setFocused(null)
                    setHoverCity(null)
                  }}
                  onMouseEnter={() => solo && setHoverCity(c.key)}
                  onMouseLeave={() => setHoverCity(null)}
                >
                  {/* Focus ring. Keyboard users get no hover, so without this
                      there'd be no way to tell which marker is selected. */}
                  {focused === g.key && (
                    <circle
                      cx={g.x}
                      cy={g.y}
                      r={u(r + 8)}
                      fill="none"
                      stroke="#c2410c"
                      strokeWidth={u(2)}
                      pointerEvents="none"
                    />
                  )}
                  {/* Invisible hit target. The markers are sized to be read,
                      not to be tapped; this gives every one of them a 44px
                      touch area without adding a visible pixel. */}
                  <circle cx={g.x} cy={g.y} r={u(22)} fill="none" pointerEvents="all" />
                  {single ? (
                    // One shop → a pin, whose tip IS the location. A disc with
                    // "1" in it read as a cluster you could expand, which is
                    // what a numeral in a circle means everywhere else.
                    <path
                      d={PIN_PATH}
                      transform={`translate(${g.x} ${g.y}) scale(${u(on ? 1.15 : 1)})`}
                      fill={on ? '#164b70' : '#2477ad'}
                      stroke="#fff"
                      strokeWidth={1.5}
                    >
                      <title>{`${c.city} — 1 shop`}</title>
                    </path>
                  ) : (
                    <circle
                      cx={g.x}
                      cy={g.y}
                      r={u(r + (on ? 3 : 0))}
                      fill={solo ? '#1b5e8c' : '#164b70'}
                      stroke="#fff"
                      strokeWidth={u(2)}
                    >
                      <title>
                        {solo
                          ? `${c.city} — ${c.shops.length} shops`
                          : `${g.members.length} nearby cities, ${shops} shops — tap to zoom in`}
                      </title>
                    </circle>
                  )}
                  {/* A group gets a detached ring — the two markers did
                      completely different things while looking identical, and
                      the difference was explained in body copy instead. */}
                  {!solo && (
                    <circle
                      cx={g.x}
                      cy={g.y}
                      r={u(r + 4.5)}
                      fill="none"
                      stroke="#b7d5ec"
                      strokeWidth={u(1.5)}
                      pointerEvents="none"
                    />
                  )}
                  {single ? (
                    <circle
                      cx={g.x}
                      cy={g.y - u(14)}
                      r={u(2.6)}
                      fill="#fff"
                      pointerEvents="none"
                    />
                  ) : (
                    <text
                      x={g.x}
                      y={g.y + u(4)}
                      textAnchor="middle"
                      fontSize={u(11)}
                      fill="#fff"
                      className="pointer-events-none select-none"
                      style={{ fontWeight: 700 }}
                    >
                      {shops}
                    </text>
                  )}
                </g>
              )
            })}

            {/* You are here. The single most orienting thing on a locator map
                — everything else is relative to it. */}
            {active && me?.xy && (
              <g pointerEvents="none">
                <circle
                  cx={me.xy[0]}
                  cy={me.xy[1]}
                  r={u(me.precise ? 13 : 20)}
                  fill="#c2410c"
                  opacity={0.14}
                />
                <circle
                  cx={me.xy[0]}
                  cy={me.xy[1]}
                  r={u(5)}
                  fill="#c2410c"
                  stroke="#fff"
                  strokeWidth={u(2)}
                />
                <title>{me.precise ? 'Your location' : 'Your approximate location'}</title>
              </g>
            )}

            {/* Names drawn after every marker so nothing paints over them. */}
            {labels.map((l) => (
              <text
                key={l.key}
                x={l.x}
                y={l.y}
                textAnchor={l.anchor}
                fontSize={u(labelSize(l.rank))}
                fill={l.rank === 1 ? '#0f2a44' : l.rank === 2 ? '#123b5b' : '#1b5e8c'}
                stroke="#fff"
                strokeWidth={u(l.rank === 1 ? 2.6 : l.rank === 2 ? 2.2 : 1.8)}
                paintOrder="stroke"
                className="pointer-events-none select-none"
                style={{
                  fontWeight: l.rank === 1 ? 700 : 600,
                  letterSpacing: l.rank === 3 ? '0.02em' : l.rank === 2 ? '0.012em' : '0.005em',
                  // Without a round join the halo grows spikes at every acute
                  // vertex — the apexes of A, V, W and M.
                  strokeLinejoin: 'round',
                  strokeLinecap: 'round',
                }}
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
                      className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50"
                    >
                      <ShopThumb slug={s.slug} name={s.name} photo={d?.photo} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-gray-900 sm:text-sm">
                          {s.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                          {typeof d?.rating === 'number' && (
                            <span className="inline-flex items-center gap-1 font-semibold text-tier-600">
                              <Star width={12} height={12} fill="currentColor" /> {d.rating}
                              {d.reviewCount ? ` (${d.reviewCount})` : ''}
                            </span>
                          )}
                          {d?.mobileService && (
                            <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                              <Truck width={12} height={12} /> Mobile
                            </span>
                          )}
                          <DistanceBadge lat={d?.lat} lng={d?.lng} />
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
              className="flex items-center justify-between border-t border-gray-100 px-4 py-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:py-2.5"
            >
              Compare shops in {selected.city} <ArrowRight width={15} height={15} />
            </Link>
          </div>
        )}

        {/* Scale bar. "Is this shop near me?" is the question the whole page
            exists to answer, and until now the map gave no way to judge
            distance at all. Albers is equal-area so linear scale drifts, but
            by well under what a bar at this size claims. */}
        {active && scale && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 select-none sm:left-3 sm:translate-x-0">
            <div className="flex items-end gap-1.5 rounded-md bg-white/85 px-2 py-1 backdrop-blur-sm">
              <div className="relative" style={{ width: scale.px }}>
                <div className="h-[3px] rounded-sm bg-brand-700" />
                <div className="absolute -top-1 left-0 h-[7px] w-px bg-brand-700" />
                <div className="absolute -top-1 right-0 h-[7px] w-px bg-brand-700" />
              </div>
              <span className="text-[10px] font-semibold leading-none text-brand-700">
                {scale.label}
              </span>
            </div>
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
            {!me?.precise && (
              <button
                type="button"
                onClick={() => {
                  setLocating(true)
                  requestPreciseLocation().finally(() => setLocating(false))
                }}
                disabled={locating}
                aria-label="Use my location"
                title="Use my location"
                className="rounded-lg border border-gray-300 bg-white/95 p-2 text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <LocateFixed width={16} height={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Legend. Three symbols meant three different things and the difference
          used to be explained in a sentence of body copy — a sign the symbols
          weren't carrying it. */}
      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <svg width="11" height="15" viewBox="-9 -23 18 24" aria-hidden>
              <path d={PIN_PATH} fill="#2477ad" stroke="#fff" strokeWidth={1.5} />
              <circle cx={0} cy={-14} r={2.6} fill="#fff" />
            </svg>
            1 shop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="-8 -8 16 16" aria-hidden>
              <circle r={7} fill="#1b5e8c" stroke="#fff" strokeWidth={2} />
            </svg>
            Several shops
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="19" height="19" viewBox="-10 -10 20 20" aria-hidden>
              <circle r={6} fill="#164b70" stroke="#fff" strokeWidth={2} />
              <circle r={9} fill="none" stroke="#b7d5ec" strokeWidth={1.5} />
            </svg>
            Several cities — tap to zoom
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden>
              <path d="M0 3h18" stroke="#e8b661" strokeWidth={2.4} />
            </svg>
            Interstate
          </span>
        </div>
      )}

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
                    ? 'border-brand-200 bg-brand-50 text-brand-800'
                    : 'border-gray-200 text-gray-700 hover:border-brand-200 hover:bg-brand-50'
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
          <Link href={`/directory/${active.state}`} className="font-semibold text-brand-700 hover:underline">
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
                  className="text-sm text-gray-600 hover:text-brand-700 hover:underline"
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
