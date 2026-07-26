'use client'

import { useState, useEffect } from 'react'
import {
  ClipboardList,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  Globe,
  Truck,
  Rocket,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'

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
  autoMatchedOn?: 'phone' | 'website' | 'name+city'
  wantsMarketingHelp?: boolean
  message?: string
  services?: string[]
  monthlyVolume?: string
  frustration?: string
  smsConsent?: boolean
  intent?: 'free' | 'featured'
  listingSlug?: string
  published?: boolean
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [claims, setClaims] = useState<Claim[] | null>(null)
  const [publishing, setPublishing] = useState('')
  const [published, setPublished] = useState<Set<string>>(new Set())

  async function load() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/claim')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setClaims(json.claims)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function publish(slug: string) {
    setPublishing(slug)
    setError('')
    try {
      const res = await fetch('/api/directory/listings/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to publish')
      setPublished((p) => new Set(p).add(slug))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish')
    } finally {
      setPublishing('')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const isDone = (c: Claim) =>
    !!c.published || (c.listingSlug ? published.has(c.listingSlug) : false)
  const active = claims ? claims.filter((c) => !isDone(c)) : null
  const done = claims ? claims.filter(isDone) : []

  function card(c: Claim) {
    const v = VERDICT[c.verifyVerdict ?? 'no_data'] ?? VERDICT.no_data
    const doneCard = isDone(c)
    return (
      <div key={c.id} className={`rounded-lg border border-gray-200 p-4 ${doneCard ? 'bg-gray-50' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{c.businessName}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {c.type === 'claim' ? 'Claim' : 'New listing'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>
            {/* They used "Add your shop" but we already listed them — worth a
                glance to confirm it's the same business, not a 2nd location. */}
            {c.autoMatchedOn && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                auto-matched on {c.autoMatchedOn}
              </span>
            )}
            {!doneCard && c.intent === 'featured' && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                wants Featured
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
        </div>
        <div className="mt-1 text-sm text-gray-500">
          {[c.city, c.state?.toUpperCase()].filter(Boolean).join(', ')}
          {c.googleCategory ? ` · Google: ${c.googleCategory}` : ''}
          {c.serviceAreaOnly ? ' · mobile only' : ''}
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
        {(c.monthlyVolume || c.services?.length || c.smsConsent) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {c.monthlyVolume && (
              <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                ~{c.monthlyVolume} jobs/mo
              </span>
            )}
            {c.services?.map((s) => (
              <span key={s} className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {s.replace(/-/g, ' ')}
              </span>
            ))}
            {c.smsConsent && (
              <span className="rounded bg-green-50 px-2 py-0.5 font-medium text-green-700">
                SMS opt-in ✓
              </span>
            )}
          </div>
        )}
        {c.frustration && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">Frustration:</span> {c.frustration}
          </p>
        )}
        {c.message && <p className="mt-3 text-sm text-gray-700">{c.message}</p>}
        {c.serviceAreaOnly && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-gray-400">
            <Truck width={12} height={12} /> Service-area business
          </p>
        )}

        {/* Approve & publish a new-listing submission for free */}
        {c.type === 'new_listing' && c.listingSlug && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            {doneCard ? (
              <a
                href={`/directory/shop/${c.listingSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700"
              >
                <CheckCircle2 width={15} height={15} /> Published — view listing
                <ExternalLink width={13} height={13} />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => publish(c.listingSlug as string)}
                disabled={publishing === c.listingSlug}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {publishing === c.listingSlug ? (
                  <Loader2 className="animate-spin" width={14} height={14} />
                ) : (
                  <Rocket width={14} height={14} />
                )}
                Approve &amp; publish (free)
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <ClipboardList width={18} height={18} className="text-blue-600" /> Claims &amp; submissions
            {active && active.length > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                {active.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            New listings and claims awaiting review, with each one&apos;s Google category verdict.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" width={15} height={15} /> : <RefreshCw width={15} height={15} />}
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {active && active.length === 0 && (
        <p className="mt-5 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          {done.length > 0
            ? 'Nothing waiting on you. Published listings are below.'
            : 'No claims yet. Submissions from the claim page show up here.'}
        </p>
      )}

      {active && active.length > 0 && <div className="mt-5 space-y-3">{active.map(card)}</div>}

      {done.length > 0 && (
        <details className="mt-6 rounded-lg border border-gray-100 bg-gray-50/50 p-1" open={!active || active.length === 0}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-500">
            Published ({done.length})
          </summary>
          <div className="space-y-3 p-2">{done.map(card)}</div>
        </details>
      )}
    </section>
  )
}
