'use client'

import { useMemo, useRef, useState } from 'react'
import type { TrafficSeries } from '@/lib/site-analytics'

/**
 * Channel performance over time, with a crosshair that reads out every
 * series for the bucket under the pointer.
 *
 * WHY A TOOLTIP AT ALL. A stack of lines answers "is this going up". The
 * question a shop owner actually asks next is "what happened on the day of
 * that spike", and without a readout the chart can only be pointed at, never
 * read. The numbers were always in the data; nothing here fetches anything.
 *
 * HAND-DRAWN SVG, still. One chart does not justify a charting library on a
 * page opened on a phone — the same call RankTrend made. What that costs is
 * this file; what it buys is no dependency, no bundle, and a tooltip that
 * behaves the way this page needs rather than the way a library's does.
 */

/* Deliberately NOT the brand colour. Every line here is a different thing and
   they have to stay apart at a glance, so the palette is chosen for
   separation — including for the commonest colour-blindness, which is why no
   red sits directly beside a green. */
const COLORS = [
  '#EA580C', // orange
  '#0D9488', // teal
  '#2563EB', // blue
  '#9333EA', // purple
  '#65A30D', // olive
  '#DB2777', // pink
  // "Everything else" lands here, and grey is right for it: it is the
  // leftovers, and it must not compete with a named channel for attention.
  '#94A3B8', // slate
]

function label(point: { date: string; endDate?: string }, bucket: 'day' | 'week') {
  const start = new Date(`${point.date}T12:00:00`)
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
  if (bucket === 'day') return start.toLocaleDateString(undefined, { ...opts, year: 'numeric' })
  const end = point.endDate ? new Date(`${point.endDate}T12:00:00`) : start
  const short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  // A week's label has to name both ends or it reads as a single day with a
  // week's worth of traffic on it.
  return `${start.toLocaleDateString(undefined, short)} – ${end.toLocaleDateString(undefined, { ...short, year: 'numeric' })}`
}

