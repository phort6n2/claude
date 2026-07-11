'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, Copy, Check, Ban, TrendingDown } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/ui/theme'

type Confidence = 'high' | 'medium'

interface NegativeSuggestion {
  term: string
  campaignName: string
  adGroupName: string
  clicks: number
  cost: number
  conversions: number
  reason: string
  trigger: string
  confidence: Confidence
}

interface ClientNegatives {
  clientId: string
  clientName: string
  slug: string
  customerId: string | null
  connected: boolean
  wastedSpend: number
  suggestions: NegativeSuggestion[]
  apiError?: string
}

interface Response {
  connected: boolean
  clients: ClientNegatives[]
  error?: string
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function ClientCard({ client }: { client: ClientNegatives }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyTerms = async () => {
    const text = client.suggestions.map((s) => s.term).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const highCount = client.suggestions.filter((s) => s.confidence === 'high').length

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50">
          <TrendingDown className="h-6 w-6 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 truncate">{client.clientName}</div>
          <div className="text-xs text-gray-400">{client.customerId || 'No customer ID'}</div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="text-gray-600">
              {client.suggestions.length} suggested negative{client.suggestions.length === 1 ? '' : 's'}
            </span>
            {highCount > 0 && <span className="text-red-600">{highCount} high-confidence</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Wasted / irrelevant</div>
          <div className="text-lg font-bold text-red-600">{usd(client.wastedSpend)}</div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {client.apiError && (
            <div className="px-5 py-3 text-xs text-amber-600">
              Couldn&apos;t read search terms from Google Ads: {client.apiError}
            </div>
          )}
          {client.suggestions.length === 0 && !client.apiError && (
            <div className="px-5 py-6 text-sm text-gray-400 text-center">
              No wasted-spend or irrelevant terms found above the thresholds. 🎉
            </div>
          )}
          {client.suggestions.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-xs text-gray-500">
                  Review, then add as campaign/ad-group negatives in Google Ads.
                </span>
                <button
                  onClick={copyTerms}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy all terms'}
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {client.suggestions.map((s, i) => (
                  <div key={`${s.term}-${i}`} className="flex items-start gap-3 px-5 py-3">
                    <Ban
                      className={`h-4 w-4 shrink-0 mt-0.5 ${s.confidence === 'high' ? 'text-red-500' : 'text-amber-500'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{s.term}</span>
                        <span
                          className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                            s.confidence === 'high'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {s.confidence}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{s.reason}</p>
                      <p className="text-[11px] text-gray-400">
                        {s.campaignName} › {s.adGroupName}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-xs">
                      <div className="font-semibold text-gray-700">{usd(s.cost)}</div>
                      <div className="text-gray-400">{s.clicks} clicks</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdsNegativesPage() {
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ads-negatives', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const clients = data?.clients || []
  const totalWasted = clients.reduce((s, c) => s + c.wastedSpend, 0)
  const totalSuggestions = clients.reduce((s, c) => s + c.suggestions.length, 0)

  return (
    <PageContainer>
      <PageHeader
        title="Negative Keywords"
        subtitle="Wasted-spend and irrelevant search terms across all accounts — suggested negatives, review before adding"
        onRefresh={load}
        isRefreshing={loading}
      />

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && data && !data.connected && (
        <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-gray-500">
          Google Ads isn&apos;t connected yet. Connect the MCC account in Settings → Google Ads.
        </div>
      )}

      {!loading && data?.connected && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Accounts scanned</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{clients.length}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Suggested negatives</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{totalSuggestions}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Wasted / irrelevant (30d)</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{usd(totalWasted)}</div>
            </div>
          </div>

          {clients.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-gray-500">
              No clients with a Google Ads account configured yet.
            </div>
          ) : (
            <div className="space-y-4">
              {clients.map((c) => (
                <ClientCard key={c.clientId} client={c} />
              ))}
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
