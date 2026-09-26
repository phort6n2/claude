'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, CalendarCheck } from 'lucide-react'
import type { QualityTrend, TrendWeek } from '@/lib/call-analysis/quality-trend'
import { COMPETENT_SCORE } from '@/lib/call-analysis/rating'

/**
 * "Is my team getting better on the phone?" — answered in one sentence, with
 * the weekly line underneath as the evidence.
 *
 * THE SENTENCE IS THE POINT. A shop owner opening this on a phone wants the
 * verdict, not a chart to interpret, so the headline compares the last four
 * weeks with the four before and says which way it went. The chart is there
 * to be believed, not decoded.
 *
 * HAND-DRAWN SVG, like TrafficChart and RankTrend, for the same reason: one
 * small chart does not earn a charting library on a page opened on a phone.
 *
 * COLOURS are the validated reference order (blue, orange, aqua, yellow) —
 * checked for colour-blind separation as a set, which is why there are at most
 * four lines. Aqua and yellow sit under 3:1 contrast on white, so the numbers
 * are also available as a table below the chart: identity never rests on
 * colour alone.
 */

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100']
const TEAM = 'Whole team'

function weekLabel(week: TrendWeek, withYear = false): string {
  const start = new Date(`${week.start}T12:00:00`)
  const end = new Date(`${week.end}T12:00:00`)
  const short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  // Both ends, or a week reads as a single day.
  return `${start.toLocaleDateString(undefined, short)} – ${end.toLocaleDateString(
    undefined,
    withYear ? { ...short, year: 'numeric' } : short
  )}`
}

export function CallQualityTrend() {
  const [data, setData] = useState<QualityTrend | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/portal/call-quality')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: QualityTrend) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  // No card at all until there is something to put in it — a shop with no
  // coached calls has nothing to trend, and the focus-areas card beside this
  // one already explains why coaching is empty.
  if (failed || !data || data.graded === 0) return null

  return (
    <section id="call-quality" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Call quality over time</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Average coaching score for sales calls, week by week. Booked calls always score high —
        booking the job is the point.
      </p>
      <Headline data={data} />
      <Chart data={data} />
      <Footnotes data={data} />
    </section>
  )
}

function Headline({ data }: { data: QualityTrend }) {
  const recentBooked = data.weeks.slice(-4).reduce((sum, w) => sum + w.team.booked, 0)
  const h = data.headline

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-6">
      {h ? (
        <div className="flex items-end gap-3">
          <span className="text-4xl font-semibold tabular-nums text-gray-900">{h.recent}</span>
          <div className="pb-1 text-sm">
            <Trend delta={h.delta} />
            <p className="text-xs text-gray-500">
              last 4 weeks ({h.recentN} calls) vs {h.prior} the 4 before ({h.priorN})
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600">{data.headlineReason}</p>
      )}
      {/* Booked jobs get their own line, and it is praise: a week's score can
          dip on hard callers while the team is still winning work. */}
      {recentBooked > 0 && (
        <p className="flex items-center gap-1.5 pb-1 text-sm text-gray-700">
          <CalendarCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-gray-900">{recentBooked}</strong>{' '}
            {recentBooked === 1 ? 'job' : 'jobs'} booked on the phone in the last 4 weeks
          </span>
        </p>
      )}
    </div>
  )
}

/**
 * The verdict, in words. Within a couple of points is "steady" — a two-point
 * move on a handful of calls is noise, and calling it a drop would be telling
 * a team they got worse when nothing happened.
 */