export default function TrafficChart({
  series,
  /* What this chart is OF. It was a hardcoded "Visitors by channel over
     time" on all three, so a screen reader user was told the wrong subject on
     two of them and then given no numbers at all. */
  label: chartLabel,
  /* Series present in the tooltip but not drawn until asked for. Google
     impressions outnumber clicks by a hundred to one, so on a shared axis the
     line anyone came to see is flat along the bottom. */
  initiallyHidden = [],
}: {
  series: TrafficSeries
  label: string
  initiallyHidden?: string[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set(initiallyHidden))
  const boxRef = useRef<HTMLDivElement>(null)

  /* A STORED SNAPSHOT CAN PREDATE THIS COMPONENT.
     The report is cached as JSON for six hours, so a deploy that adds a field
     is followed by six hours of rows that do not have it. Destructuring one
     of those threw and took the whole admin page to a blank
     "client-side exception" — a rendering bug promoted to an outage by an
     unguarded read. Anything shaped wrong now degrades to a line of text and
     refetches on the next pass. */
  const points = series?.points ?? []
  const names = series?.names ?? []
  const bucket = series?.bucket ?? 'day'
  const shown = names.filter((n) => !hidden.has(n))

  const max = useMemo(() => {
    let m = 0
    for (const p of points) {
      names.forEach((n, i) => {
        if (!hidden.has(n)) m = Math.max(m, p.values[i] || 0)
      })
    }
    // Never zero: a flat-zero chart would divide by it, and an axis topping
    // out at 0 draws every line along the ceiling.
    return m || 1
  }, [points, names, hidden])

  if (points.length < 2 || !names.length) {
    return <p className="text-sm text-gray-500">Not enough days yet to draw a trend.</p>
  }

  const W = 800
  const H = 220
  const PAD_B = 22
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - PAD_B - (v / max) * (H - PAD_B - 8)

  /* The pointer maps to the NEAREST bucket, not the one it is exactly over.
     A 365-day chart gives each point about two pixels, and requiring a hit
     inside that makes the readout feel broken rather than precise. */
  function locate(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const ratio = Math.min(Math.max((clientX - box.left) / box.width, 0), 1)
    setHover(Math.round(ratio * (points.length - 1)))
  }

  /* A VERTICAL SWIPE IS A SCROLL, NOT A READ.
     onTouchMove used to locate on any movement, so scrolling the page past
     the chart dragged the crosshair sideways under the thumb. The gesture has
     to prove it is horizontal first. */
  const touchStart = useRef<{ x: number; y: number; reading: boolean } | null>(null)

  function step(delta: number) {
    setHover((h) => {
      const next = h === null ? points.length - 1 : h + delta
      return Math.min(Math.max(next, 0), points.length - 1)
    })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'Home') setHover(0)
    else if (e.key === 'End') setHover(points.length - 1)
    else if (e.key === 'Escape') setHover(null)
    else return
    // Only once a key is one of ours: otherwise Tab and the browser's own
    // shortcuts stop working inside the chart.
    e.preventDefault()
  }

  const active = hover !== null ? points[hover] : null
  const activeTotal = active
    ? names.reduce((sum, n, i) => (hidden.has(n) ? sum : sum + (active.values[i] || 0)), 0)
    : 0
  // Flip the panel to the other side once past halfway, so it never hangs off
  // the edge on a phone.
  const flip = hover !== null && hover > points.length / 2

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {names.map((name, i) => {
          const off = hidden.has(name)
          return (
            <button
              key={name}
              type="button"
              /* Clicking a legend chip mutes that series. It is the only way
                 to read a small channel against a large one — AI Search at 20
                 users is a flat line under Direct at 638. */
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev)
                  if (next.has(name)) next.delete(name)
                  else next.add(name)
                  return next
                })
              }
              aria-pressed={!off}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                off ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: off ? '#d1d5db' : COLORS[i % COLORS.length] }}
              />
              {name}
            </button>
          )
        })}
      </div>

      <div
        ref={boxRef}
        className="relative select-none"
        onMouseMove={(e) => locate(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, reading: false }
        }}
        onTouchMove={(e) => {
          const from = touchStart.current
          if (!from) return
          const dx = Math.abs(e.touches[0].clientX - from.x)
          const dy = Math.abs(e.touches[0].clientY - from.y)
          if (!from.reading && dy > dx) return
          if (dx > 6 || from.reading) {
            from.reading = true
            locate(e.touches[0].clientX)
          }
        }}
        // Nothing cleared `hover` on touch, so the readout panel parked itself
        // over the chart until the page was left.
        onTouchEnd={() => {
          touchStart.current = null
          setHover(null)
        }}
        onTouchCancel={() => {
          touchStart.current = null
          setHover(null)
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setHover((h) => h ?? points.length - 1)}
        onBlur={() => setHover(null)}
        tabIndex={0}
        role="application"
        aria-label={`${chartLabel}. Use the left and right arrow keys to read each ${bucket}.`}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-56"
          role="img"
          aria-label={chartLabel}
        >
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e5e7eb"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {names.map((name, n) =>
            hidden.has(name) ? null : (
              <path
                key={name}
                d={points
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.values[n] || 0).toFixed(1)}`)
                  .join(' ')}
                fill="none"
                stroke={COLORS[n % COLORS.length]}
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          )}
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1="0"
                y2={H - PAD_B}
                stroke="#9ca3af"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              {/* The dots live in HTML below, not here. `preserveAspectRatio
                  ="none"` squashes the 800-unit viewBox to ~312px on a phone,
                  so an SVG circle draws as a flat ellipse — and
                  `vector-effect: non-scaling-size`, which would have fixed it,
                  is in the SVG 2 spec and implemented by no shipping browser. */}
            </>
          )}
        </svg>

        {/* Positioned in HTML over the plot so the aspect-ratio stretch cannot
            deform them. */}
        {hover !== null &&
          names.map((name, n) =>
            hidden.has(name) ? null : (
              <span
                key={name}
                aria-hidden="true"
                className="pointer-events-none absolute block h-[7px] w-[7px] rounded-full"
                style={{
                  backgroundColor: COLORS[n % COLORS.length],
                  left: `calc(${(hover / (points.length - 1)) * 100}% - 3.5px)`,
                  top: `calc(${(y(points[hover].values[n] || 0) / H) * 100}% - 3.5px)`,
                }}
              />
            )
          )}

        {/* The magnitudes. Three gridlines with no numbers on them made the
            shape legible and every value a guess — a line at two-thirds height
            could be 40 or 4,000, and the only readout was mouse-driven. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {[1, 0.5].map((f) => (
            <span
              key={f}
              className="absolute right-1 text-[10px] text-gray-400 bg-white/80 px-1 rounded"
              style={{ top: `calc(${(y(max * f) / H) * 100}% - 7px)` }}
            >
              {Math.round(max * f).toLocaleString()}
            </span>
          ))}
        </div>

        <div className="flex justify-between text-[11px] text-gray-400 -mt-4 px-0.5">
          <span>{label(points[0], bucket).replace(/^\w+, /, '')}</span>
          <span>{label(points[Math.floor(points.length / 2)], bucket).replace(/^\w+, /, '')}</span>
          <span>{label(points[points.length - 1], bucket).replace(/^\w+, /, '')}</span>
        </div>

        {active && (
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute top-0 z-10 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${
              flip ? 'left-0' : 'right-0'
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">{label(active, bucket)}</p>
            <ul className="mt-2 space-y-1">
              {names.map((name, n) =>
                hidden.has(name) ? null : (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: COLORS[n % COLORS.length] }}
                      />
                      {name}
                    </span>
                    <span className="tabular-nums text-gray-900">{active.values[n] || 0}</span>
                  </li>
                )
              )}
            </ul>
            {active.partial && (
              <p className="mt-1 text-xs text-gray-400">
                Part week — fewer days than the rest of the chart.
              </p>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
              {/* "Day total" was the total of the DRAWN series only, so hiding
                  a line changed a number labelled as the day's. */}
              <span className="text-gray-500">
                {hidden.size ? 'Total of shown' : bucket === 'week' ? 'Week total' : 'Day total'}
              </span>
              <span className="font-semibold tabular-nums text-gray-900">{activeTotal}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
