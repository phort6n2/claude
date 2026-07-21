'use client'

import { useState } from 'react'
import { Inbox, Loader2, Search, Phone, Mail, Car } from 'lucide-react'

interface Quote {
  id: string
  shopSlug: string
  shopName: string
  name: string
  phone: string
  email?: string
  vehicle?: string
  service?: string
  message?: string
  createdAt: string
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function QuoteInbox() {
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quotes, setQuotes] = useState<Quote[] | null>(null)

  async function load() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/quotes', {
        headers: { 'x-upload-secret': secret },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setQuotes(json.quotes)
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Inbox width={18} height={18} className="text-blue-600" /> Quote requests
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Every lead submitted through the directory, newest first.
          </p>
        </div>
      </div>

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
          onClick={load}
          disabled={busy || !secret}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" width={16} height={16} /> : <Search width={16} height={16} />}
          Load leads
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {quotes && quotes.length === 0 && (
        <p className="mt-5 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          No quote requests yet. They&apos;ll show up here as visitors submit them.
        </p>
      )}

      {quotes && quotes.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-gray-500">{quotes.length} total</p>
          {quotes.map((q) => (
            <div key={q.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">{q.name}</span>
                <span className="text-xs text-gray-400">{timeAgo(q.createdAt)}</span>
              </div>
              <div className="mt-1 text-sm text-gray-500">
                for <span className="font-medium text-gray-700">{q.shopName}</span>
                {q.service ? ` · ${q.service}` : ''}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                <a href={`tel:${q.phone}`} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700">
                  <Phone width={14} height={14} /> {q.phone}
                </a>
                {q.email && (
                  <a href={`mailto:${q.email}`} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-blue-600">
                    <Mail width={14} height={14} /> {q.email}
                  </a>
                )}
                {q.vehicle && (
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    <Car width={14} height={14} /> {q.vehicle}
                  </span>
                )}
              </div>
              {q.message && <p className="mt-3 text-sm text-gray-700">{q.message}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
