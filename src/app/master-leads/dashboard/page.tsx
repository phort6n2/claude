'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  DollarSign,
  Inbox,
} from 'lucide-react'

interface Row {
  clientId: string
  businessName: string
  slug: string
  status: string
  callCoachingEnabled: boolean
  leads: number
  priorLeads: number
  deltaPct: number | null
  calls: number
  forms: number
  decided: number
  sold: number
  pctSold: number | null
  revenue: number
  avgCoachingScore: number | null
  lastLeadAt: string | null
}

interface DashboardData {
  rangeDays: number
  sinceIso: string
  totals: {
    totalLeads: number
    totalSales: number
    totalRevenue: number
    activeClients: number
    totalClients: number
  }
  rows: Row[]
}

const RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '365d', value: 365 },
]

type SortKey = 'businessName' | 'leads' | 'deltaPct' | 'sold' | 'pctSold' | 'revenue' | 'avgCoachingScore' | 'lastLeadAt'
type SortDir = 'asc' | 'desc'

export default function ClientsDashboardPage() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [days, setDays] = useState(30)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('leads')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Match the master-leads auth flow.
  useEffect(() => {
    fetch('/api/admin/master-leads/auth')
      .then((res) => res.json())
      .then((d) => {
        if (d?.authorized) {
          setAuthenticated(true)
        } else if (d?.reason === 'not_authenticated') {
          router.push('/login')
        } else {
          setAuthenticated(false)
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setAuthChecking(false))
  }, [router])

  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/clients-dashboard?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json: DashboardData) => {
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days, authenticated])

  const sortedRows = useMemo(() => {
    if (!data) return []
    const rows = [...data.rows]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      // Nulls sort to the bottom regardless of direction.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return rows
  }, [data, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'businessName' ? 'asc' : 'desc')
    }
  }

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Not authorized to view this page.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/master-leads"
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Back to leads list"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Clients Dashboard</h1>
              <p className="text-sm text-gray-500">
                Cross-client lead & sales overview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  days === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {loading && (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading dashboard…
          </div>
        )}
        {error && <div className="text-sm text-red-600">Failed to load: {error}</div>}
        {data && !loading && (
          <>
            <SummaryCards data={data} />
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 text-left bg-gray-50">
                    <Th k="businessName" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>
                      Client
                    </Th>
                    <Th k="leads" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      Leads
                    </Th>
                    <Th k="deltaPct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      vs prior
                    </Th>
                    <th className="py-2 px-3 text-right font-normal">Calls / Forms</th>
                    <Th k="sold" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      Sales
                    </Th>
                    <Th k="pctSold" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      % Sold
                    </Th>
                    <Th k="revenue" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      $ Sold
                    </Th>
                    <Th k="avgCoachingScore" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      Coaching
                    </Th>
                    <Th k="lastLeadAt" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right>
                      Last lead
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <ClientRow key={r.clientId} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function SummaryCards({ data }: { data: DashboardData }) {
  const t = data.totals
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        icon={Inbox}
        label="Leads delivered"
        value={t.totalLeads.toLocaleString()}
        subtitle={`across ${t.activeClients} active client${t.activeClients === 1 ? '' : 's'}`}
      />
      <Card
        icon={TrendingUp}
        label="Sales closed"
        value={t.totalSales.toLocaleString()}
      />
      <Card
        icon={DollarSign}
        label="Revenue"
        value={`$${Math.round(t.totalRevenue).toLocaleString()}`}
      />
      <Card
        icon={Users}
        label="Clients"
        value={`${t.activeClients} / ${t.totalClients}`}
        subtitle="active / total"
      />
    </div>
  )
}

function Card({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ElementType
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
      <div className="text-blue-600 mt-0.5">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
      </div>
    </div>
  )
}

function Th({
  k,
  sortKey,
  sortDir,
  onClick,
  right,
  children,
}: {
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
  right?: boolean
  children: React.ReactNode
}) {
  const active = sortKey === k
  return (
    <th
      className={`py-2 px-3 font-normal cursor-pointer select-none ${
        right ? 'text-right' : 'text-left'
      } ${active ? 'text-gray-900' : ''}`}
      onClick={() => onClick(k)}
    >
      {children}
      {active && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

function ClientRow({ row }: { row: Row }) {
  const r = row
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-3">
        <Link
          href={`/master-leads?clientId=${r.clientId}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {r.businessName}
        </Link>
        {r.status !== 'ACTIVE' && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">
            {r.status}
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-900 font-medium">
        {r.leads}
      </td>
      <td className="py-2 px-3 text-right">
        <DeltaCell delta={r.deltaPct} priorLeads={r.priorLeads} />
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-700">
        <span className="text-violet-600">{r.calls}</span>
        <span className="text-gray-300 mx-1">/</span>
        <span className="text-blue-600">{r.forms}</span>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-900">{r.sold}</td>
      <td className="py-2 px-3 text-right tabular-nums">
        {r.pctSold != null ? (
          <span
            className={
              r.pctSold >= 50
                ? 'text-green-600 font-medium'
                : r.pctSold >= 25
                ? 'text-yellow-700'
                : 'text-gray-700'
            }
          >
            {r.pctSold}%
            <span className="text-[10px] text-gray-400 ml-1">({r.decided})</span>
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-gray-900">
        {r.revenue > 0 ? `$${Math.round(r.revenue).toLocaleString()}` : <span className="text-gray-400">—</span>}
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        {r.avgCoachingScore != null ? (
          <span
            className={
              r.avgCoachingScore >= 80
                ? 'text-green-600 font-medium'
                : r.avgCoachingScore >= 60
                ? 'text-yellow-700'
                : r.avgCoachingScore >= 40
                ? 'text-orange-600'
                : 'text-red-600'
            }
          >
            {r.avgCoachingScore}
          </span>
        ) : (
          <span className="text-gray-400" title={!r.callCoachingEnabled ? 'Coaching disabled' : 'No completed analyses in range'}>
            —
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-right text-gray-600">
        {r.lastLeadAt ? relativeTime(r.lastLeadAt) : <span className="text-gray-400">never</span>}
      </td>
    </tr>
  )
}

function DeltaCell({ delta, priorLeads }: { delta: number | null; priorLeads: number }) {
  if (delta === null) {
    return (
      <span className="text-[10px] text-gray-400" title="No leads in prior period">
        new
      </span>
    )
  }
  if (delta === 0 && priorLeads === 0) {
    return <span className="text-gray-300">—</span>
  }
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${color}`} title={`Prior period: ${priorLeads} leads`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? '+' : ''}
      {delta}%
    </span>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
