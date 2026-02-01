'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  RefreshCw,
  Target,
  DollarSign,
  TrendingUp,
  Loader2,
  ShieldX,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface AccountMetrics {
  clientId: string
  clientName: string
  customerId: string
  metrics: {
    conversions: number
    cost: number
    costPerConversion: number
  } | null
  error: string | null
}

interface MetricsData {
  connected: boolean
  accounts: AccountMetrics[]
  totals: {
    conversions: number
    cost: number
    costPerConversion: number
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(value)
}

export default function MasterLeadsAdsPage() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Check master leads authorization
  useEffect(() => {
    fetch('/api/admin/master-leads/auth')
      .then((res) => res.json())
      .then((data) => {
        if (data?.authorized) {
          setAuthenticated(true)
        } else if (data?.reason === 'not_authenticated') {
          router.push('/login')
        } else {
          setAuthenticated(false)
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => setAuthChecking(false))
  }, [router])

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/admin/google-ads-metrics?dateRange=TODAY')
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
    if (authenticated) {
      fetchMetrics()
    }
  }, [authenticated])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchMetrics()
  }

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
          <p className="text-gray-600 mb-6">
            You don&apos;t have permission to access this page.
          </p>
          <Button onClick={() => router.push('/admin')}>
            Go to Admin
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading ads data...</p>
        </div>
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <div className="min-h-screen bg-gray-100 overflow-x-hidden">
        <header className="bg-white border-b sticky top-0 z-40">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/master-leads" className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Google Ads Today</h1>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
            <h2 className="text-lg font-semibold text-amber-900 mb-2">Google Ads Not Connected</h2>
            <p className="text-amber-700 text-sm">
              Connect Google Ads in admin settings to view metrics.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Sort accounts by conversions (high to low), only include those with metrics
  const sortedAccounts = (data.accounts || [])
    .filter(a => a.metrics && (a.metrics.conversions > 0 || a.metrics.cost > 0))
    .sort((a, b) => (b.metrics?.conversions || 0) - (a.metrics?.conversions || 0))

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden pb-20">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/master-leads" className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Google Ads</h1>
              <p className="text-xs text-gray-500">Today&apos;s Performance</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-5 w-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Totals Summary */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <Target className="h-4 w-4" />
                <span className="text-xs">Conv</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatNumber(data.totals.conversions)}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">CPA</span>
              </div>
              <p className="text-xl font-bold text-blue-600">
                {data.totals.conversions > 0
                  ? formatCurrency(data.totals.cost / data.totals.conversions)
                  : '$0'
                }
              </p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs">Cost</span>
              </div>
              <p className="text-xl font-bold text-red-600">{formatCurrency(data.totals.cost)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="max-w-3xl mx-auto px-4">
        <p className="text-xs text-gray-500 mb-2 px-1">
          {sortedAccounts.length} account{sortedAccounts.length !== 1 ? 's' : ''} with activity
        </p>

        {sortedAccounts.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No ad activity today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedAccounts.map((account) => (
              <div
                key={account.customerId}
                className="bg-white rounded-xl shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 truncate flex-1 mr-2">
                    {account.clientName}
                  </h3>
                  {account.error && (
                    <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                      Error
                    </span>
                  )}
                </div>

                {account.metrics ? (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Conversions</p>
                      <p className="text-lg font-bold text-gray-900">
                        {formatNumber(account.metrics.conversions)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Cost/Conv</p>
                      <p className="text-lg font-bold text-blue-600">
                        {account.metrics.conversions > 0
                          ? formatCurrency(account.metrics.cost / account.metrics.conversions)
                          : '-'
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Cost</p>
                      <p className="text-lg font-bold text-red-600">
                        {formatCurrency(account.metrics.cost)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center">No data available</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Powered by Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 z-50">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-xs">Powered by</span>
          <a href="https://autoglassmarketingpros.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Auto Glass Marketing Pros" className="h-5 w-auto" />
            <span className="text-white text-xs font-medium">Auto Glass Marketing Pros</span>
          </a>
        </div>
      </div>
    </div>
  )
}
