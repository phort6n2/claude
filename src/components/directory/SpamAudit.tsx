'use client'

import { useState } from 'react'
import { ShieldAlert, Loader2, Search, ShieldCheck } from 'lucide-react'

interface Flag {
  slug: string
  name: string
  city: string
  state: string
  googleCategory: string | null
  verdict: 'auto_glass' | 'automotive' | 'off_category' | 'no_data'
  reason: string
}

const BADGE: Record<Flag['verdict'], string> = {
  auto_glass: 'bg-green-100 text-green-800',
  automotive: 'bg-amber-100 text-amber-800',
  off_category: 'bg-red-100 text-red-800',
  no_data: 'bg-gray-100 text-gray-600',
}
const LABEL: Record<Flag['verdict'], string> = {
  auto_glass: 'Auto glass',
  automotive: 'Automotive?',
  off_category: 'Spam?',
  no_data: 'No data',
}

export function SpamAudit() {
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ checked: number; okCount: number; flagged: Flag[]; note?: string } | null>(null)

  async function audit() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/verify', { headers: { 'x-upload-secret': secret } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setResult(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <ShieldAlert width={18} height={18} className="text-blue-600" /> Spam check
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Verifies each listing against its Google Business Profile category. Real shops are
        &quot;Auto glass shop&quot; / &quot;Windshield repair&quot;; anything else is flagged for
        review. Reads the cached snapshot — no extra API cost.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="DIRECTORY_UPLOAD_SECRET"
          className={input}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={audit}
          disabled={busy || !secret}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" width={16} height={16} /> : <Search width={16} height={16} />}
          Scan listings
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-5">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <ShieldCheck width={16} height={16} className="text-green-600" />
            {result.okCount} of {result.checked} verified as auto glass
            {result.flagged.length > 0 && ` · ${result.flagged.length} to review`}
          </p>
          {result.note && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{result.note}</p>
          )}
          {result.flagged.length > 0 && (
            <div className="mt-3 space-y-2">
              {result.flagged.map((f) => (
                <div key={f.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3">
                  <div>
                    <span className="font-semibold text-gray-900">{f.name}</span>{' '}
                    <span className="text-sm text-gray-500">
                      {f.city}, {f.state.toUpperCase()}
                    </span>
                    <p className="text-xs text-gray-500">
                      {f.googleCategory ? `Google: ${f.googleCategory}` : f.reason}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[f.verdict]}`}>
                    {LABEL[f.verdict]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
