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
  TrendingUp,
  TrendingDown,
  BarChart3,
  List,
  CalendarDays,
  Timer,
  Zap,
  Eye,
  ExternalLink,
  PlayCircle,
  PauseCircle,
} from 'lucide-react'

interface CronRun {
  id: string
  action: string
  status: 'SUCCESS' | 'FAILED' | 'STARTED' | 'RETRYING'
  clientId: string | null
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
  nextPublish: { day: string; daysUntil: number } | null
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

interface RecentContent {
  id: string
  clientName: string
  clientId: string
  paaQuestion: string
  status: string
  createdAt: string
  publishedAt: string | null
}

interface UpcomingRun {
  clientId: string
  clientName: string
  scheduledTime: string
  displayTime: string
  dayName: string
  hoursUntil: number
}

interface MonitoringData {
  overview: {
    contentCreatedToday: number
    contentPublishedToday: number
    activeClientsWithSchedule: number
    failedContentLast7Days: number
  }
  weeklyComparison: {
    thisWeek: { created: number; published: number }
    lastWeek: { created: number; published: number }
    weekStartDate: string
  }
  activityByDay: Record<string, number>
  upcomingRuns: UpcomingRun[]
  stats: {
    last24Hours: { success: number; failed: number; total: number }
    last7Days: { success: number; failed: number; total: number }
  }
  recentCronRuns: CronRun[]
  clientStatus: ClientStatus[]
  recentContent: RecentContent[]
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

// Loading skeleton components
function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-5 bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse">
      <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
      <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-200 rounded" />
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <div className="p-4 flex items-center gap-4 animate-pulse">
      <div className="w-8 h-8 bg-gray-200 rounded-full" />
      <div className="flex-1">
        <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-48 bg-gray-200 rounded" />
      </div>
      <div className="h-4 w-16 bg-gray-200 rounded" />
    </div>
  )
}

