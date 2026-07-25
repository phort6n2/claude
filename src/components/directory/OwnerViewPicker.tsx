'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCog, Loader2, Search, ArrowRight } from 'lucide-react'

interface ShopOption {
  slug: string
  name: string
  city: string
  state: string
}

// Admin tool: open ANY shop's owner dashboard (what the shop owner sees) from
// the console. Uses the admin-only impersonate endpoint, then navigates to the
// owner view (which shows an "Admin view — back to console" banner).
export function OwnerViewPicker({ shops }: { shops: ShopOption[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [opening, setOpening] = useState('')
  const [error, setError] = useState('')

  const query = q.trim().toLowerCase()
  const matches = query
    ? shops
        .filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.city.toLowerCase().includes(query) ||
            s.slug.includes(query) ||
            `${s.city}, ${s.state}`.toLowerCase().includes(query)
        )
        .slice(0, 8)
    : []

  async function open(slug: string) {
    setOpening(slug)
    setError('')
    try {
      const res = await fetch('/api/directory/owner/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to open')
      router.push('/directory/owner')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open')
      setOpening('')
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <UserCog width={18} height={18} className="text-blue-600" /> Open a shop&apos;s dashboard
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        See exactly what a shop owner sees — their leads, rank, and profile — and edit on their
        behalf. You&apos;ll get an &ldquo;Admin view&rdquo; banner with a link back here.
      </p>

      <div className="relative mt-4">
        <Search
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by shop name or city…"
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {matches.length > 0 && (
        <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          {matches.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => open(s.slug)}
              disabled={opening === s.slug}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-gray-900">{s.name}</span>
                <span className="block text-xs text-gray-500">
                  {s.city}, {s.state.toUpperCase()}
                </span>
              </span>
              {opening === s.slug ? (
                <Loader2 className="animate-spin shrink-0 text-blue-600" width={16} height={16} />
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600">
                  Open <ArrowRight width={14} height={14} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {query && matches.length === 0 && (
        <p className="mt-3 text-sm text-gray-400">No shops match &ldquo;{q}&rdquo;.</p>
      )}
    </section>
  )
}
