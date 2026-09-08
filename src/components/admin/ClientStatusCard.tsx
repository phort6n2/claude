'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Loader2, PauseCircle, PlayCircle, Wrench } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * ACTIVE, ONBOARDING or PAUSED — the switch that had no switch.
 *
 * `status` gates more than anything else on a client: whether the public site
 * renders at all, whether the nightly rank scan and the Google review refresh
 * pick them up, whether they count as an active client, and now whether their
 * Windshield Repair HQ listing keeps its Partner tier. It could be written by
 * the clients API and by intake approval — and by no screen in the admin. So
 * every consequence below was reachable only by an API call, and pausing a
 * shop who stopped paying meant editing the database.
 *
 * EACH OPTION STATES WHAT IT CHANGES, in the app's own words, because the
 * three are not degrees of the same thing. ONBOARDING and ACTIVE both serve a
 * live website — that is deliberate, see LIVE_STATUSES — and PAUSED is a kill
 * switch. Reading the labels alone, nobody would guess which two are alike.
 */

const OPTIONS = [
  {
    value: 'ACTIVE',
    label: 'Active',
    icon: PlayCircle,
    tone: 'text-green-700 bg-green-50 border-green-300',
    what: 'Their website is public. Rank scans and review refreshes run. Partner listing on Windshield Repair HQ.',
  },
  {
    value: 'ONBOARDING',
    label: 'Onboarding',
    icon: Wrench,
    tone: 'text-blue-700 bg-blue-50 border-blue-300',
    // The one that surprises people: their site is already up.
    what: 'Setup is unfinished, but the site is still public — empty sections strip themselves, so it is leaner, never broken. Skipped by the rank sweep and the review refresh.',
  },
  {
    value: 'PAUSED',
    label: 'Paused',
    icon: PauseCircle,
    tone: 'text-amber-800 bg-amber-50 border-amber-300',
    what: 'Their website goes offline — only signed-in admins can see it, behind a preview banner. Scans stop, and the directory listing drops the Partner tier but is kept.',
  },
] as const

export default function ClientStatusCard({
  clientId,
  initialStatus,
}: {
  clientId: string
  initialStatus: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function choose(next: string) {
    if (next === status || saving) return
    /* CONFIRMED ONLY ON THE WAY TO PAUSED, and only because that one takes a
       real business's website off the internet. Asking on every change trains
       the reflex that dismisses the one that matters. */
    if (
      next === 'PAUSED' &&
      !window.confirm(
        'Pause this client?\n\nTheir website stops serving the public immediately — visitors and Google both see nothing. Their Windshield Repair HQ listing drops the Partner tier but is kept.\n\nSwitching back to Active restores all of it.'
      )
    ) {
      return
    }
    const previous = status
    // Optimistic, per the autosaving convention — a segmented control that
    // waits on a round trip before moving feels broken.
    setStatus(next)
    setSaving(next)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'The status did not save'))
      const data = await res.json().catch(() => ({}))
      /* The directory outcome, finally read by something. The PUT has always
         returned `wrhqSync` when a synced field changed, and `status` is the
         field that changes the listing most — nothing consumed it, so a
         listing left un-paused was invisible. */
      setMessage(
        data.wrhqSync
          ? { ok: false, text: data.wrhqSync }
          : { ok: true, text: `Saved. This client is now ${next.toLowerCase()}.` }
      )
      // The status badge lives in the tab layout, and the site's own
      // visibility changes with it.
      router.refresh()
    } catch (err) {
      setStatus(previous)
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="px-6 pt-5 pb-1">
        <h2 className="font-semibold text-gray-900">Status</h2>
        <p className="text-sm text-gray-500">
          What this client is to the platform, and whether their site is public.{' '}
          <span className="text-gray-400">Saves on change.</span>
        </p>
      </div>

      <div className="p-6 pt-4 space-y-2">
        {OPTIONS.map((option) => {
          const on = status === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              disabled={!!saving}
              aria-pressed={on}
              className={`w-full text-left rounded-xl border p-3.5 transition-colors disabled:opacity-60 ${
                on ? option.tone : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">
                  {saving === option.value ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : on ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <option.icon className="h-4 w-4 text-gray-400" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${on ? '' : 'text-gray-900'}`}>
                    {option.label}
                  </span>
                  <span
                    className={`block text-xs mt-0.5 leading-relaxed ${
                      on ? 'opacity-90' : 'text-gray-500'
                    }`}
                  >
                    {option.what}
                  </span>
                </span>
              </span>
            </button>
          )
        })}

        {status === 'PAUSED' && (
          <p className="flex items-start gap-1.5 text-sm text-amber-800 pt-1">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            This shop&apos;s website is not serving the public right now.
          </p>
        )}

        {message && (
          <p className={`text-sm pt-1 ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