// Success rate ring component
function SuccessRateRing({
  rate,
  size = 120,
  strokeWidth = 8,
  label,
  details
}: {
  rate: number | null
  size?: number
  strokeWidth?: number
  label: string
  details: { success: number; failed: number; total: number }
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = rate !== null ? circumference - (rate / 100) * circumference : circumference

  const getColor = (r: number | null) => {
    if (r === null) return { stroke: '#e5e7eb', text: 'text-gray-400', bg: 'from-gray-50 to-white' }
    if (r >= 90) return { stroke: '#22c55e', text: 'text-green-600', bg: 'from-green-50 to-white' }
    if (r >= 70) return { stroke: '#eab308', text: 'text-yellow-600', bg: 'from-yellow-50 to-white' }
    return { stroke: '#ef4444', text: 'text-red-600', bg: 'from-red-50 to-white' }
  }

  const colors = getColor(rate)

  return (
    <div className={`bg-gradient-to-br ${colors.bg} rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300`}>
      <div className="flex items-center gap-6">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors.stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${colors.text}`}>
              {rate !== null ? `${rate}%` : '--'}
            </span>
            <span className="text-xs text-gray-500">success</span>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-3">{label}</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Succeeded</span>
              <span className="font-medium text-green-600">{details.success}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Failed</span>
              <span className="font-medium text-red-600">{details.failed}</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200">
              <span className="text-gray-500">Total</span>
              <span className="font-medium text-gray-900">{details.total}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Activity bar chart component
function ActivityChart({ data }: { data: Record<string, number> }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const maxCount = Math.max(...Object.values(data), 1)
  const todayIndex = new Date().getDay()
  const todayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][todayIndex]

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-6 border border-indigo-100 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Weekly Activity</h3>
          <p className="text-xs text-gray-500">Published content by day</p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 h-32">
        {days.map(day => {
          const count = data[day] || 0
          const height = count > 0 ? Math.max((count / maxCount) * 100, 15) : 5
          const isToday = todayName === day

          return (
            <div key={day} className="flex-1 flex flex-col items-center group">
              <div className="relative w-full flex justify-center mb-1">
                {count > 0 && (
                  <span className="absolute -top-5 text-xs font-semibold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    {count}
                  </span>
                )}
              </div>
              <div className="w-full flex justify-center flex-1 items-end">
                <div
                  className={`w-full max-w-10 rounded-t-lg transition-all duration-300 group-hover:scale-105 ${
                    count > 0
                      ? isToday
                        ? 'bg-gradient-to-t from-indigo-600 to-indigo-400'
                        : 'bg-gradient-to-t from-emerald-500 to-emerald-400'
                      : 'bg-gray-200'
                  }`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className={`text-xs mt-2 font-medium ${
                isToday ? 'text-indigo-600' : 'text-gray-500'
              }`}>
                {day}
              </span>
              {isToday && (
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Upcoming runs timeline component
function UpcomingRunsTimeline({ runs }: { runs: UpcomingRun[] }) {
  if (runs.length === 0) return null

  return (
    <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl p-6 border border-amber-100 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Timer className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Upcoming Runs</h3>
          <p className="text-xs text-gray-500">Next 24 hours</p>
        </div>
      </div>

      <div className="space-y-3">
        {runs.slice(0, 6).map((run, idx) => (
          <div
            key={`${run.clientId}-${idx}`}
            className="flex items-center gap-4 p-3 rounded-xl bg-white/50 hover:bg-white transition-colors border border-amber-50 hover:border-amber-200 group"
          >
            <div className="relative">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                run.hoursUntil === 0
                  ? 'bg-green-100 text-green-600'
                  : run.hoursUntil <= 2
                    ? 'bg-yellow-100 text-yellow-600'
                    : 'bg-blue-100 text-blue-600'
              }`}>
                {run.hoursUntil === 0 ? (
                  <PlayCircle className="h-5 w-5" />
                ) : (
                  <Clock className="h-5 w-5" />
                )}
              </div>
              {run.hoursUntil === 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <Link
                href={`/admin/clients/${run.clientId}`}
                className="font-medium text-gray-900 hover:text-blue-600 transition-colors truncate block"
              >
                {run.clientName}
              </Link>
              <p className="text-xs text-gray-500">
                {run.dayName} @ {run.displayTime} MT
              </p>
            </div>

            <div className="text-right">
              {run.hoursUntil === 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Running
                </span>
              ) : run.hoursUntil === 1 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
                  1 hour
                </span>
              ) : (
                <span className="text-sm text-gray-500">{run.hoursUntil}h</span>
              )}
            </div>
          </div>
        ))}

        {runs.length > 6 && (
          <div className="text-center pt-2">
            <span className="text-xs text-amber-600 font-medium">+{runs.length - 6} more scheduled</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeTab, setActiveTab] = useState<'cron' | 'content' | 'clients'>('cron')

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
              <div>
                <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>

          {/* Content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border">
              {[...Array(4)].map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </div>
            <div className="bg-white rounded-2xl p-6 border">
              {[...Array(4)].map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-red-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to Load</h2>
          <p className="text-gray-500 mb-6">{error || 'Unable to fetch monitoring data'}</p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const successRate24h = data.stats.last24Hours.total > 0
    ? Math.round((data.stats.last24Hours.success / data.stats.last24Hours.total) * 100)
    : null

  const successRate7d = data.stats.last7Days.total > 0
    ? Math.round((data.stats.last7Days.success / data.stats.last7Days.total) * 100)
    : null

  const weeklyChange = data.weeklyComparison.thisWeek.published - data.weeklyComparison.lastWeek.published
  const weeklyChangePercent = data.weeklyComparison.lastWeek.published > 0
    ? Math.round((weeklyChange / data.weeklyComparison.lastWeek.published) * 100)
    : data.weeklyComparison.thisWeek.published > 0 ? 100 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="p-2.5 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Monitoring Dashboard</h1>
              <p className="text-sm text-gray-500">System health, cron jobs, and publishing status</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                autoRefresh
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {autoRefresh ? (
                <PlayCircle className="h-4 w-4" />
              ) : (
                <PauseCircle className="h-4 w-4" />
              )}
              Auto-refresh {autoRefresh ? 'on' : 'off'}
            </button>

            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm font-medium text-gray-700 transition-all shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <div className="text-xs text-gray-400 bg-white/50 px-3 py-2 rounded-lg border border-gray-100">
              Updated {formatTimeAgo(lastRefresh.toISOString())}
            </div>
          </div>
        </div>

        {/* Overview Stats - Gradient Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full -ml-6 -mb-6" />
            <div className="relative">
              <div className="flex items-center gap-2 text-blue-100 text-sm mb-2">
                <FileText className="h-4 w-4" />
                Created Today
              </div>
              <div className="text-4xl font-bold mb-1">
                {data.overview.contentCreatedToday}
              </div>
              <div className="text-blue-200 text-xs">Content items</div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full -ml-6 -mb-6" />
            <div className="relative">
              <div className="flex items-center gap-2 text-emerald-100 text-sm mb-2">
                <CheckCircle className="h-4 w-4" />
                Published Today
              </div>
              <div className="text-4xl font-bold mb-1">
                {data.overview.contentPublishedToday}
              </div>
              <div className="text-emerald-200 text-xs">Successfully published</div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/20">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full -ml-6 -mb-6" />
            <div className="relative">
              <div className="flex items-center gap-2 text-violet-100 text-sm mb-2">
                <Users className="h-4 w-4" />
                Active Clients
              </div>
              <div className="text-4xl font-bold mb-1">
                {data.overview.activeClientsWithSchedule}
              </div>
              <div className="text-violet-200 text-xs">With auto-schedule</div>
            </div>
          </div>

          <div className={`relative overflow-hidden rounded-2xl p-5 shadow-lg ${
            data.overview.failedContentLast7Days > 0
              ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-500/20'
              : 'bg-gradient-to-br from-gray-100 to-gray-50 text-gray-900 shadow-gray-200/50'
          }`}>
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 ${
              data.overview.failedContentLast7Days > 0 ? 'bg-white/10' : 'bg-gray-200/50'
            }`} />
            <div className="relative">
              <div className={`flex items-center gap-2 text-sm mb-2 ${
                data.overview.failedContentLast7Days > 0 ? 'text-red-100' : 'text-gray-500'
              }`}>
                <AlertTriangle className="h-4 w-4" />
                Failed (7 Days)
              </div>
              <div className="text-4xl font-bold mb-1">
                {data.overview.failedContentLast7Days}
              </div>
              <div className={`text-xs ${
                data.overview.failedContentLast7Days > 0 ? 'text-red-200' : 'text-gray-400'
              }`}>
                {data.overview.failedContentLast7Days === 0 ? 'All systems healthy' : 'Need attention'}
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Comparison & Activity Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Weekly Comparison Card */}
          <div className="bg-gradient-to-br from-cyan-50 to-white rounded-2xl p-6 border border-cyan-100 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-cyan-100 rounded-lg">
                <BarChart3 className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Weekly Comparison</h3>
                <p className="text-xs text-gray-500">Published content</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded-xl p-4 border border-cyan-100">
                <div className="text-xs font-medium text-cyan-600 mb-1">This Week</div>
                <div className="text-3xl font-bold text-gray-900">{data.weeklyComparison.thisWeek.published}</div>
                <div className="text-xs text-gray-500 mt-1">{data.weeklyComparison.thisWeek.created} created</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="text-xs font-medium text-gray-500 mb-1">Last Week</div>
                <div className="text-3xl font-bold text-gray-600">{data.weeklyComparison.lastWeek.published}</div>
                <div className="text-xs text-gray-400 mt-1">{data.weeklyComparison.lastWeek.created} created</div>
              </div>
            </div>

            {weeklyChange !== 0 && (
              <div className={`flex items-center gap-2 p-3 rounded-xl ${
                weeklyChange > 0 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
              }`}>
                {weeklyChange > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">
                  {weeklyChange > 0 ? '+' : ''}{weeklyChange} ({weeklyChange > 0 ? '+' : ''}{weeklyChangePercent}%)
                </span>
                <span className="text-xs opacity-75">vs last week</span>
              </div>
            )}
          </div>

          {/* Activity Chart - Takes 2 columns */}
          <div className="lg:col-span-2">
            <ActivityChart data={data.activityByDay} />
          </div>
        </div>

        {/* Success Rates & Upcoming Runs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <SuccessRateRing
            rate={successRate24h}
            label="Last 24 Hours"
            details={data.stats.last24Hours}
          />
          <SuccessRateRing
            rate={successRate7d}
            label="Last 7 Days"
            details={data.stats.last7Days}
          />
          <UpcomingRunsTimeline runs={data.upcomingRuns} />
        </div>

        {/* Tabbed Content Section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tab Header */}
          <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('cron')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'cron'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <Activity className="h-4 w-4" />
              Cron Runs
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'cron' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {data.recentCronRuns.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('content')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'content'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <List className="h-4 w-4" />
              Recent Content
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'content' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {data.recentContent.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('clients')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'clients'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Client Schedules
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'clients' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {data.clientStatus.length}
              </span>
            </button>

            {data.failedContent.length > 0 && (
              <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                {data.failedContent.length} failed
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div className="max-h-[500px] overflow-y-auto">
            {/* Cron Runs Tab */}
            {activeTab === 'cron' && (
              <div className="divide-y divide-gray-100">
                {data.recentCronRuns.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Activity className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No cron runs recorded yet</p>
                    <p className="text-sm text-gray-400 mt-1">Jobs will appear here when they run</p>
                  </div>
                ) : (
                  data.recentCronRuns.map((run) => (
                    <div key={run.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            run.status === 'SUCCESS'
                              ? 'bg-green-100'
                              : run.status === 'FAILED'
                                ? 'bg-red-100'
                                : 'bg-yellow-100'
                          }`}>
                            {run.status === 'SUCCESS' ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : run.status === 'FAILED' ? (
                              <XCircle className="h-5 w-5 text-red-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-yellow-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{getActionLabel(run.action)}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                run.status === 'SUCCESS'
                                  ? 'bg-green-100 text-green-700'
                                  : run.status === 'FAILED'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {run.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                              {run.clientName !== 'System' && run.clientId ? (
                                <Link
                                  href={`/admin/clients/${run.clientId}`}
                                  className="text-blue-600 hover:underline font-medium"
                                >
                                  {run.clientName}
                                </Link>
                              ) : run.clientName !== 'System' ? (
                                <span>{run.clientName}</span>
                              ) : null}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(run.durationMs)}
                              </span>
                              {run.responseData?.processed !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  {run.responseData.successful || 0}/{run.responseData.processed} processed
                                </span>
                              )}
                            </div>
                            {run.errorMessage && (
                              <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                                {run.errorMessage}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatTimeAgo(run.startedAt)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Content Tab */}
            {activeTab === 'content' && (
              <div className="divide-y divide-gray-100">
                {data.recentContent.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <List className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No content created recently</p>
                    <p className="text-sm text-gray-400 mt-1">Content from the last 7 days will appear here</p>
                  </div>
                ) : (
                  data.recentContent.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.status === 'PUBLISHED'
                              ? 'bg-green-100'
                              : item.status === 'GENERATING'
                                ? 'bg-yellow-100'
                                : item.status === 'FAILED'
                                  ? 'bg-red-100'
                                  : 'bg-gray-100'
                          }`}>
                            {item.status === 'PUBLISHED' ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : item.status === 'GENERATING' ? (
                              <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
                            ) : item.status === 'FAILED' ? (
                              <XCircle className="h-5 w-5 text-red-600" />
                            ) : (
                              <FileText className="h-5 w-5 text-gray-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/clients/${item.clientId}`}
                                className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                              >
                                {item.clientName}
                              </Link>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                item.status === 'PUBLISHED'
                                  ? 'bg-green-100 text-green-700'
                                  : item.status === 'GENERATING'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : item.status === 'FAILED'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-100 text-gray-600'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                            <Link
                              href={`/admin/content/${item.id}/review`}
                              className="text-sm text-gray-600 mt-1 truncate block hover:text-blue-600 transition-colors group"
                            >
                              <span className="truncate">{item.paaQuestion}</span>
                              <ExternalLink className="h-3 w-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          </div>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap">
                          {item.publishedAt ? (
                            <div className="text-green-600 font-medium">
                              Published {formatTimeAgo(item.publishedAt)}
                            </div>
                          ) : (
                            <div className="text-gray-400">
                              Created {formatTimeAgo(item.createdAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Clients Tab */}
            {activeTab === 'clients' && (
              <div className="divide-y divide-gray-100">
                {data.clientStatus.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">No clients with auto-schedule</p>
                    <p className="text-sm text-gray-400 mt-1">Enable auto-scheduling for clients to see them here</p>
                  </div>
                ) : (
                  data.clientStatus.map((client) => (
                    <div key={client.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            client.nextPublish?.daysUntil === 0
                              ? 'bg-green-100'
                              : client.nextPublish?.daysUntil === 1
                                ? 'bg-blue-100'
                                : 'bg-gray-100'
                          }`}>
                            {client.nextPublish?.daysUntil === 0 ? (
                              <Zap className="h-5 w-5 text-green-600" />
                            ) : (
                              <Calendar className="h-5 w-5 text-gray-500" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/admin/clients/${client.id}`}
                              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                            >
                              {client.businessName}
                            </Link>
                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                              {client.scheduleDayPair && (
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  {DAY_PAIR_LABELS[client.scheduleDayPair]}
                                </span>
                              )}
                              {client.scheduleTimeSlot !== null && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {SLOT_TO_MOUNTAIN_TIME[client.scheduleTimeSlot]} MT
                                </span>
                              )}
                            </div>
                            {client.nextPublish && (
                              <div className="mt-2">
                                {client.nextPublish.daysUntil === 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    Publishing today
                                  </span>
                                ) : client.nextPublish.daysUntil === 1 ? (
                                  <span className="text-sm text-blue-600">
                                    Next: Tomorrow ({client.nextPublish.day})
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-500">
                                    Next: {client.nextPublish.day} ({client.nextPublish.daysUntil} days)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {client.lastContent ? (
                            <Link
                              href={`/admin/content/${client.lastContent.id}/review`}
                              className="group"
                            >
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${
                                client.lastContent.status === 'PUBLISHED'
                                  ? 'bg-green-100 text-green-700'
                                  : client.lastContent.status === 'GENERATING'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}>
                                {client.lastContent.status}
                              </span>
                              <div className="text-xs text-gray-400 mt-1 group-hover:text-blue-600 transition-colors flex items-center justify-end gap-1">
                                {formatTimeAgo(client.lastContent.createdAt)}
                                <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">No content yet</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Failed Content Alert Section */}
        {data.failedContent.length > 0 && (
          <div className="mt-8 bg-gradient-to-br from-red-50 to-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-red-100 border-b border-red-200 flex items-center gap-3">
              <div className="p-2 bg-red-200 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <h3 className="font-semibold text-red-900">Failed Content</h3>
                <p className="text-sm text-red-700">{data.failedContent.length} items need attention from the last 7 days</p>
              </div>
            </div>
            <div className="divide-y divide-red-100">
              {data.failedContent.map((item) => (
                <div key={item.id} className="p-4 hover:bg-red-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/clients/${item.clientId}`}
                            className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            {item.clientName}
                          </Link>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            FAILED
                          </span>
                        </div>
                        <Link
                          href={`/admin/content/${item.id}/review`}
                          className="text-sm text-gray-600 mt-1 truncate block hover:text-blue-600 transition-colors group"
                        >
                          <span className="truncate">{item.paaQuestion}</span>
                          <ExternalLink className="h-3 w-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-400 whitespace-nowrap">
                      {formatTimeAgo(item.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
