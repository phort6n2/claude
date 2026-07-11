'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  ShieldX,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AdsNav } from '@/components/master-leads/AdsNav'

type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'unknown'

interface HygieneCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
  recommendation?: string
}

interface ClientHygiene {
  clientId: string
  clientName: string
  customerId: string | null
  score: number
  checks: HygieneCheck[]
  apiError?: string
}

interface Data {
  connected: boolean
  clients: ClientHygiene[]
}

const STATUS_META: Record<CheckStatus, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  pass: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  warn: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  info: { icon: Info, color: 'text-sky-600', bg: 'bg-sky-50' },
  unknown: { icon: HelpCircle, color: 'text-gray-400', bg: 'bg-gray-50' },
}

function scoreColor(s: number) {
  return s >= 80 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-red-600'
}

export default function MobileAdsHealthPage() {
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
      const res = await fetch('/api/admin/ads-hygiene', { cache: 'no-store' })
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

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden pb-24">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/master-leads" className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Ads Health</h1>
              <p className="text-xs text-gray-500">Account setup &amp; signal quality</p>
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
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-2">
          {clients.map((c) => {
            const isOpen = open[c.clientId]
            const fails = c.checks.filter((x) => x.status === 'fail').length
            const warns = c.checks.filter((x) => x.status === 'warn').length
            return (
              <div key={c.clientId} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [c.clientId]: !o[c.clientId] }))}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div className={`text-2xl font-bold ${scoreColor(c.score)} w-12 shrink-0`}>{c.score}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.clientName}</h3>
                    <div className="flex items-center gap-3 text-xs mt-0.5">
                      {fails > 0 && <span className="text-red-600">{fails} to fix</span>}
                      {warns > 0 && <span className="text-amber-600">{warns} attention</span>}
                      {fails === 0 && warns === 0 && <span className="text-emerald-600">Looks good</span>}
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {c.apiError && (
                      <p className="px-4 py-2 text-xs text-amber-600">Some checks couldn&apos;t reach Google Ads: {c.apiError}</p>
                    )}
                    {c.checks.map((check) => {
                      const meta = STATUS_META[check.status]
                      const Icon = meta.icon
                      return (
                        <div key={check.id} className="flex items-start gap-2.5 px-4 py-2.5">
                          <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.color}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">{check.label}</p>
                            <p className="text-xs text-gray-500">{check.detail}</p>
                            {check.recommendation && (
                              <p className={`mt-1 text-xs rounded-lg px-2.5 py-1.5 ${meta.bg} ${meta.color}`}>
                                → {check.recommendation}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
