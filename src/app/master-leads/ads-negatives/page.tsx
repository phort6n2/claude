'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2, ShieldX, ChevronDown, Copy, Check, Ban } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AdsNav } from '@/components/master-leads/AdsNav'

type Confidence = 'high' | 'medium'

interface NegativeSuggestion {
  term: string
  campaignName: string
  clicks: number
  cost: number
  reason: string
  confidence: Confidence
}

interface ClientNegatives {
  clientId: string
  clientName: string
  customerId: string | null
  wastedSpend: number
  suggestions: NegativeSuggestion[]
  apiError?: string
}

interface Data {
  connected: boolean
  clients: ClientNegatives[]
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function ClientCard({ client }: { client: ClientNegatives }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyTerms = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(client.suggestions.map((s) => s.term).join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-4 flex items-center gap-3 text-left">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{client.clientName}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {client.suggestions.length} suggested negative{client.suggestions.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-gray-500">Wasted 30d</p>
          <p className="text-base font-bold text-red-600">{usd(client.wastedSpend)}</p>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {client.apiError && (
            <p className="px-4 py-2 text-xs text-amber-600">Couldn&apos;t read search terms: {client.apiError}</p>
          )}
          {client.suggestions.length === 0 && !client.apiError && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No wasted-spend terms found. 🎉</p>
          )}
          {client.suggestions.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                <span className="text-xs text-gray-500">Add these as negatives in Google Ads</span>
                <button
                  onClick={copyTerms}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {client.suggestions.map((s, i) => (
                  <div key={`${s.term}-${i}`} className="flex items-start gap-2.5 px-4 py-2.5">
                    <Ban className={`h-4 w-4 shrink-0 mt-0.5 ${s.confidence === 'high' ? 'text-red-500' : 'text-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 break-words">{s.term}</p>
                      <p className="text-xs text-gray-500">{s.reason}</p>
                    </div>
                    <div className="text-right shrink-0 text-xs">
                      <p className="font-semibold text-gray-700">{usd(s.cost)}</p>
                      <p className="text-gray-400">{s.clicks} clk</p>
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

export default function MobileAdsNegativesPage() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetch('/api/admin/master-leads/auth')
      .then((res) => res.json())
      .then((d) => {
        if (d?.authorized) setAuthenticated(true)
        else if (d?.reason === 'not_authenticated') router.push('/login')
        else setAuthenticated(false)
      })
      .catch(() => router.push('/login'))
      .finally(() => setAuthChecking(false))
  }, [router])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/ads-negatives', { cache: 'no-store' })
      setData(await res.json())
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (authenticated) fetchData()
  }, [authenticated])

  if (authChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 text-center max-w-md shadow-lg">
          <ShieldX className="h-16 w-16 mx-auto mb-4 text-red-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <Button onClick={() => router.push('/admin')}>Go to Admin</Button>
        </div>
      </div>
    )
  }

  const clients = data?.clients || []
  const totalWasted = clients.reduce((s, c) => s + c.wastedSpend, 0)

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden pb-24">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/master-leads" className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Negative Keywords</h1>
              <p className="text-xs text-gray-500">Wasted &amp; irrelevant terms · 30d</p>
            </div>
          </div>
          <button
            onClick={() => { setRefreshing(true); fetchData() }}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={`h-5 w-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <AdsNav />
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : !data?.connected ? (
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800">
            Google Ads isn&apos;t connected yet.
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="bg-white rounded-xl shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 mb-0.5">Total wasted / irrelevant spend (30d)</p>
              <p className="text-2xl font-bold text-red-600">{usd(totalWasted)}</p>
            </div>
          </div>
          <div className="max-w-3xl mx-auto px-4 space-y-2">
            {clients.map((c) => (
              <ClientCard key={c.clientId} client={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
