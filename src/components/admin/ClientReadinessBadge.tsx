'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, Circle, TrendingUp, TriangleAlert } from 'lucide-react'
import type { ReadinessCheck } from '@/lib/client-readiness'

/**
 * "Is this client finished?" — in the header, on every tab.
 *
 * The chip alone is the answer most of the time; the list is there for the
 * one moment you need it. It states a count rather than a percentage on
 * purpose: "3 to finish" is a to-do, "84% complete" is a score, and a score
 * invites you to feel good about it instead of doing the three things.
 *
 * Completed checks stay in the list, greyed. Seeing what has already been
 * done is how you trust that the ones flagged are really outstanding.
 */

export default function ClientReadinessBadge({
  checks,
  requiredOpen,
  recommendedOpen,
  opportunityOpen,
}: {
  checks: ReadinessCheck[]
  requiredOpen: number
  recommendedOpen: number
  opportunityOpen: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click-away and Escape. A popover in a header that only closes by pressing
  // the same button again is a popover people leave open by accident.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Opportunities only surface on the chip once the actual work is done —
  // "sell them something" under a list of things you haven't finished is the
  // wrong order, and setup problems are what lose the account.
  const tone =
    requiredOpen > 0
      ? 'bad'
      : recommendedOpen > 0
        ? 'warn'
        : opportunityOpen > 0
          ? 'opp'
          : 'ok'
  const styles = {
    bad: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    warn: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    opp: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    ok: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  }[tone]

  const label =
    requiredOpen > 0
      ? `${requiredOpen} to finish`
      : recommendedOpen > 0
        ? `${recommendedOpen} to improve`
        : opportunityOpen > 0
          ? `Set up · ${opportunityOpen} opportunity`
          : 'Fully set up'

  const open_ = checks.filter((c) => !c.ok && c.severity !== 'opportunity')
  const opportunities = checks.filter((c) => !c.ok && c.severity === 'opportunity')
  const done = checks.filter((c) => c.ok)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${styles}`}
      >
        {tone === 'ok' ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : tone === 'opp' ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : (
          <TriangleAlert className="h-3.5 w-3.5" />
        )}
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Right-anchored: dropped from the left it landed squarely over the
          tab bar, hiding the tabs it exists to send you to. */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-[22rem] max-w-[calc(100vw-3rem)] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="max-h-[26rem] overflow-y-auto divide-y divide-gray-100">
            {open_.length === 0 && (
              <p className="p-4 text-sm text-gray-600">
                Everything on the checklist is done. Nothing is waiting on you.
              </p>
            )}

            {/* Opportunities lead, when there is no outstanding work. Nothing
                is broken here, so it is the most useful thing on the list. */}
            {opportunities.map((check) => (
              <Link
                key={check.id}
                href={check.href}
                onClick={() => setOpen(false)}
                className="block p-3 bg-emerald-50/60 hover:bg-emerald-50"
              >
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {check.label}
                      <span className="ml-1.5 font-normal text-xs text-emerald-700">
                        opportunity
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{check.detail}</p>
                  </div>
                </div>
              </Link>
            ))}

            {open_.map((check) => (
              <Link
                key={check.id}
                href={check.href}
                onClick={() => setOpen(false)}
                className="block p-3 hover:bg-gray-50"
              >
                <div className="flex items-start gap-2">
                  {check.severity === 'required' ? (
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  ) : (
                    <Circle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {check.label}
                      {check.severity === 'recommended' && (
                        <span className="ml-1.5 font-normal text-xs text-gray-400">
                          recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">{check.detail}</p>
                  </div>
                </div>
              </Link>
            ))}

            {done.length > 0 && (
              <div className="p-3 bg-gray-50">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                  Done
                </p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {done.map((check) => (
                    <li key={check.id} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                      <span className="truncate">{check.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
