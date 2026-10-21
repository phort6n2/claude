'use client'

import { useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { money } from './campaign-report-ui'

/**
 * "Change the target CPA?" — the ONE confirm dialog for applying a suggested
 * target, opened from the Target CPA panel and from the "try $X" mark on the
 * campaign screen. One component, so the two cannot send different requests
 * or say different things about what will change.
 *
 * It only ASKS. Every check that matters runs on the server against a live
 * read (`target-cpa-apply.ts`): the latest snapshot's suggestion, the target
 * still being the one shown here, AGMP only, Maximize Conversions only, the
 * shared-strategy rule, validate-only first, then the real change, then a
 * read-back. The flag `TARGET_CPA_APPLY_ENABLED` is checked there too.
 */

export interface ApplyTarget {
  customerId: string
  campaignId: string
  accountName: string
  campaignName: string
  currency: string
  /** The target shown to the operator — the server refuses if Google's live one differs. */
  fromMicros: number | null
  toMicros: number
  portfolio: { name: string; campaignCount: number } | null
}

export default function ApplyTargetDialog({
  target,
  onClose,
  onDone,
}: {
  target: ApplyTarget
  onClose: () => void
  onDone: (message: string, ok: boolean) => void
}) {
  const t = target
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/target-cpa/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: t.customerId,
          campaignId: t.campaignId,
          fromMicros: t.fromMicros,
          toMicros: t.toMicros,
          scope: t.portfolio ? 'portfolio' : 'campaign',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        setError(data.error || `Failed (HTTP ${res.status})`)
        setBusy(false)
        return
      }
      onDone(
        data.status === 'applied'
          ? `${t.campaignName}: target is now ${money(data.readBackMicros, t.currency)} (read back from Google).`
          : `${t.campaignName}: Google accepted the change but the read-back said ${data.readBackMicros == null ? 'nothing' : money(data.readBackMicros, t.currency)}. Check it in Google Ads.`,
        data.status === 'applied'
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tcpa-confirm-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-left shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="tcpa-confirm-title" className="text-base font-semibold text-gray-900">
            Change the target CPA?
          </h2>
          <button type="button" onClick={onClose} className="-m-2 p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {t.accountName} · {t.campaignName}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 rounded-xl bg-gray-50 py-4 text-lg tabular-nums">
          <span className="text-gray-500">{t.fromMicros == null ? 'No target' : money(t.fromMicros, t.currency)}</span>
          <span className="text-gray-400">→</span>
          <span className="font-semibold text-gray-900">{money(t.toMicros, t.currency)}</span>
        </div>
        {t.portfolio && (
          <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              This changes the shared bid strategy <strong>{t.portfolio.name || 'portfolio'}</strong>, which affects{' '}
              <strong>every campaign using it</strong>
              {t.portfolio.campaignCount ? ` (${t.portfolio.campaignCount})` : ''}. It is refused if any of them is not an AGMP
              campaign.
            </span>
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Google checks it first without saving (validate only), then it is sent for real and read back. Only the target CPA
          changes — never the budget or the bidding type. The change is logged with your name.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? 'Applying…' : `Set ${money(t.toMicros, t.currency)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
