'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

/**
 * Google Ads conversion tracking for one client's hosted site.
 *
 * Nothing is emitted until a conversion ID is saved here — a site with no Ads
 * account loads no third-party script. The two labels are separate on
 * purpose: leaving the call label empty is the correct setting whenever
 * HighLevel's Number Pool Calling is reporting calls, because two systems
 * reporting the same call is how an account double-counts.
 */

interface TrackingState {
  conversionId: string
  leadConversionLabel: string
  callConversionLabel: string
  enhancedConversions: boolean
}

const EMPTY: TrackingState = {
  conversionId: '',
  leadConversionLabel: '',
  callConversionLabel: '',
  enhancedConversions: true,
}

export default function AdsTrackingCard({ clientId }: { clientId: string }) {
  const [state, setState] = useState<TrackingState | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/ads-tracking`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setState({ ...EMPTY, ...(data.tracking || {}) })
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  const set = <K extends keyof TrackingState>(key: K, value: TrackingState[K]) => {
    setState((prev) => (prev ? { ...prev, [key]: value } : prev))
    setMessage(null)
  }

  async function save() {
    if (!state) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ads-tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setMessage({ ok: true, text: 'Saved. The tag updates on the site within about 5 minutes.' })
      setTimeout(() => setMessage(null), 5000)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  if (!state) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading tracking…
      </div>
    )
  }

  const live = /^AW-[0-9]+$/.test(state.conversionId.trim()) &&
    (state.leadConversionLabel.trim() || state.callConversionLabel.trim())

  return (
    <div className="p-6 pt-4 space-y-4">
      <div
        className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
          live
            ? 'border-green-200 bg-green-50 text-green-900'
            : 'border-gray-200 bg-gray-50 text-gray-600'
        }`}
      >
        {live ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : null}
        <span>
          {live
            ? 'Conversions are reporting from this site.'
            : 'No tag on this site yet. Nothing loads until a conversion ID and at least one label are saved.'}
        </span>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Conversion ID</label>
        <input
          type="text"
          value={state.conversionId}
          onChange={(e) => set('conversionId', e.target.value)}
          placeholder="AW-123456789"
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Google Ads → Goals → Conversions → the action → Tag setup. It is the part before the
          slash.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Form lead label
          </label>
          <input
            type="text"
            value={state.leadConversionLabel}
            onChange={(e) => set('leadConversionLabel', e.target.value)}
            placeholder="AbCdEfGhIjKlMnOp"
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Set this conversion action to <strong>page load</strong>, not click — the quote form
            is inside a shadow DOM that Google cannot auto-detect, so the page reports it
            explicitly.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Call click label <span className="text-gray-400">— optional</span>
          </label>
          <input
            type="text"
            value={state.callConversionLabel}
            onChange={(e) => set('callConversionLabel', e.target.value)}
            placeholder="Leave empty if HighLevel reports calls"
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Fires on every tap of a phone number anywhere on the site. Leave empty when
            HighLevel&apos;s Number Pool Calling already reports calls, or the account counts each
            one twice.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={state.enhancedConversions}
          onChange={(e) => set('enhancedConversions', e.target.checked)}
          className="mt-1"
        />
        <span>
          Enhanced conversions
          <span className="block text-xs text-gray-500">
            Sends the lead&apos;s email and phone with the conversion so Google can match it to
            the click. Google hashes both in the tag — nothing identifiable is stored here.
            Requires accepting the customer-data terms in the Ads account.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save tracking
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
