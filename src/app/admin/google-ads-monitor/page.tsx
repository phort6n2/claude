'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Users,
  Banknote,
  Percent,
  ArrowUpRight,
  Sparkles,
  Building2,
  Zap,
  PiggyBank,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

type DateRange = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_7_DAYS' | 'LAST_30_DAYS'

interface AccountMetrics {
  clientId: string
  clientName: string
  clientSlug: string
  customerId: string
  accountName: string
  metrics: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    costPerConversion: number
    conversionValue: number
    ctr: number
    avgCpc: number
  } | null
  sales: {
    count: number
    value: number
  }
  leads: number
  error: string | null
}

interface CampaignMetrics {
  id: string
  name: string
  status: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  ctr: number
}

interface MetricsData {
  connected: boolean
  dateRange: DateRange
  accounts: AccountMetrics[]
  totals: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    conversionValue: number
    costPerConversion: number
    ctr: number
    avgCpc: number
    salesCount: number
    salesValue: number
    leadsCount: number
    costPerLead: number
    roas: number
  }
  error?: string
}

const dateRangeLabels: Record<DateRange, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
  LAST_7_DAYS: 'Last 7 Days',
  LAST_30_DAYS: 'Last 30 Days',
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCompactCurrency(value: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }
  return formatCurrency(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }
  return formatNumber(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`
}

export default function GoogleAdsMonitorPage() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('LAST_7_DAYS')
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Record<string, CampaignMetrics[]>>({})
  const [loadingCampaigns, setLoadingCampaigns] = useState<string | null>(null)

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`/api/admin/google-ads-metrics?dateRange=${dateRange}`)
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchMetrics()
  }, [dateRange])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchMetrics()
  }

  const toggleAccount = async (customerId: string) => {
    if (expandedAccount === customerId) {
      setExpandedAccount(null)
      return
    }

    setExpandedAccount(customerId)

    // Load campaigns if not already loaded
    if (!campaigns[customerId]) {
      setLoadingCampaigns(customerId)
      try {
        const res = await fetch('/api/admin/google-ads-metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId, dateRange }),
        })
        const result = await res.json()
        if (result.campaigns) {
          setCampaigns((prev) => ({ ...prev, [customerId]: result.campaigns }))
        }
      } catch (error) {
        console.error('Failed to load campaigns:', error)
      } finally {
        setLoadingCampaigns(null)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading Google Ads data...</p>
        </div>
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Google Ads Monitor</h1>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-amber-900 mb-2">Google Ads Not Connected</h2>
            <p className="text-amber-700 mb-6 max-w-md mx-auto">
              Connect your Google Ads MCC account to view live performance metrics, track conversions, and measure ROI.
            </p>
            <Link href="/admin/settings/google-ads">
              <Button className="bg-amber-600 hover:bg-amber-700">
                <Zap className="h-4 w-4 mr-2" />
                Connect Google Ads
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Sort accounts by spend (highest first), but only show accounts with activity
  const activeAccounts = (data.accounts || [])
    .filter(a => a.metrics && (a.metrics.cost > 0 || a.metrics.clicks > 0 || (a.leads || 0) > 0))
    .sort((a, b) => (b.metrics?.cost || 0) - (a.metrics?.cost || 0))

  const inactiveAccounts = (data.accounts || []).filter(
    a => !a.metrics || (a.metrics.cost === 0 && a.metrics.clicks === 0 && (a.leads || 0) === 0)
  )

  const isProfitable = (data.totals.salesValue || 0) > data.totals.cost

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                Google Ads Monitor
              </h1>
              <p className="text-gray-500 mt-1">Track performance & ROI across all accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            >
              {Object.entries(dateRangeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              className="shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Hero Stats - Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Ad Spend */}
          <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-red-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <DollarSign className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full">Ad Spend</span>
            </div>
            <div className="text-3xl font-bold mb-1">{formatCurrency(data.totals.cost)}</div>
            <div className="text-red-100 text-sm">{formatCurrency(data.totals.avgCpc)} avg CPC</div>
          </div>

          {/* Revenue */}
          <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Banknote className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full">Revenue</span>
            </div>
            <div className="text-3xl font-bold mb-1">{formatCurrency(data.totals.salesValue || 0)}</div>
            <div className="text-emerald-100 text-sm">{data.totals.salesCount || 0} sales closed</div>
          </div>

          {/* ROAS */}
          <div className={`bg-gradient-to-br ${isProfitable ? 'from-blue-500 to-indigo-600 shadow-blue-500/20' : 'from-amber-500 to-orange-600 shadow-amber-500/20'} rounded-2xl p-5 text-white shadow-lg`}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                {isProfitable ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full">ROAS</span>
            </div>
            <div className="text-3xl font-bold mb-1">{formatRoas(data.totals.roas || 0)}</div>
            <div className={`text-sm ${isProfitable ? 'text-blue-100' : 'text-amber-100'}`}>
              {isProfitable ? 'Profitable' : 'Below breakeven'}
            </div>
          </div>

          {/* Net Profit/Loss */}
          <div className={`bg-gradient-to-br ${isProfitable ? 'from-violet-500 to-purple-600 shadow-violet-500/20' : 'from-gray-500 to-slate-600 shadow-gray-500/20'} rounded-2xl p-5 text-white shadow-lg`}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <PiggyBank className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full">
                {isProfitable ? 'Profit' : 'Loss'}
              </span>
            </div>
            <div className="text-3xl font-bold mb-1">
              {isProfitable ? '+' : '-'}{formatCurrency(Math.abs((data.totals.salesValue || 0) - data.totals.cost))}
            </div>
            <div className={`text-sm ${isProfitable ? 'text-violet-100' : 'text-gray-300'}`}>
              {isProfitable ? 'Net profit' : 'Net loss'} for period
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs font-medium">Impressions</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{formatCompactNumber(data.totals.impressions)}</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <MousePointerClick className="h-4 w-4" />
              <span className="text-xs font-medium">Clicks</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{formatCompactNumber(data.totals.clicks)}</div>
            <div className="text-xs text-gray-400">{formatPercent(data.totals.ctr)} CTR</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Leads</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{formatNumber(data.totals.leadsCount || 0)}</div>
            <div className="text-xs text-gray-400">{formatCurrency(data.totals.costPerLead || 0)} CPL</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Target className="h-4 w-4" />
              <span className="text-xs font-medium">Conversions</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{formatNumber(data.totals.conversions)}</div>
            <div className="text-xs text-gray-400">{formatCurrency(data.totals.costPerConversion)} CPA</div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-medium">Sales</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{formatNumber(data.totals.salesCount || 0)}</div>
            <div className="text-xs text-gray-400">
              {(data.totals.leadsCount || 0) > 0
                ? `${(((data.totals.salesCount || 0) / (data.totals.leadsCount || 1)) * 100).toFixed(1)}% close rate`
                : 'No leads'
              }
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Percent className="h-4 w-4" />
              <span className="text-xs font-medium">Avg Sale</span>
            </div>
            <div className="text-xl font-bold text-gray-900">
              {(data.totals.salesCount || 0) > 0
                ? formatCurrency((data.totals.salesValue || 0) / (data.totals.salesCount || 1))
                : '$0'
              }
            </div>
          </div>
        </div>

        {/* Active Accounts */}
        {activeAccounts.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                Active Accounts ({activeAccounts.length})
              </h3>
              <span className="text-xs text-gray-500">Click to expand campaigns</span>
            </div>
            <div className="divide-y divide-gray-50">
              {activeAccounts.map((account) => {
                const accountRoas = account.metrics && account.metrics.cost > 0
                  ? (account.sales?.value || 0) / account.metrics.cost
                  : 0
                const accountProfitable = (account.sales?.value || 0) > (account.metrics?.cost || 0)

                return (
                  <div key={account.customerId}>
                    <div
                      className="px-5 py-4 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => toggleAccount(account.customerId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-gray-300">
                            {expandedAccount === account.customerId ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/admin/clients/${account.clientId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1"
                            >
                              {account.clientName}
                              <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                            </Link>
                            <p className="text-xs text-gray-400 font-mono">{account.customerId}</p>
                          </div>
                        </div>

                        {account.error ? (
                          <div className="text-sm text-red-500 flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg">
                            <AlertCircle className="h-4 w-4" />
                            <span className="truncate max-w-[200px]">{account.error}</span>
                          </div>
                        ) : account.metrics ? (
                          <div className="flex items-center gap-6">
                            {/* Spend */}
                            <div className="text-right">
                              <p className="text-xs text-gray-400 mb-0.5">Spend</p>
                              <p className="font-semibold text-red-600">{formatCurrency(account.metrics.cost)}</p>
                            </div>
                            {/* Leads */}
                            <div className="text-right">
                              <p className="text-xs text-gray-400 mb-0.5">Leads</p>
                              <p className="font-semibold text-gray-900">{account.leads || 0}</p>
                            </div>
                            {/* Sales */}
                            <div className="text-right">
                              <p className="text-xs text-gray-400 mb-0.5">Sales</p>
                              <p className="font-semibold text-emerald-600">{account.sales?.count || 0}</p>
                            </div>
                            {/* Revenue */}
                            <div className="text-right">
                              <p className="text-xs text-gray-400 mb-0.5">Revenue</p>
                              <p className="font-semibold text-emerald-600">{formatCurrency(account.sales?.value || 0)}</p>
                            </div>
                            {/* ROAS */}
                            <div className="text-right min-w-[70px]">
                              <p className="text-xs text-gray-400 mb-0.5">ROAS</p>
                              <p className={`font-semibold ${accountProfitable ? 'text-blue-600' : 'text-amber-600'}`}>
                                {formatRoas(accountRoas)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-sm">No data</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Campaign Details */}
                    {expandedAccount === account.customerId && (
                      <div className="bg-gradient-to-b from-gray-50 to-gray-100/50 px-5 py-4 border-t border-gray-100">
                        {loadingCampaigns === account.customerId ? (
                          <div className="flex items-center justify-center py-6">
                            <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                            <span className="ml-2 text-gray-500">Loading campaigns...</span>
                          </div>
                        ) : campaigns[account.customerId]?.length ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                              Active Campaigns
                            </p>
                            {campaigns[account.customerId].map((campaign) => (
                              <div
                                key={campaign.id}
                                className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between shadow-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${campaign.status === 'ENABLED' ? 'bg-green-500' : 'bg-gray-300'}`} />
                                  <div>
                                    <p className="font-medium text-gray-900">{campaign.name}</p>
                                    <p className="text-xs text-gray-400">{campaign.status}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                  <div className="text-right">
                                    <p className="text-xs text-gray-400">Spend</p>
                                    <p className="font-medium text-gray-900">{formatCurrency(campaign.cost)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-400">Clicks</p>
                                    <p className="font-medium text-gray-900">{formatNumber(campaign.clicks)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-400">Conv</p>
                                    <p className="font-medium text-green-600">{formatNumber(campaign.conversions)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-400">CTR</p>
                                    <p className="font-medium text-gray-900">{formatPercent(campaign.ctr * 100)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-gray-400">
                            <p>No campaigns with spend in this period</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Inactive Accounts */}
        {inactiveAccounts.length > 0 && (
          <div className="bg-white/50 rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50/50">
              <h3 className="font-medium text-gray-500 text-sm flex items-center gap-2">
                Inactive Accounts ({inactiveAccounts.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-50">
              {inactiveAccounts.map((account) => (
                <div key={account.customerId} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-500">{account.clientName}</p>
                    <p className="text-xs text-gray-400 font-mono">{account.customerId}</p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">No activity</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-400">
          Showing {dateRangeLabels[dateRange]} data • Last refreshed: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
