'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  HelpCircle,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/ui/theme'

type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'unknown'
type CheckCategory = 'setup' | 'signal' | 'bidding'

interface HygieneCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
  recommendation?: string
  category: CheckCategory
}

interface ClientHygiene {
  clientId: string
  clientName: string
  slug: string
  customerId: string | null
  connected: boolean
  score: number
  checks: HygieneCheck[]
  apiError?: string
}

interface AuditResponse {
  connected: boolean
  clients: ClientHygiene[]
  error?: string
}

const STATUS_META: Record<
  CheckStatus,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  pass: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Good' },
  warn: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Attention' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Fix' },
  info: { icon: Info, color: 'text-sky-600', bg: 'bg-sky-50', label: 'Info' },
  unknown: { icon: HelpCircle, color: 'text-gray-400', bg: 'bg-gray-50', label: 'Unknown' },
}

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  setup: 'Setup',
  signal: 'Conversion signal',
  bidding: 'Bidding',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function scoreRingColor(score: number): string {
  if (score >= 80) return 'stroke-emerald-500'
  if (score >= 50) return 'stroke-amber-500'
  return 'stroke-red-500'
}

function ScoreRing({ score }: { score: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-gray-100" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={scoreRingColor(score)}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${scoreColor(score)}`}>
        {score}
      </div>
    </div>
  )
}

function CheckRow({ check }: { check: HygieneCheck }) {
  const meta = STATUS_META[check.status]
  const Icon = meta.icon
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${meta.color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">{check.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {CATEGORY_LABEL[check.category]}
          </span>
        </div>
        <p className="text-sm text-gray-500">{check.detail}</p>
        {check.recommendation && (
          <p className={`mt-1 text-sm rounded-lg px-3 py-2 ${meta.bg} ${meta.color}`}>
            → {check.recommendation}
          </p>
        )}
      </div>
    </div>
  )
}

function ClientCard({ client }: { client: ClientHygiene }) {
  const [open, setOpen] = useState(false)
  const counts = client.checks.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1
      return acc
    },
    {} as Record<CheckStatus, number>
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <ScoreRing score={client.score} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 truncate">{client.clientName}</div>
          <div className="text-xs text-gray-400">{client.customerId || 'No customer ID'}</div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            {counts.fail ? <span className="text-red-600">{counts.fail} to fix</span> : null}
            {counts.warn ? <span className="text-amber-600">{counts.warn} attention</span> : null}
            {counts.pass ? <span className="text-emerald-600">{counts.pass} good</span> : null}
            {counts.unknown ? <span className="text-gray-400">{counts.unknown} unknown</span> : null}
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-2 divide-y divide-gray-50">
          {client.apiError && (
            <div className="py-2.5 text-xs text-amber-600">
              Some checks couldn&apos;t reach Google Ads: {client.apiError}
            </div>
          )}
          {client.checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdsHealthPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ads-hygiene', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const json: AuditResponse = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const clients = data?.clients || []
  const avgScore =
    clients.length > 0 ? Math.round(clients.reduce((s, c) => s + c.score, 0) / clients.length) : 0
  const needAttention = clients.filter((c) => c.score < 80).length

  return (
    <PageContainer>
      <PageHeader
        title="Ads Health"
        subtitle="Per-client Google Ads account-hygiene audit — setup, conversion signal, and bidding readiness"
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
          <ShieldCheck className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-gray-600 font-medium">Google Ads isn&apos;t connected yet</p>
          <p className="text-sm text-gray-400">
            Connect the MCC account in Settings → Google Ads to run the audit.
          </p>
        </div>
      )}

      {!loading && data?.connected && clients.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Accounts audited</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{clients.length}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Average score</div>
              <div className={`mt-1 text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Need attention</div>
              <div className="mt-1 text-2xl font-bold text-amber-600">{needAttention}</div>
            </div>
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
            <div key={i} className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
