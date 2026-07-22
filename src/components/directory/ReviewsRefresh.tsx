'use client'

import { useState } from 'react'
import { Star, Loader2, RefreshCw } from 'lucide-react'

export function ReviewsRefresh() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const res = await fetch('/api/directory/reviews/refresh', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setMsg(`Updated ${json.updated} of ${json.total} shops from Google.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Star width={18} height={18} className="text-blue-600" /> Google ratings
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Ratings refresh automatically once a month. Use this to pull them now — it&apos;s the only
        action that calls the Google API, so cost stays fixed no matter your traffic.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" width={16} height={16} /> : <RefreshCw width={16} height={16} />}
          Refresh now
        </button>
      </div>
      {msg && (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {msg}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}
