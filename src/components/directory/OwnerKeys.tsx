'use client'

import { useState } from 'react'
import { KeyRound, Loader2, Search, Copy, Check } from 'lucide-react'

interface Owner {
  slug: string
  name: string
  claimed: boolean
  key: string
  link: string
}

export function OwnerKeys() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [owners, setOwners] = useState<Owner[] | null>(null)
  const [copied, setCopied] = useState('')

  async function load() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/owner/keys', {
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setOwners(json.owners)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function copy(link: string, slug: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(slug)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <KeyRound width={18} height={18} className="text-blue-600" /> Owner access links
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Send a shop its private link — they sign in to see their leads (and your upsell). Anyone
        with the link can access that listing, so share it only with the owner.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" width={16} height={16} /> : <Search width={16} height={16} />}
          Generate links
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {owners && (
        <div className="mt-5 space-y-2">
          {owners.map((o) => (
            <div
              key={o.slug}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{o.name}</span>
                  {o.claimed && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      claimed
                    </span>
                  )}
                </div>
                <p className="mt-0.5 max-w-md truncate text-xs text-gray-400">{o.link}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(o.link, o.slug)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === o.slug ? (
                  <>
                    <Check width={14} height={14} className="text-green-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy width={14} height={14} /> Copy link
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
