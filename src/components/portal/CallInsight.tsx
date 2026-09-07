'use client'

import Link from 'next/link'
import { Phone, PhoneMissed, Clock, CalendarDays, CheckCircle2 } from 'lucide-react'
import { hourLabel, weekdayLabel, type CallInsight as Insight } from '@/lib/call-display'
import { formatPhoneDisplay } from '@/lib/lead-display'
import { telHref } from '@/lib/contact-links'

/**
 * "Your phone" — the calls that went unanswered, and when the phone rings.
 *
 * BOTH HALVES COME FROM ROWS THIS PLATFORM ALREADY HELD. Every call through a
 * tracking number has been stored with its outcome and its timestamp since
 * call tracking shipped; nobody was ever shown either. The first half is
 * money on the floor with a number attached; the second is the one thing here
 * a competitor cannot produce, because it needs months of every call to a
 * tracked line.
 *
 * NO "LOST REVENUE" FIGURE. A missed call multiplied by an average job value
 * is modelled, and the plain count with a callback button is more persuasive
 * than an invented dollar amount — and harder to argue with.
 */

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'plain',
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  tone?: 'plain' | 'warn'
}) {
  return (
    <div
      className={`rounded-2xl border shadow-sm p-5 ${
        tone === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
      }`}
    >
      <div
        className={`flex items-center gap-2 text-sm font-medium ${
          tone === 'warn' ? 'text-amber-800' : 'text-gray-500'
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-extrabold text-gray-900 tabular-nums">{value}</p>
      {sub && (
        <p className={`text-sm mt-0.5 ${tone === 'warn' ? 'text-amber-800' : 'text-gray-500'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

/**
 * A simple column chart. Labelled on the axis, so unlike a heatmap it can be
 * read without hovering anything — this page is opened on a phone.
 */
function Columns({
  values,
  labelFor,
  highlight,
}: {
  values: number[]
  labelFor: (i: number) => string
  highlight?: (i: number) => boolean
}) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-[3px] h-32">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <span className="text-[10px] text-gray-400 tabular-nums mb-0.5">{v || ''}</span>
          <div
            className="w-full rounded-t"
            style={{
              // A zero bar still gets a sliver, so the axis reads as a row of
              // hours rather than a gap where nothing happened.
              height: `${Math.max((v / max) * 100, v ? 6 : 2)}%`,
              backgroundColor: highlight?.(i) ? 'var(--brand, #1d4ed8)' : '#cbd5e1',
            }}
            title={`${labelFor(i)}: ${v}`}
          />
          <span className="text-[9px] text-gray-400 mt-1 leading-none">{labelFor(i)}</span>
        </div>
      ))}
    </div>
  )
}

export default function CallInsight({ insight }: { insight: Insight | null }) {
  if (!insight) {
    return (
      <div className="space-y-5">
        <Header />
        <p className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-600">
          No calls have come through your tracked number yet. Once they do, this page shows which
          ones went unanswered and what times your phone is busiest.
        </p>
      </div>
    )
  }

  const { patterns: p, recentMissed } = insight
  const unhandled = recentMissed.filter((c) => !c.handled)

  return (
    <div className="space-y-5">
      <Header />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Calls answered"
          value={p.answeredCalls.toLocaleString()}
          sub={`of ${(p.answeredCalls + p.missedCalls).toLocaleString()} in the last ${p.daysCovered} days`}
          icon={Phone}
        />
        <Tile
          label="Calls missed"
          value={p.missedCalls.toLocaleString()}
          sub={p.missedRate ? `${p.missedRate}% of your calls` : undefined}
          icon={PhoneMissed}
          tone={p.missedCalls > 0 ? 'warn' : 'plain'}
        />
        <Tile
          label="Busiest time"
          value={p.busiestWindow ?? '—'}
          sub={p.busiestWindow ? 'when most people ring' : 'not enough calls yet to say'}
          icon={Clock}
        />
        <Tile
          label="Busiest day"
          value={
            p.byWeekday.some((v) => v > 0)
              ? weekdayLabel(p.byWeekday.indexOf(Math.max(...p.byWeekday)))
              : '—'
          }
          sub="across the whole period"
          icon={CalendarDays}
        />
      </div>

      {unhandled.length > 0 && (
        <section className="bg-white rounded-2xl border border-amber-300 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900">
            {unhandled.length} missed {unhandled.length === 1 ? 'call' : 'calls'} nobody has rung
            back
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            They rang, it went unanswered, and no one has picked this up yet. Tap to call them.
          </p>
          <ul className="divide-y divide-gray-100">
            {unhandled.map((call) => (
              <li key={call.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">
                    {call.phone ? formatPhoneDisplay(call.phone) || call.phone : 'Number withheld'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(call.at).toLocaleString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {call.phone && telHref(call.phone) ? (
                  <a
                    href={telHref(call.phone) as string}
                    className="shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white no-underline"
                    style={{ backgroundColor: 'var(--brand, #1d4ed8)' }}
                  >
                    Call back
                  </a>
                ) : (
                  <span className="shrink-0 text-sm text-gray-400">no number</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentMissed.length > 0 && unhandled.length === 0 && (
        <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          Every missed call has been picked up. Nice.
        </p>
      )}

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900">When your phone rings</h2>
        <p className="text-sm text-gray-500 mb-3">
          Every call to your tracked number over the last {p.daysCovered} days, by hour. Times are
          your local ones.
        </p>
        <Columns
          values={p.byHour}
          labelFor={(h) => (h % 3 === 0 ? hourLabel(h) : '')}
          highlight={(h) => p.byHour[h] === Math.max(...p.byHour)}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900">Which days</h2>
        <div className="mt-3">
          <Columns
            values={p.byWeekday}
            labelFor={(d) => weekdayLabel(d).slice(0, 3)}
            highlight={(d) => p.byWeekday[d] === Math.max(...p.byWeekday)}
          />
        </div>
      </section>

      {/* Stated only when the hour has enough calls to mean something — one
          miss in an hour that has only ever had one call is a 100% miss rate
          and a lie. */}
      {p.worstHour && (
        <p className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-700">
          Your hardest hour to answer is{' '}
          <strong>{hourLabel(p.worstHour.hour)}</strong> — {p.worstHour.missed} of{' '}
          {p.worstHour.total} calls in that hour went unanswered.
        </p>
      )}

      <p className="text-sm text-gray-400">
        <Link href="/portal" className="underline">
          Back to your dashboard
        </Link>
      </p>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900">Your phone</h1>
      <p className="text-gray-500">
        Every call to your tracked number — which ones went unanswered, and when people actually
        ring.
      </p>
    </div>
  )
}
