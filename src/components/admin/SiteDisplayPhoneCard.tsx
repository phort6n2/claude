'use client'

import { useState } from 'react'
import { Loader2, CircleCheck, TriangleAlert } from 'lucide-react'

/**
 * A tracking number this app does not own.
 *
 * Call tracking here normally means a Twilio number bought in-app: it rings
 * the shop, records, transcribes and gets scored. Some shops already run
 * tracking somewhere else — HighLevel, a call-tracking vendor, a Google
 * forwarding number — and feed those calls into their own ad reporting.
 *
 * Before this existed, that shop's hosted site showed their REAL switchboard
 * line, so every call the site earned landed on a number nothing was counting
 * and their Google Ads call conversions saw none of it. Collision is exactly
 * that case: the only place their tracked number appeared was one paragraph
 * of copy carried over from their old site.
 *
 * An in-app tracking number still wins when one is flagged for the site —
 * this is the fallback, not an override. And `Client.phone` is untouched
 * either way, because the LocalBusiness schema and call-asset verification
 * both have to keep reading the real line.
 */
export default function SiteDisplayPhoneCard({
  clientId,
  initialValue,
  realPhone,
}: {
  clientId: string
  initialValue: string | null
  realPhone: string
}) {
  const [value, setValue] = useState(initialValue || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(next: string) {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteDisplayPhone: next.trim() }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save')
      setStatus({
        ok: true,
        text: next.trim()
          ? 'Saved. The site shows this number now.'
          : `Cleared. The site shows ${realPhone} again.`,
      })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-6 pb-6 pt-2 border-t border-gray-100">
      <h3 className="font-semibold text-gray-900 text-sm">Or a number tracked somewhere else</h3>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        If this shop&apos;s calls are tracked outside this app — HighLevel, a call-tracking
        vendor, a Google forwarding number — put that number here and the whole site will show
        it: header, hero, every call button, the footer and the mobile bar. Leave it blank and
        the site shows {realPhone}.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => {
            if ((e.target.value || '').trim() !== (initialValue || '').trim()) save(e.target.value)
          }}
          placeholder={realPhone}
          className="w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          aria-label="Tracking number handled outside this app"
        />
        {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        {status && (
          <span
            className={`text-sm flex items-start gap-1.5 ${
              status.ok ? 'text-gray-700' : 'text-red-700'
            }`}
          >
            {status.ok && <CircleCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />}
            {status.text}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500 max-w-prose flex items-start gap-1.5">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Calls to a number this app does not own are not recorded, transcribed or scored here —
          whoever tracks it has that. A Twilio number added above takes precedence over this one.
          The real line stays on the business schema either way, so the Business Profile match is
          unaffected.
        </span>
      </p>
    </div>
  )
}
