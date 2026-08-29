'use client'

import { useState } from 'react'
import { AlertCircle, Check, ExternalLink, Loader2 } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * Google Analytics for one shop.
 *
 * Its own card rather than a field inside the Ads panel, because Analytics is
 * not advertising: a shop with no campaigns still wants to know what their
 * site does, and burying the measurement id under a conversion snippet is how
 * it never gets filled in.
 *
 * It rides on the SAME gtag.js the Ads tag already loads — one loader, two
 * config lines. That is why there is no snippet to paste here: pasting
 * Google's block would load a second copy of the same library on every page.
 *
 * ONE PROPERTY PER SHOP, for the same reason Clarity is one project per shop.
 * A merged property averages away the differences that are worth acting on.
 */
export default function AnalyticsCard({
  clientId,
  measurementId,
}: {
  clientId: string
  measurementId: string | null
}) {
  const [value, setValue] = useState(measurementId || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const cleaned = extractMeasurementId(value)
  const valid = !value.trim() || !!cleaned

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ads-tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ga4MeasurementId: cleaned || '' }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      setValue(cleaned || '')
      setMessage({ ok: true, text: 'Saved. Every page reports to it within about 5 minutes.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 pt-4 space-y-3">
      <label className="block text-sm font-medium text-gray-900">Measurement ID</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="G-XXXXXXXXXX"
          spellCheck={false}
          className="px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !valid}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
      {!valid && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4" /> That is not a measurement ID. It looks like
          G-XXXXXXXXXX — the whole snippet is fine to paste, the ID is picked out of it.
        </p>
      )}
      {message && (
        <p className={`text-sm flex items-center gap-1.5 ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
          {message.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1.5">
        <p className="font-medium text-gray-900">Then link it to the Ads account</p>
        <p className="text-xs leading-relaxed">
          Nothing here can do that step — Google only allows it from their own UI, and pretending
          otherwise would leave you believing it was handled. In Google Ads: Tools → Data manager →
          Google Analytics (GA4) → Link. Once linked, import the GA4 conversions you want ALONGSIDE
          the AGMP actions rather than instead of them; a GA4 import of the same lead is a second
          count of it, and bidding treats the two as separate wins.
        </p>
        <a
          href="https://support.google.com/google-ads/answer/9350074"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          Google's instructions <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

/**
 * Pull the ID out of whatever got pasted — the bare code, the whole gtag
 * block, or a URL out of the GA4 admin. Same lesson as the Clarity field:
 * demanding the bare value means somebody reads a script block and picks the
 * wrong quoted string out of it.
 */
function extractMeasurementId(input: string): string | null {
  const match = /G-[A-Z0-9]{6,12}/i.exec(input || '')
  return match ? match[0].toUpperCase() : null
}
