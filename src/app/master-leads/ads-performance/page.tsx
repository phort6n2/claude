'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, Loader2, ShieldX, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AdsNav } from '@/components/master-leads/AdsNav'

type CampaignConstraint = 'budget-limited' | 'rank-limited' | 'ok'

interface CampaignPerformance {
  id: string
  name: string
  cost: number
  conversions: number
  conversionsValue: number
  constraint: CampaignConstraint
}

interface ClientPerformance {
  clientId: string
  clientName: string
  customerId: string | null
  spend: number
  realLeads: number
  realSales: number
  realRevenue: number
  costPerLead: number
  costPerSale: number
  trueRoas: number
  campaigns: CampaignPerformance[]
  apiError?: string
}

interface Data {
  connected: boolean
  clients: ClientPerformance[]
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const CONSTRAINT_LABEL: Record<CampaignConstraint, { text: string; cls: string }> = {
  'budget-limited': { text: 'Budget-limited', cls: 'bg-amber-50 text-amber-700' },
  'rank-limited': { text: 'Rank-limited', cls: 'bg-purple-50 text-purple-700' },
  ok: { text: 'OK', cls: 'bg-emerald-50 text-emerald-700' },
}

export default function MobileAdsPerformancePage() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})

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
      const res = await fetch('/api/admin/ads-performance', { cache: 'no-store' })
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
  const totalSpend = clients.reduce((s, c) => s + c.spend, 0)
  const totalRevenue = clients.reduce((s, c) => s + c.realRevenue, 0)
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden pb-24">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/master-leads" className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Ads Performance</h1>
              <p className="text-xs text-gray-500">True ROAS · last 30 days</p>
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
            <div className="bg-white rounded-xl shadow-sm p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Spend</p>
                <p className="text-lg font-bold text-red-600">{usd(totalSpend)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Revenue</p>
                <p className="text-lg font-bold text-emerald-600">{usd(totalRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">ROAS</p>
                <p className="text-lg font-bold text-gray-900">{blendedRoas.toFixed(1)}x</p>
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 space-y-2">
            {clients.map((c) => {
              const isOpen = open[c.clientId]
              return (
                <div key={c.clientId} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [c.clientId]: !o[c.clientId] }))}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">{c.clientName}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${c.trueRoas >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {c.trueRoas.toFixed(1)}x ROAS
                        </span>
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div><p className="text-[11px] text-gray-500">Spend</p><p className="text-sm font-semibold text-gray-900">{usd(c.spend)}</p></div>
                      <div><p className="text-[11px] text-gray-500">Revenue</p><p className="text-sm font-semibold text-emerald-600">{usd(c.realRevenue)}</p></div>
                      <div><p className="text-[11px] text-gray-500">Sales</p><p className="text-sm font-semibold text-gray-900">{c.realSales}</p></div>
                      <div><p className="text-[11px] text-gray-500">$/sale</p><p className="text-sm font-semibold text-gray-900">{c.realSales > 0 ? usd(c.costPerSale) : '—'}</p></div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                      {c.apiError && <p className="text-xs text-amber-600">Google Ads: {c.apiError}</p>}
                      {c.campaigns.length === 0 && !c.apiError && (
                        <p className="text-xs text-gray-400">No active campaigns.</p>
                      )}
                      {c.campaigns.map((cam) => (
                        <div key={cam.id} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-700 truncate flex-1">{cam.name}</span>
                          <span className="text-xs text-gray-500 shrink-0">{usd(cam.cost)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${CONSTRAINT_LABEL[cam.constraint].cls}`}>
                            {CONSTRAINT_LABEL[cam.constraint].text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
