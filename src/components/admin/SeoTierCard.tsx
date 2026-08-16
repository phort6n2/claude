'use client'

import { useState } from 'react'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

/**
 * Whether this shop is on the SEO plan.
 *
 * One switch, and it reaches the scan rather than just labelling the client:
 * on means weekly on four keywords, off means monthly on two. The campaign at
 * Local Dominator is PATCHed as part of the save, so the plan and the work
 * cannot drift apart — which they did, silently, until this was wired up.
 *
 * Autosaves, per the newer cards. Optimistic first, reconciled after: a
 * checkbox that waits on a round trip feels broken.
 */
export default function SeoTierCard({
  clientId,
  initialEnabled,
}: {
  clientId: string
  initialEnabled: boolean
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  async function toggle(next: boolean) {
    setEnabled(next)
    setBusy(true)
    setStatus(null)
    try {
      // PUT, not PATCH: that route exports GET, PUT and DELETE and nothing
      // else, so a PATCH was answered 405 with an empty body and this card
      // could never save — it reported "Could not save." and reverted, which
      // read as a rejected value rather than a wrong verb. The handler is
      // already a partial write; keys absent from the payload are left alone.
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seoClient: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEnabled(!next)
        setStatus({ ok: false, message: data.error || 'Could not save.' })
      } else {
        setStatus({
          ok: true,
          // The campaign's own words when there was one to change; otherwise
          // say plainly that nothing was scanned yet, rather than implying a
          // change that did not happen.
          message:
            data.campaignSync ||
            (next
              ? 'Saved. No campaign yet — the next one created will be weekly on four keywords.'
              : 'Saved. No campaign yet — the next one created will be monthly on two keywords.'),
        })
      }
    } catch {
      setEnabled(!next)
      setStatus({ ok: false, message: 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900">SEO plan</h2>

      <label className="mt-3 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm">
          <span className="font-semibold text-gray-900">This shop is on the SEO plan</span>
          <span className="block text-gray-600">
            On: the grid is scanned <strong>weekly on four keywords</strong>. Off: monthly on two.
            The change is applied to their live campaign, not just recorded here.
          </span>
        </span>
      </label>

      {status && (
        <p
          className={`mt-3 text-sm flex items-start gap-1.5 ${
            status.ok ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />
          ) : status.ok ? (
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{status.message}</span>
        </p>
      )}

      <p className="mt-4 text-xs text-gray-500 max-w-prose">
        Turning it off retires the extra keywords rather than deleting them, so the months already
        measured stay in the history and simply stop extending. Weekly scans cost four times the
        credits of monthly ones.
      </p>
    </section>
  )
}
