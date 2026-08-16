'use client'

import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'

/**
 * Whether recorded calls for this client are scored and coached.
 *
 * Autosaves, because it belongs next to the tracking numbers it depends on
 * and those autosave. It used to be a section of its own at the bottom of the
 * tab, staged behind the save bar — two cards away from the recordings that
 * are its only input, and in a fourth save model on a page that already had
 * three.
 *
 * Optimistic first, reconciled after: a checkbox that waits on a round trip
 * feels broken.
 */
export default function CallCoachingToggle({
  clientId,
  initialEnabled,
}: {
  clientId: string
  initialEnabled: boolean
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function toggle(next: boolean) {
    setEnabled(next)
    setBusy(true)
    setStatus(null)
    try {
      // PUT, not PATCH — that route exports GET, PUT and DELETE, and it is a
      // partial write, so sending this one field leaves the rest alone.
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callCoachingEnabled: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEnabled(!next)
        setStatus({ ok: false, text: data.error || 'Could not save.' })
        return
      }
      setStatus({ ok: true, text: next ? 'Calls will be scored.' : 'Scoring stopped.' })
      setTimeout(() => setStatus(null), 4000)
    } catch {
      setEnabled(!next)
      setStatus({ ok: false, text: 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-gray-100 px-6 py-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm">
          <span className="font-semibold text-gray-900">Score and coach recorded calls</span>
          <span className="block text-gray-600">
            Needs a tracking number above with recording on — there is nothing to score without
            one.
          </span>
        </span>
      </label>
      <div className="mt-2 h-5 text-xs">
        {busy && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Saving…
          </span>
        )}
        {!busy && status && (
          <span
            className={`inline-flex items-center gap-1 ${
              status.ok ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {status.ok ? <Check size={12} /> : <X size={12} />} {status.text}
          </span>
        )}
      </div>
    </div>
  )
}
