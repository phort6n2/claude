'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PhoneMissed, PhoneOff, Phone, Check, Loader2 } from 'lucide-react'
import { callBadge } from '@/lib/call-analysis/rating'
import { formatPhoneDisplay } from '@/lib/lead-display'
import { telHref } from '@/lib/contact-links'
import type { RingBackCall } from '@/lib/call-patterns'

/**
 * "Ring these back" — pinned at the top of Leads, above the day's list.
 *
 * It moved here from the Calls page, where it sat among charts of when the
 * phone rings: an ACTION on a page of analysis. "Who do I call back?" is the
 * question Leads answers, and it is the one an owner opens the portal to ask
 * from the van. The rule for what belongs on it is getCallsToRingBack().
 *
 * Nothing shows when the list is empty. An "all caught up" panel above every
 * day's leads, forever, is a card a shop learns to scroll past — and then
 * scrolls past on the day it has something in it.
 *
 * "Done" moves the lead to Contacted, which is exactly what the list reads
 * as handled, so the row leaves at once and stays gone. It is the CANONICAL
 * lead that moves: a repeat call is a duplicate row whose own status nothing
 * reads.
 */
export function RingBackCard({
  calls,
  onDone,
}: {
  calls: RingBackCall[]
  /** Called after a lead is marked contacted, so the list below can refresh. */
  onDone?: () => void
}) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const waiting = calls.filter((c) => !done.has(c.leadId))
  if (waiting.length === 0) return null

  async function markDone(call: RingBackCall) {
    setBusy(call.leadId)
    setFailed(null)
    // Optimistic: the row goes now, and comes back only if the save fails.
    setDone((prev) => new Set(prev).add(call.leadId))
    try {
      const res = await fetch(`/api/portal/leads/${call.leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CONTACTED' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      onDone?.()
    } catch {
      setDone((prev) => {
        const next = new Set(prev)
        next.delete(call.leadId)
        return next
      })
      setFailed(call.leadId)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      id="ring-back"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm"
      aria-labelledby="ring-back-title"
    >
      <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <PhoneMissed className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="ring-back-title" className="font-semibold text-amber-950">
            Ring these back
            <span className="ml-2 rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-bold tabular-nums">
              {waiting.length}
            </span>
          </h2>
          <p className="text-xs text-amber-900/80">
            Missed calls from the last week that nobody has returned yet.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
        {waiting.map((call) => {
          const badge = callBadge({ callStatus: call.callStatus, durationSecs: call.durationSecs })
          const tel = call.phone ? telHref(call.phone) : null
          const Icon = badge?.kind === 'not-connected' ? PhoneOff : PhoneMissed
          return (
            <li key={call.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/portal/leads/${call.leadId}`}
                  className="block truncate font-semibold text-gray-900 hover:underline"
                >
                  {call.phone ? formatPhoneDisplay(call.phone) || call.phone : 'Number withheld'}
                </Link>
                <p className="flex items-start gap-1.5 text-xs text-gray-500">
                  <Icon className="mt-0.5 h-3 w-3 shrink-0 text-red-600" aria-hidden="true" />
                  {/* Wraps rather than truncates: WHEN they rang is the half
                      of this line an owner needs, and at 390px it was the
                      half being cut off. */}
                  <span>
                    {badge?.label ?? 'Missed call'} ·{' '}
                    {new Date(call.at).toLocaleString(undefined, {
                      weekday: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </p>
                {failed === call.leadId && (
                  <p className="mt-0.5 text-xs text-red-600">Could not save — try again.</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => markDone(call)}
                disabled={busy === call.leadId}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                title="I've called them back"
              >
                {busy === call.leadId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span className="hidden min-[380px]:inline">Done</span>
              </button>
              {tel ? (
                <a
                  href={tel}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold no-underline min-[360px]:px-4"
                  // --brand-on, never white: a yellow shop's white-on-yellow
                  // button is the unreadable case brand-color.ts exists for.
                  style={{ backgroundColor: 'var(--brand, #1d4ed8)', color: 'var(--brand-on, #fff)' }}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {/* The word goes first on the narrowest phones: at 320 it
                      was costing the row the end of the number it dials. */}
                  <span className="hidden min-[360px]:inline">Call</span>
                  <span className="sr-only min-[360px]:hidden">Call</span>
                </a>
              ) : (
                <span className="shrink-0 text-xs text-gray-400">no number</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
