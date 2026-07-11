'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  TrendingUp,
  DollarSign,
  Target,
  Wallet,
  Gauge,
  AlertTriangle,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/ui/theme'

type CampaignConstraint = 'budget-limited' | 'rank-limited' | 'ok'

interface CampaignPerformance {
  id: string
  name: string
  status: string
  biddingStrategyType: string
  budget: number
  cost: number
  clicks: number
  impressions: number
  conversions: number
  conversionsValue: number
  searchImpressionShare: number
  searchBudgetLostIS: number
  searchRankLostIS: number
  constraint: CampaignConstraint
}

interface ClientPerformance {
  clientId: string
  clientName: string
  slug: string
  customerId: string | null
  connected: boolean
  spend: number
  googleConversions: number
  googleConversionsValue: number
  realLeads: number
  realSales: number
  realRevenue: number
  costPerLead: number
  costPerSale: number
  trueRoas: number
  campaigns: CampaignPerformance[]
  apiError?: string
}

interface PerformanceResponse {
  connected: boolean
  clients: ClientPerformance[]
  error?: string
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const CONSTRAINT_META: Record<
  CampaignConstraint,
  { label: string; color: string; show: boolean }
> = {
  'budget-limited': { label: 'Budget-limited', color: 'bg-amber-50 text-amber-700', show: true },
  'rank-limited': { label: 'Rank-limited', color: 'bg-sky-50 text-sky-700', show: true },
  ok: { label: 'OK', color: 'bg-emerald-50 text-emerald-700', show: false },
}

function roasColor(roas: number): string {
  if (roas >= 3) return 'text-emerald-600'
  if (roas >= 1) return 'text-amber-600'
  return 'text-red-600'
}

function formatRoas(roas: number): string {
  return `${roas.toFixed(2)}×`
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function ConstraintBadge({ constraint }: { constraint: CampaignConstraint }) {
  const meta = CONSTRAINT_META[constraint]
  if (!meta.show) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.color}`}>
      <AlertTriangle className="h-3 w-3" />
      {meta.label}
    </span>
  )
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${valueClass || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function ClientCard({ client }: { client: ClientPerformance }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 truncate">{client.clientName}</div>
          <div className="text-xs text-gray-400">{client.customerId || 'No customer ID'}</div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Metric label="Spend" value={usd.format(client.spend)} />
            <Metric label="Leads" value={String(client.realLeads)} />
            <Metric label="Sales" value={String(client.realSales)} />
            <Metric label="Revenue" value={usd.format(client.realRevenue)} />
            <Metric label="True ROAS" value={formatRoas(client.trueRoas)} valueClass={roasColor(client.trueRoas)} />
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          {client.apiError && (
            <div className="mb-3 text-xs text-amber-600">
              Couldn&apos;t reach Google Ads for this account: {client.apiError}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Metric label="Cost / lead" value={client.costPerLead > 0 ? usd2.format(client.costPerLead) : '—'} />
            <Metric label="Cost / sale" value={client.costPerSale > 0 ? usd2.format(client.costPerSale) : '—'} />
            <Metric label="Google conv." value={client.googleConversions.toFixed(1)} />
            <Metric label="Google value" value={usd.format(client.googleConversionsValue)} />
          </div>

          {client.campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="py-2 pr-3 font-medium">Campaign</th>
                    <th className="py-2 px-3 font-medium text-right">Spend</th>
                    <th className="py-2 px-3 font-medium text-right">Clicks</th>
                    <th className="py-2 px-3 font-medium text-right">Conv.</th>
                    <th className="py-2 px-3 font-medium text-right">Impr. share</th>
                    <th className="py-2 pl-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {client.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-gray-900 truncate max-w-[220px]">{c.name}</div>
                        <div className="text-[11px] text-gray-400">{c.biddingStrategyType}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{usd.format(c.cost)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{c.clicks.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{c.conversions.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{pct(c.searchImpressionShare)}</td>
                      <td className="py-2.5 pl-3">
                        <ConstraintBadge constraint={c.constraint} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !client.apiError && (
              <div className="text-sm text-gray-400">No active campaigns with spend in the last 30 days.</div>
            )
          )}
        </div>
      )}
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${valueClass || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

export default function AdsPerformancePage() {
  const [data, setData] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ads-performance', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const json: PerformanceResponse = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load performance')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const clients = data?.clients || []
  const totalSpend = clients.reduce((s, c) => s + c.spend, 0)
  const totalRevenue = clients.reduce((s, c) => s + c.realRevenue, 0)
  const totalSales = clients.reduce((s, c) => s + c.realSales, 0)
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0
  const costPerSale = totalSales > 0 ? totalSpend / totalSales : 0

  return (
    <PageContainer>
      <PageHeader
        title="Ads Performance"
        subtitle="Per-client ROAS tied to real booked revenue — not Google's self-reported conversion value"
        onRefresh={load}
        isRefreshing={loading}
      />

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && data && !data.connected && (
        <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-gray-600 font-medium">Google Ads isn&apos;t connected yet</p>
          <p className="text-sm text-gray-400">
            Connect the MCC account in Settings → Google Ads to see performance.
          </p>
        </div>
      )}

      {!loading && data?.connected && clients.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatTile icon={Wallet} label="Total spend" value={usd.format(totalSpend)} />
            <StatTile icon={DollarSign} label="Real revenue" value={usd.format(totalRevenue)} />
            <StatTile
              icon={Gauge}
              label="Blended ROAS"
              value={formatRoas(blendedRoas)}
              valueClass={roasColor(blendedRoas)}
            />
            <StatTile icon={Target} label="Cost / sale" value={costPerSale > 0 ? usd2.format(costPerSale) : '—'} />
          </div>

          <div className="space-y-4">
            {clients.map((c) => (
              <ClientCard key={c.clientId} client={c} />
            ))}
          </div>
        </>
      )}

      {!loading && data?.connected && clients.length === 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-gray-500">
          No clients with a Google Ads account configured yet.
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