function Trend({ delta }: { delta: number }) {
  if (delta >= 3) {
    return (
      <p className="flex items-center gap-1 font-medium text-gray-900">
        <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Up {delta} points — the team is getting better on the phone
      </p>
    )
  }
  if (delta <= -3) {
    return (
      <p className="flex items-center gap-1 font-medium text-gray-900">
        <TrendingDown className="h-4 w-4 text-amber-600" aria-hidden="true" />
        {Math.abs(delta)} points below the 4 weeks before — the tips below show where to look
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1 font-medium text-gray-900">
      <Minus className="h-4 w-4 text-gray-400" aria-hidden="true" />
      Holding steady
    </p>
  )
}

function Chart({ data }: { data: QualityTrend }) {
  const weeks = data.weeks
  const names = [TEAM, ...data.reps]
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number; reading: boolean } | null>(null)

  const valueOf = (week: TrendWeek, name: string) =>
    name === TEAM ? week.team.avg : (week.reps[name]?.avg ?? null)

  const W = 800
  const H = 220
  const PAD_B = 22
  const x = (i: number) => (i / (weeks.length - 1)) * W

  /* THE FLOOR FOLLOWS THE DATA, BUT NEVER ABOVE 40, AND THE TOP IS ALWAYS 100.
     A 0-100 scale was the first version: honest, and half the plot was empty
     white under lines that all sat between 60 and 90. A scale zoomed tight to
     the data is worse — it turns a two-point wobble into a cliff, which is a
     false sentence about somebody's week. So the window is at least 60 points
     tall, and only reaches lower when a week actually does. */
  const lows = names.flatMap((name) =>
    weeks.map((w) => valueOf(w, name)).filter((v): v is number => v != null)
  )
  const floor = Math.max(0, Math.min(40, Math.floor((Math.min(...lows, 100) - 5) / 10) * 10))
  const y = (v: number) => H - PAD_B - ((v - floor) / (100 - floor)) * (H - PAD_B - 8)


  /* A week with no calls is a GAP, never a zero. Drawing it at 0 would show a
     crash in quality on the week the shop was closed for a holiday. */
  function path(name: string): string {
    let d = ''
    let pen = false
    weeks.forEach((week, i) => {
      const v = valueOf(week, name)
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    })
    return d.trim()
  }

  function locate(clientX: number) {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const ratio = Math.min(Math.max((clientX - box.left) / box.width, 0), 1)
    setHover(Math.round(ratio * (weeks.length - 1)))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') setHover((h) => Math.min((h ?? weeks.length - 2) + 1, weeks.length - 1))
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max((h ?? weeks.length) - 1, 0))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  const active = hover !== null ? weeks[hover] : null
  const flip = hover !== null && hover > weeks.length / 2

  return (
    <div className="mt-4">
      {/* A legend only when there is more than one line — a lone team line is
          named by the card's title. */}
      {names.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {names.map((name, i) => {
            const off = hidden.has(name)
            return (
              <button
                key={name}
                type="button"
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(name)) next.delete(name)
                    else next.add(name)
                    return next
                  })
                }
                aria-pressed={!off}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  off ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-700'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: off ? '#d1d5db' : COLORS[i] }}
                />
                {name}
              </button>
            )
          })}
        </div>
      )}

      <div
        ref={boxRef}
        className="relative select-none"
        onMouseMove={(e) => locate(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, reading: false }
        }}
        onTouchMove={(e) => {
          // A vertical swipe is a scroll, not a read — same rule as TrafficChart.
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
        onTouchEnd={() => {
          touchStart.current = null
          setHover(null)
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setHover((h) => h ?? weeks.length - 1)}
        onBlur={() => setHover(null)}
        tabIndex={0}
        role="application"
        aria-label="Call quality by week. Use the left and right arrow keys to read each week."
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-48 w-full" aria-hidden="true">
          {[100].map((v) => (
            <line
              key={v}
              x1="0"
              x2={W}
              y1={y(v)}
              y2={y(v)}
              stroke="#e5e7eb"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line x1="0" x2={W} y1={y(floor)} y2={y(floor)} stroke="#d1d5db" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {/* Where the grader says a competent call starts — the line a team
              is aiming to sit above, drawn so "65" means something. */}
          <line
            x1="0"
            x2={W}
            y1={y(COMPETENT_SCORE)}
            y2={y(COMPETENT_SCORE)}
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          {names.map((name, i) =>
            hidden.has(name) ? null : (
              <path
                key={name}
                d={path(name)}
                fill="none"
                stroke={COLORS[i]}
                strokeWidth={name === TEAM ? 3 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          )}
          {hover !== null && (
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
          )}
        </svg>

        {/* Points in HTML, over the plot: the stretched viewBox would draw an
            SVG circle as a flat ellipse on a phone. Every week with a value
            gets one — with a line broken by gaps, a lone week is otherwise
            invisible. */}
        {names.map((name, n) =>
          hidden.has(name)
            ? null
            : weeks.map((week, i) => {
                const v = valueOf(week, name)
                if (v == null) return null
                const big = hover === i
                const r = big ? 5 : name === TEAM ? 4 : 3
                return (
                  <span
                    key={`${name}-${i}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute block rounded-full ring-2 ring-white"
                    style={{
                      width: r * 2,
                      height: r * 2,
                      backgroundColor: COLORS[n],
                      left: `calc(${(i / (weeks.length - 1)) * 100}% - ${r}px)`,
                      top: `calc(${(y(v) / H) * 100}% - ${r}px)`,
                    }}
                  />
                )
              })
        )}

        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {[100, floor].map((v) => (
            <span
              key={v}
              className="absolute left-0 rounded bg-white/80 px-1 text-[10px] text-gray-400"
              style={{ top: `calc(${(y(v) / H) * 100}% - 7px)` }}
            >
              {v}
            </span>
          ))}
          <span
            // BELOW its line: the lines mostly run above a solid call, and a
            // label on top of them is the first thing the eye trips on.
            className="absolute right-0 rounded bg-white/80 px-1 text-[10px] text-gray-500"
            style={{ top: `calc(${(y(COMPETENT_SCORE) / H) * 100}% + 2px)` }}
          >
            {COMPETENT_SCORE}+ is a solid call
          </span>
        </div>

        <div className="-mt-4 flex justify-between px-0.5 text-[11px] text-gray-400">
          <span>{weekLabel(weeks[0]).split(' – ')[0]}</span>
          <span>This week</span>
        </div>

        {active && (
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute top-0 z-10 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${
              flip ? 'left-0' : 'right-0'
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">{weekLabel(active, true)}</p>
            {active.partial && <p className="text-xs text-gray-400">This week, so far</p>}
            <ul className="mt-2 space-y-1">
              {names.map((name, n) => {
                if (hidden.has(name)) return null
                const cell = name === TEAM ? active.team : active.reps[name]
                return (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[n] }} />
                      {name}
                    </span>
                    <span className="tabular-nums text-gray-900">
                      {cell?.avg ?? '—'}
                      <span className="ml-1 text-xs text-gray-400">
                        {cell?.n ? `${cell.n} call${cell.n === 1 ? '' : 's'}` : 'no calls'}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {active.team.booked > 0 && (
              <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-700">
                {active.team.booked} booked on the phone
              </p>
            )}
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
          Show as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Week</th>
                {names.map((name) => (
                  <th key={name} className="py-1 pr-3 font-medium">
                    {name}
                  </th>
                ))}
                <th className="py-1 font-medium">Booked</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-gray-800">
              {[...weeks].reverse().map((week) => (
                <tr key={week.start} className="border-t border-gray-100">
                  <td className="whitespace-nowrap py-1 pr-3 text-gray-600">{weekLabel(week)}</td>
                  {names.map((name) => {
                    const cell = name === TEAM ? week.team : week.reps[name]
                    return (
                      <td key={name} className="py-1 pr-3">
                        {cell?.avg ?? '—'}
                        {cell?.n ? <span className="ml-1 text-gray-400">({cell.n})</span> : null}
                      </td>
                    )
                  })}
                  <td className="py-1">{week.team.booked || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Footnotes({ data }: { data: QualityTrend }) {
  const notes: string[] = []
  if (data.reps.length === 0) {
    notes.push(
      'A line for each person appears once your team says their name when they answer — "Thanks for calling, this is Mike."'
    )
  } else if (data.unnamedCalls > 0) {
    notes.push(
      `${data.unnamedCalls} call${data.unnamedCalls === 1 ? '' : 's'} where nobody gave their name count toward the whole team only.`
    )
  }
  if (data.questionCalls > 0) {
    notes.push(
      `${data.questionCalls} question-only call${data.questionCalls === 1 ? ' is' : 's are'} left out — answering a question is not graded as a sale.`
    )
  }
  if (!notes.length) return null
  return (
    <ul className="mt-3 space-y-1 text-xs text-gray-500">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  )
}
