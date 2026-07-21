'use client'

import { useState } from 'react'
import { ClipboardList, Loader2, Search, Phone, Mail, Globe, Truck } from 'lucide-react'

interface Claim {
  id: string
  type: 'claim' | 'new_listing'
  businessName: string
  email: string
  contactName?: string
  phone?: string
  website?: string
  city?: string
  state?: string
  googleCategory?: string
  verifyVerdict?: string
  serviceAreaOnly?: boolean
  existingShopSlug?: string
  wantsMarketingHelp?: boolean
  message?: string
  createdAt: string
}

const VERDICT: Record<string, { label: string; cls: string }> = {
  auto_glass: { label: 'Auto glass ✓', cls: 'bg-green-100 text-green-800' },
  automotive: { label: 'Automotive?', cls: 'bg-amber-100 text-amber-800' },
  off_category: { label: 'Spam?', cls: 'bg-red-100 text-red-800' },
  no_data: { label: 'Unverified', cls: 'bg-gray-100 text-gray-600' },
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(0, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function ClaimsInbox() {
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [claims, setClaims] = useState<Claim[] | null>(null)

  async function load() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/claim', { headers: { 'x-upload-secret': secret } })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setClaims(json.claims)
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
        <ClipboardList width={18} height={18} className="text-blue-600" /> Claims &amp; submissions
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        New listings and claims awaiting review, with each one&apos;s Google category verdict.
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
          onClick={load}
          disabled={busy || !secret}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" width={16} height={16} /> : <Search width={16} height={16} />}
          Load claims
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {claims && claims.length === 0 && (
        <p className="mt-5 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          No claims yet. Submissions from the claim page show up here.
        </p>
      )}

      {claims && claims.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-gray-500">{claims.length} total</p>
          {claims.map((c) => {
            const v = VERDICT[c.verifyVerdict ?? 'no_data'] ?? VERDICT.no_data
            return (
              <div key={c.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{c.businessName}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {c.type === 'claim' ? 'Claim' : 'New listing'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>
                  </div>
                  <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {[c.city, c.state?.toUpperCase()].filter(Boolean).join(', ')}
                  {c.googleCategory ? ` · Google: ${c.googleCategory}` : ''}
                  {c.serviceAreaOnly ? ' · mobile/SAB' : ''}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700">
                    <Mail width={14} height={14} /> {c.email}
                  </a>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-gray-600 hover:text-blue-600">
                      <Phone width={14} height={14} /> {c.phone}
                    </a>
                  )}
                  {c.website && (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-gray-600 hover:text-blue-600">
                      <Globe width={14} height={14} /> website
                    </a>
                  )}
                  {c.wantsMarketingHelp && (
                    <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 text-xs font-medium text-blue-700">
                      wants marketing help
                    </span>
                  )}
                </div>
                {c.message && <p className="mt-3 text-sm text-gray-700">{c.message}</p>}
                {c.serviceAreaOnly && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-gray-400">
                    <Truck width={12} height={12} /> Service-area business
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
