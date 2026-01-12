'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Activity,
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  BarChart3,
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
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export default function GoogleAdsMonitorPage() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('TODAY')
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Google Ads Monitor</h1>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-yellow-800 mb-2">Google Ads Not Connected</h2>
            <p className="text-yellow-700 mb-4">
              Connect your Google Ads MCC account to view live performance metrics.
            </p>
            <Link href="/admin/settings/integrations">
              <Button>Connect Google Ads</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-blue-600" />
                Google Ads Monitor
              </h1>
              <p className="text-gray-600">Live performance metrics across all accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(dateRangeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Total Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-sm">Impressions</span>
            </div>
            <div className="text-2xl font-bold">{formatNumber(data.totals.impressions)}</div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <MousePointerClick className="h-4 w-4" />
              <span className="text-sm">Clicks</span>
            </div>
            <div className="text-2xl font-bold">{formatNumber(data.totals.clicks)}</div>
            <div className="text-xs text-gray-500">{formatPercent(data.totals.ctr)} CTR</div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Cost</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(data.totals.cost)}</div>
            <div className="text-xs text-gray-500">{formatCurrency(data.totals.avgCpc)} avg CPC</div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Target className="h-4 w-4" />
              <span className="text-sm">Conversions</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{formatNumber(data.totals.conversions)}</div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Cost/Conv</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.totals.costPerConversion)}
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Conv Value</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(data.totals.conversionValue)}
            </div>
          </div>
        </div>

        {/* Accounts List */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-medium text-gray-900">
              Account Performance ({data.accounts.length} accounts)
            </h3>
          </div>
          <div className="divide-y">
            {data.accounts.map((account) => (
              <div key={account.customerId}>
                <div
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleAccount(account.customerId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedAccount === account.customerId ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{account.clientName}</p>
                        <p className="text-sm text-gray-500">{account.customerId}</p>
                      </div>
                    </div>

                    {account.error ? (
                      <div className="text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {account.error}
                      </div>
                    ) : account.metrics ? (
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-right">
                          <p className="text-gray-500">Spend</p>
                          <p className="font-medium text-red-600">
                            {formatCurrency(account.metrics.cost)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-500">Clicks</p>
                          <p className="font-medium">{formatNumber(account.metrics.clicks)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-500">Conv</p>
                          <p className="font-medium text-green-600">
                            {formatNumber(account.metrics.conversions)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-500">Cost/Conv</p>
                          <p className="font-medium text-blue-600">
                            {formatCurrency(account.metrics.costPerConversion)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">No data</span>
                    )}
                  </div>
                </div>

                {/* Expanded Campaign Details */}
                {expandedAccount === account.customerId && (
                  <div className="bg-gray-50 px-4 py-3 border-t">
                    {loadingCampaigns === account.customerId ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                        <span className="ml-2 text-gray-500">Loading campaigns...</span>
                      </div>
                    ) : campaigns[account.customerId]?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                          Campaigns
                        </p>
                        {campaigns[account.customerId].map((campaign) => (
                          <div
                            key={campaign.id}
                            className="bg-white rounded border p-3 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{campaign.name}</p>
                              <p className="text-xs text-gray-500">{campaign.status}</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <div className="text-right">
                                <p className="text-gray-500">Spend</p>
                                <p className="font-medium">{formatCurrency(campaign.cost)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-gray-500">Clicks</p>
                                <p className="font-medium">{formatNumber(campaign.clicks)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-gray-500">Conv</p>
                                <p className="font-medium text-green-600">
                                  {formatNumber(campaign.conversions)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm py-2">No active campaigns found</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Last Updated */}
        <div className="mt-4 text-center text-sm text-gray-500">
          Showing {dateRangeLabels[dateRange]} data • Last refreshed:{' '}
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
