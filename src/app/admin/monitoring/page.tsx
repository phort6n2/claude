'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Users,
  FileText,
  ArrowLeft,
  Calendar,
  Loader2,
} from 'lucide-react'

interface CronRun {
  id: string
  action: string
  status: 'SUCCESS' | 'FAILED' | 'STARTED' | 'RETRYING'
  clientName: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  errorMessage: string | null
  responseData: {
    processed?: number
    successful?: number
    failed?: number
    results?: Array<{
      clientName?: string
      success?: boolean
      error?: string
    }>
  } | null
}

interface ClientStatus {
  id: string
  businessName: string
  scheduleDayPair: string | null
  scheduleTimeSlot: number | null
  lastAutoScheduledAt: string | null
  lastContent: {
    id: string
    status: string
    paaQuestion: string
    scheduledDate: string
    createdAt: string
    publishedAt: string | null
  } | null
}

interface FailedContent {
  id: string
  clientName: string
  clientId: string
  paaQuestion: string
  createdAt: string
  status: string
}

interface MonitoringData {
  overview: {
    contentCreatedToday: number
    contentPublishedToday: number
    activeClientsWithSchedule: number
    failedContentLast7Days: number
  }
  stats: {
    last24Hours: { success: number; failed: number; total: number }
    last7Days: { success: number; failed: number; total: number }
  }
  recentCronRuns: CronRun[]
  clientStatus: ClientStatus[]
  failedContent: FailedContent[]
}

// Convert slot index to Mountain Time display
const SLOT_TO_MOUNTAIN_TIME: Record<number, string> = {
  0: '7:00 AM',
  1: '8:00 AM',
  2: '9:00 AM',
  3: '10:00 AM',
  4: '11:00 AM',
  5: '1:00 PM',
  6: '2:00 PM',
  7: '3:00 PM',
  8: '4:00 PM',
  9: '5:00 PM',
}

const DAY_PAIR_LABELS: Record<string, string> = {
  MON_WED: 'Mon & Wed',
  TUE_THU: 'Tue & Thu',
  WED_FRI: 'Wed & Fri',
  MON_THU: 'Mon & Thu',
  TUE_FRI: 'Tue & Fri',
  MON_FRI: 'Mon & Fri',
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    cron_hourly_publish: 'Hourly Publish',
    cron_auto_schedule_weekly: 'Weekly Schedule',
    cron_daily_publish: 'Daily Publish',
    cron_generate_content: 'Generate Content',
  }
  return labels[action] || action.replace('cron_', '').replace(/_/g, ' ')
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = async () => {
    try {
      const response = await fetch('/api/admin/monitoring')
      if (!response.ok) throw new Error('Failed to fetch')
      const result = await response.json()
      setData(result)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          <p className="font-medium">Failed to load monitoring data</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const successRate24h = data.stats.last24Hours.total > 0
    ? ((data.stats.last24Hours.success / data.stats.last24Hours.total) * 100).toFixed(0)
    : '100'

  const successRate7d = data.stats.last7Days.total > 0
    ? ((data.stats.last7Days.success / data.stats.last7Days.total) * 100).toFixed(0)
    : '100'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monitoring Dashboard</h1>
            <p className="text-sm text-gray-500">Cron jobs, publishing status, and system health</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <span className="text-xs text-gray-400">
            Updated {formatTimeAgo(lastRefresh.toISOString())}
          </span>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <FileText className="h-4 w-4" />
            Created Today
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {data.overview.contentCreatedToday}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <CheckCircle className="h-4 w-4" />
            Published Today
          </div>
          <div className="text-2xl font-bold text-green-600">
            {data.overview.contentPublishedToday}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Users className="h-4 w-4" />
            Active Clients
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {data.overview.activeClientsWithSchedule}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <AlertTriangle className="h-4 w-4" />
            Failed (7d)
          </div>
          <div className={`text-2xl font-bold ${data.overview.failedContentLast7Days > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {data.overview.failedContentLast7Days}
          </div>
        </div>
      </div>

      {/* Success Rate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Last 24 Hours</h3>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-3xl font-bold text-gray-900">{successRate24h}%</span>
              <span className="text-sm text-gray-500 ml-2">success rate</span>
            </div>
            <div className="text-right text-sm">
              <div className="text-green-600">{data.stats.last24Hours.success} succeeded</div>
              <div className="text-red-600">{data.stats.last24Hours.failed} failed</div>
              <div className="text-gray-400">{data.stats.last24Hours.total} total</div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{ width: `${successRate24h}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Last 7 Days</h3>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-3xl font-bold text-gray-900">{successRate7d}%</span>
              <span className="text-sm text-gray-500 ml-2">success rate</span>
            </div>
            <div className="text-right text-sm">
              <div className="text-green-600">{data.stats.last7Days.success} succeeded</div>
              <div className="text-red-600">{data.stats.last7Days.failed} failed</div>
              <div className="text-gray-400">{data.stats.last7Days.total} total</div>
            </div>
          </div>
          <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{ width: `${successRate7d}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cron Runs */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Cron Runs
            </h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {data.recentCronRuns.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm text-center">
                No cron runs recorded yet
              </div>
            ) : (
              data.recentCronRuns.map((run) => (
                <div key={run.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {run.status === 'SUCCESS' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : run.status === 'FAILED' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="font-medium text-sm">{getActionLabel(run.action)}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(run.startedAt)}
                    </span>
                  </div>
                  <div className="mt-1 ml-6 text-xs text-gray-500">
                    {run.clientName !== 'System' && (
                      <span className="mr-3">{run.clientName}</span>
                    )}
                    <span className="text-gray-400">{formatDuration(run.durationMs)}</span>
                    {run.responseData?.processed !== undefined && (
                      <span className="ml-3">
                        Processed: {run.responseData.processed}
                        {run.responseData.successful !== undefined && (
                          <span className="text-green-600 ml-1">
                            ({run.responseData.successful} ok)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {run.errorMessage && (
                    <div className="mt-1 ml-6 text-xs text-red-600 truncate">
                      {run.errorMessage}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Client Status */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Client Schedules
            </h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {data.clientStatus.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm text-center">
                No clients with auto-schedule enabled
              </div>
            ) : (
              data.clientStatus.map((client) => (
                <div key={client.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="font-medium text-sm text-blue-600 hover:underline"
                      >
                        {client.businessName}
                      </Link>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {client.scheduleDayPair && DAY_PAIR_LABELS[client.scheduleDayPair]}
                        {client.scheduleTimeSlot !== null && (
                          <span className="ml-2">
                            @ {SLOT_TO_MOUNTAIN_TIME[client.scheduleTimeSlot]} MT
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {client.lastContent ? (
                        <>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            client.lastContent.status === 'PUBLISHED'
                              ? 'bg-green-100 text-green-700'
                              : client.lastContent.status === 'GENERATING'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {client.lastContent.status}
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatTimeAgo(client.lastContent.createdAt)}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">No content yet</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Failed Content */}
      {data.failedContent.length > 0 && (
        <div className="mt-6 bg-white rounded-lg border">
          <div className="p-4 border-b bg-red-50">
            <h2 className="font-semibold text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Failed Content (Last 7 Days)
            </h2>
          </div>
          <div className="divide-y">
            {data.failedContent.map((item) => (
              <div key={item.id} className="p-3 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/admin/clients/${item.clientId}`}
                      className="font-medium text-sm text-blue-600 hover:underline"
                    >
                      {item.clientName}
                    </Link>
                    <div className="text-xs text-gray-600 mt-0.5 max-w-md truncate">
                      {item.paaQuestion}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatTimeAgo(item.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
