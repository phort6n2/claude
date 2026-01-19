'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Phone,
  FileText,
  TrendingUp,
  Users,
  Zap,
  Clock,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface WebhookStats {
  summary: {
    totalLeads: number
    leadsWithGclid: number
    gclidCaptureRate: string
    leadsToday: number
    leadsThisWeek: number
    enhancedConversionsSent: number
    enhancedConversionRate: string
    offlineConversionsSent: number
    leadsWithSyncErrors: number
  }
  bySource: Array<{ source: string; count: number }>
  byClient: Array<{ clientId: string; clientName: string; count: number }>
  recentLeads: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    source: string
    gclid: string | null
    enhancedConversionSent: boolean
    offlineConversionSent: boolean
    googleSyncError: string | null
    createdAt: string
    client: { businessName: string }
  }>
  failedConversions: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    gclid: string | null
    googleSyncError: string | null
    createdAt: string
    client: { businessName: string }
  }>
}

export default function WebhookStatusPage() {
  const [stats, setStats] = useState<WebhookStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/webhook-stats')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchStats()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <p className="text-gray-500">Failed to load stats</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Activity className="h-6 w-6 text-blue-600" />
                Webhook Status
              </h1>
              <p className="text-gray-600">Monitor lead capture and Google Ads conversions</p>
            </div>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-sm">Total Leads</span>
            </div>
            <div className="text-2xl font-bold">{stats.summary.totalLeads}</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Today</span>
            </div>
            <div className="text-2xl font-bold">{stats.summary.leadsToday}</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Zap className="h-4 w-4" />
              <span className="text-sm">GCLID Captured</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.summary.leadsWithGclid}</div>
            <div className="text-xs text-gray-500">{stats.summary.gclidCaptureRate} of leads</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Enhanced Sent</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.summary.enhancedConversionsSent}</div>
            <div className="text-xs text-gray-500">{stats.summary.enhancedConversionRate} success</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Offline Sent</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">{stats.summary.offlineConversionsSent}</div>
          </div>
        </div>

        {/* Error Alert */}
        {stats.summary.leadsWithSyncErrors > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl shadow-sm p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">
                {stats.summary.leadsWithSyncErrors} lead{stats.summary.leadsWithSyncErrors !== 1 ? 's' : ''} with sync errors
              </h3>
              <p className="text-sm text-red-700 mt-1">
                These leads have GCLID but failed to sync with Google Ads. Check the failed conversions below.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* By Source */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              Leads by Source
            </h3>
            <div className="space-y-2">
              {stats.bySource.map((s) => (
                <div key={s.source} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {s.source === 'PHONE' ? (
                      <Phone className="h-4 w-4 text-orange-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="text-sm text-gray-700">{s.source}</span>
                  </div>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Client */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              Leads by Client (Top 10)
            </h3>
            <div className="space-y-2">
              {stats.byClient.map((c) => (
                <div key={c.clientId} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 truncate">{c.clientName}</span>
                  <span className="font-medium">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Failed Conversions */}
        {stats.failedConversions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b bg-red-50">
              <h3 className="font-medium text-red-800 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Failed Conversions ({stats.failedConversions.length})
              </h3>
            </div>
            <div className="divide-y">
              {stats.failedConversions.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/admin/leads/${lead.id}`}
                  className="block p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-500">{lead.client.businessName}</p>
                      <p className="text-xs text-red-600 mt-1">{lead.googleSyncError}</p>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Leads */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              Recent Leads
            </h3>
          </div>
          <div className="divide-y">
            {stats.recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/admin/leads/${lead.id}`}
                className="block p-4 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {lead.source === 'PHONE' ? (
                      <div className="p-2 bg-orange-100 rounded-full">
                        <Phone className="h-4 w-4 text-orange-600" />
                      </div>
                    ) : (
                      <div className="p-2 bg-blue-100 rounded-full">
                        <FileText className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-500">{lead.client.businessName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {lead.gclid ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">GCLID</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">No GCLID</span>
                    )}
                    {lead.enhancedConversionSent && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Enhanced
                      </span>
                    )}
                    {lead.offlineConversionSent && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Offline
                      </span>
                    )}
                    {lead.googleSyncError && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Error
                      </span>
                    )}
                    <span className="text-sm text-gray-500">
                      {new Date(lead.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
