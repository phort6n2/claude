'use client'

import { useState, useEffect } from 'react'
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  Cloud,
  Mic,
  Share2,
  Image as ImageIcon,
  MapPin,
  Video,
  Bot,
  ExternalLink,
  Search,
  Megaphone,
} from 'lucide-react'

interface IntegrationStatus {
  name: string
  key: string
  configured: boolean
  status: 'connected' | 'error' | 'not_configured' | 'testing'
  message: string
  lastTested?: string
}

const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
  'ANTHROPIC_API_KEY': <Bot className="h-5 w-5" />,
  'NANO_BANANA_API_KEY': <ImageIcon className="h-5 w-5" />,
  'AUTOCONTENT_API_KEY': <Mic className="h-5 w-5" />,
  'GETLATE_API_KEY': <Share2 className="h-5 w-5" />,
  'PODBEAN_CLIENT_SECRET': <Mic className="h-5 w-5" />,
  'GOOGLE_PLACES_API_KEY': <MapPin className="h-5 w-5" />,
  'GOOGLE_CLOUD_CREDENTIALS': <Cloud className="h-5 w-5" />,
  'CREATIFY_API_KEY': <Video className="h-5 w-5" />,
  'DATAFORSEO_PASSWORD': <Search className="h-5 w-5" />,
  'GOOGLE_ADS': <Megaphone className="h-5 w-5" />,
}

const INTEGRATION_DESCRIPTIONS: Record<string, string> = {
  'ANTHROPIC_API_KEY': 'AI content generation for blogs, social posts, and descriptions',
  'NANO_BANANA_API_KEY': 'AI image generation using Google Gemini',
  'AUTOCONTENT_API_KEY': 'Podcast audio generation from blog content',
  'GETLATE_API_KEY': 'Social media scheduling and publishing',
  'PODBEAN_CLIENT_SECRET': 'Podcast episode publishing and hosting',
  'GOOGLE_PLACES_API_KEY': 'Business lookup and address autocomplete',
  'GOOGLE_CLOUD_CREDENTIALS': 'Media file storage (images, audio, video)',
  'CREATIFY_API_KEY': 'AI video creation and lip-sync',
  'DATAFORSEO_PASSWORD': 'Fetch People Also Ask questions from Google',
  'GOOGLE_ADS': 'Conversion tracking and offline conversion import',
}

export default function ApiStatusPage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  async function fetchStatus() {
    try {
      const response = await fetch('/api/integrations/status')
      const data = await response.json()
      setIntegrations(data.integrations || [])
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }

  async function testIntegration(key: string) {
    setTestingKey(key)

    // Update local state to show testing
    setIntegrations(prev =>
      prev.map(i =>
        i.key === key ? { ...i, status: 'testing' as const, message: 'Testing...' } : i
      )
    )

    try {
      const response = await fetch('/api/integrations/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const result = await response.json()

      setIntegrations(prev =>
        prev.map(i =>
          i.key === key
            ? {
                ...i,
                status: result.status,
                message: result.message,
                lastTested: result.lastTested,
              }
            : i
        )
      )
    } catch (error) {
      setIntegrations(prev =>
        prev.map(i =>
          i.key === key
            ? { ...i, status: 'error' as const, message: 'Test failed' }
            : i
        )
      )
    } finally {
      setTestingKey(null)
    }
  }

  async function testAllIntegrations() {
    const configuredIntegrations = integrations.filter(i => i.configured)
    for (const integration of configuredIntegrations) {
      await testIntegration(integration.key)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const configuredCount = integrations.filter(i => i.configured).length
  const connectedCount = integrations.filter(i => i.status === 'connected').length
  const errorCount = integrations.filter(i => i.status === 'error').length

  function getStatusIcon(status: string) {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'testing':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'connected':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
            Connected
          </span>
        )
      case 'error':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
            Error
          </span>
        )
      case 'testing':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
            Testing...
          </span>
        )
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
            Not Configured
          </span>
        )
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Activity className="h-7 w-7 text-blue-600" />
            API Status
          </h1>
          <p className="text-gray-500 mt-1">
            Monitor and test your API integrations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-sm text-gray-500">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchStatus}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={testAllIntegrations}
            disabled={testingKey !== null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Zap className="h-4 w-4" />
            Test All
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Configured</p>
              <p className="text-2xl font-bold text-gray-900">
                {configuredCount} / {integrations.length}
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Connected</p>
              <p className="text-2xl font-bold text-green-600">{connectedCount}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Errors</p>
              <p className="text-2xl font-bold text-red-600">{errorCount}</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {integrations.map((integration) => (
          <div
            key={integration.key}
            className={`bg-white rounded-2xl border shadow-sm p-5 ${
              integration.status === 'error' ? 'border-red-200' :
              integration.status === 'connected' ? 'border-green-200' :
              'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  integration.configured ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {INTEGRATION_ICONS[integration.key] || <Activity className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {INTEGRATION_DESCRIPTIONS[integration.key]}
                  </p>
                </div>
              </div>
              {getStatusIcon(integration.status)}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusBadge(integration.status)}
                <span className="text-sm text-gray-500">{integration.message}</span>
              </div>
              <div className="flex items-center gap-2">
                {integration.configured ? (
                  <button
                    onClick={() => testIntegration(integration.key)}
                    disabled={testingKey === integration.key}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                  >
                    {testingKey === integration.key ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Test
                  </button>
                ) : (
                  <a
                    href={integration.key === 'GOOGLE_ADS' ? '/admin/settings/google-ads' : '/admin/settings/api'}
                    className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Configure
                  </a>
                )}
              </div>
            </div>

            {integration.lastTested && (
              <p className="mt-2 text-xs text-gray-400">
                Last tested: {new Date(integration.lastTested).toLocaleString()}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Help Section */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl shadow-sm p-4">
        <h3 className="font-medium text-blue-900 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Need to configure an API?
        </h3>
        <p className="text-sm text-blue-700 mt-1">
          Go to{' '}
          <a href="/admin/settings/api" className="underline font-medium">
            Settings &rarr; API Keys
          </a>{' '}
          to add or update your API credentials.
        </p>
      </div>
    </div>
  )
}
