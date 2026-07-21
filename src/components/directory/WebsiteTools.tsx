'use client'

import { useState } from 'react'
import { Wand2, Loader2, Search, TrendingUp } from 'lucide-react'
import type { ListingDraft, SeoReport } from '@/lib/directory/scaffold'

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-lime-100 text-lime-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-orange-100 text-orange-800',
  F: 'bg-red-100 text-red-800',
}

interface Prospect {
  slug: string
  name: string
  city: string
  state: string
  website: string
  seo: SeoReport
}

function toSeedJson(d: ListingDraft): string {
  const obj = {
    slug: d.slug ?? '',
    name: d.name ?? '',
    phone: d.phone ?? '',
    website: d.website,
    street: d.street ?? '',
    city: d.city ?? '',
    state: d.state ?? '',
    stateFull: d.stateFull ?? '',
    zip: d.zip ?? '',
    ...(d.country ? { country: d.country } : {}),
    ...(d.lat != null ? { lat: d.lat, lng: d.lng } : {}),
    services: d.services ?? [],
    mobileService: d.mobileService ?? false,
    insurance: [],
    hours:
      d.hours ??
      Array.from({ length: 7 }, (_, day) => ({ day, open: null, close: null })),
    description: d.description ?? '',
    ...(d.socials?.length ? { socials: d.socials } : {}),
    claimed: false,
    featured: false,
  }
  return JSON.stringify(obj, null, 2)
}

export function WebsiteTools() {
  const [secret, setSecret] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'' | 'scaffold' | 'audit'>('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ draft: ListingDraft; seo: SeoReport } | null>(null)
  const [prospects, setProspects] = useState<Prospect[] | null>(null)

  async function scaffold() {
    setBusy('scaffold')
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/directory/scaffold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-upload-secret': secret },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setResult(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy('')
    }
  }

  async function audit() {
    setBusy('audit')
    setError('')
    setProspects(null)
    try {
      const res = await fetch('/api/directory/scaffold', {
        headers: { 'x-upload-secret': secret },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setProspects(json.prospects)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy('')
    }
  }

  const input =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

  return (
    <div className="space-y-8">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="tools-secret">
          Upload secret
        </label>
        <input
          id="tools-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="DIRECTORY_UPLOAD_SECRET"
          className={input}
          autoComplete="off"
        />
      </div>

      {/* Auto-fill from URL */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Wand2 width={18} height={18} className="text-blue-600" /> Auto-fill a listing from a URL
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Paste a shop&apos;s website — we read its structured data and pre-fill the listing.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example-autoglass.com"
            className={input}
          />
          <button
            type="button"
            onClick={scaffold}
            disabled={busy !== '' || !url || !secret}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy === 'scaffold' ? <Loader2 className="animate-spin" width={16} height={16} /> : <Search width={16} height={16} />}
            Analyze
          </button>
        </div>

        {result && (
          <div className="mt-5 space-y-4">
            <SeoBadge seo={result.seo} />
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Name" value={result.draft.name} />
              <Field label="Phone" value={result.draft.phone} />
              <Field label="City / State" value={[result.draft.city, result.draft.state?.toUpperCase()].filter(Boolean).join(', ')} />
              <Field label="Hours" value={result.draft.hours ? 'detected' : undefined} />
              <Field label="Services" value={result.draft.services?.join(', ')} />
              <Field label="Socials" value={result.draft.socials?.map((s) => s.platform).join(', ')} />
            </dl>
            {result.draft.missing.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Still needs: {result.draft.missing.join(', ')}
              </p>
            )}
            <details className="rounded-lg border border-gray-200">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700">
                Copy JSON for the seed file
              </summary>
              <pre className="overflow-x-auto border-t border-gray-200 p-4 text-xs text-gray-800">
                {toSeedJson(result.draft)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* SEO opportunity scan */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <TrendingUp width={18} height={18} className="text-blue-600" /> SEO opportunities
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Rank your listings by how weak their site&apos;s SEO is — your best sales prospects.
            </p>
          </div>
          <button
            type="button"
            onClick={audit}
            disabled={busy !== '' || !secret}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {busy === 'audit' ? <Loader2 className="animate-spin" width={16} height={16} /> : <Search width={16} height={16} />}
            Scan listings
          </button>
        </div>

        {prospects && (
          <div className="mt-5 space-y-3">
            {prospects.map((p) => (
              <div key={p.slug} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-gray-900">{p.name}</span>{' '}
                    <span className="text-sm text-gray-500">
                      {p.city}, {p.state.toUpperCase()}
                    </span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_COLOR[p.seo.grade]}`}>
                    SEO {p.seo.grade} · {p.seo.opportunity}/100 opportunity
                  </span>
                </div>
                {p.seo.gaps.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                    {p.seo.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-1">
      <dt className="text-gray-500">{label}</dt>
      <dd className={value ? 'font-medium text-gray-900' : 'text-gray-400'}>{value || '—'}</dd>
    </div>
  )
}

function SeoBadge({ seo }: { seo: SeoReport }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_COLOR[seo.grade]}`}>
        SEO grade {seo.grade}
      </span>
      <span className="text-gray-600">
        {seo.opportunity}/100 sales opportunity · {seo.gaps.length} gaps
      </span>
    </div>
  )
}
