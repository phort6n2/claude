'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Megaphone,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Zap,
  Key,
  Link2,
  Unlink,
  ExternalLink,
  Save,
  ArrowLeft,
  Shield,
  Settings,
} from 'lucide-react'

interface GoogleAdsStatus {
  connected: boolean
  mccCustomerId: string | null
  developerToken: boolean
  oauthClientId: boolean
  oauthClientSecret: boolean
  lastSyncAt: string | null
  lastError: string | null
}

export default function GoogleAdsSettingsPage() {
  const [status, setStatus] = useState<GoogleAdsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [mccCustomerId, setMccCustomerId] = useState('')
  const [developerToken, setDeveloperToken] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')

  async function fetchStatus() {
    try {
      const res = await fetch('/api/integrations/google-ads/status')
      const data = await res.json()
      setStatus(data)
      setMccCustomerId(data.mccCustomerId || '')
    } catch (err) {
      console.error('Failed to fetch status:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()

    // Check for URL params (after OAuth redirect)
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'connected') {
      setSuccess('Google Ads connected successfully!')
      window.history.replaceState({}, '', '/admin/settings/google-ads')
    } else if (params.get('error')) {
      const errorMsg = params.get('error')
      if (errorMsg === 'oauth_not_configured') {
        setError('Please enter OAuth Client ID and Secret first, then save before connecting.')
      } else {
        setError(`Connection failed: ${errorMsg}`)
      }
      window.history.replaceState({}, '', '/admin/settings/google-ads')
    }
  }, [])

  async function handleSaveConfig() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/integrations/google-ads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mccCustomerId: mccCustomerId || null,
          developerToken: developerToken || undefined,
          oauthClientId: oauthClientId || undefined,
          oauthClientSecret: oauthClientSecret || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      setStatus((prev) => prev ? { ...prev, ...data } : null)
      setDeveloperToken('')
      setOauthClientId('')
      setOauthClientSecret('')
      setSuccess('Configuration saved!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/integrations/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'GOOGLE_ADS' }),
      })
      const result = await response.json()

      if (result.status === 'connected') {
        setSuccess('Connection test successful!')
      } else {
        setError(result.message || 'Connection test failed')
      }
    } catch {
      setError('Failed to test connection')
    } finally {
      setTesting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Are you sure you want to disconnect Google Ads?')) return

    setDisconnecting(true)
    setError(null)

    try {
      await fetch('/api/integrations/google-ads/status', { method: 'DELETE' })
      setStatus((prev) => prev ? { ...prev, connected: false } : null)
      setSuccess('Google Ads disconnected')
    } catch {
      setError('Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  function handleConnect() {
    window.location.href = '/api/integrations/google-ads/connect'
  }

  // Calculate status summary
  const configuredCount = [
    status?.oauthClientId,
    status?.oauthClientSecret,
    status?.developerToken,
    status?.mccCustomerId,
  ].filter(Boolean).length

  const canConnect = status?.oauthClientId && status?.oauthClientSecret

  function getOverallStatus() {
    if (!status) return 'loading'
    if (status.connected) return 'connected'
    if (configuredCount === 4) return 'ready'
    return 'incomplete'
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
      {/* Back link */}
      <Link
        href="/admin/settings"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Settings
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Megaphone className="h-7 w-7 text-blue-600" />
            Google Ads Integration
          </h1>
          <p className="text-gray-500 mt-1">
            Connect your MCC for conversion tracking and offline conversion import
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStatus}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {status?.connected && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Test Connection
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Credentials</p>
              <p className="text-2xl font-bold text-gray-900">
                {configuredCount} / 4
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Key className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">OAuth Status</p>
              <p className={`text-2xl font-bold ${status?.connected ? 'text-green-600' : 'text-gray-400'}`}>
                {status?.connected ? 'Connected' : 'Not Connected'}
              </p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              status?.connected ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {status?.connected ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-gray-400" />
              )}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Overall Status</p>
              <p className={`text-2xl font-bold ${
                getOverallStatus() === 'connected' ? 'text-green-600' :
                getOverallStatus() === 'ready' ? 'text-amber-600' :
                'text-gray-400'
              }`}>
                {getOverallStatus() === 'connected' ? 'Active' :
                 getOverallStatus() === 'ready' ? 'Ready' :
                 'Setup Needed'}
              </p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              getOverallStatus() === 'connected' ? 'bg-green-100' :
              getOverallStatus() === 'ready' ? 'bg-amber-100' :
              'bg-gray-100'
            }`}>
              {getOverallStatus() === 'connected' ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : getOverallStatus() === 'ready' ? (
                <AlertCircle className="h-6 w-6 text-amber-600" />
              ) : (
                <Settings className="h-6 w-6 text-gray-400" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* OAuth Credentials Card */}
        <div className={`bg-white rounded-2xl border shadow-sm p-5 ${
          status?.oauthClientId && status?.oauthClientSecret ? 'border-green-200' : 'border-gray-200'
        }`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${
                status?.oauthClientId && status?.oauthClientSecret ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
              }`}>
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">OAuth App Credentials</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Client ID and Secret from Google Cloud Console
                </p>
              </div>
            </div>
            {status?.oauthClientId && status?.oauthClientSecret ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-gray-400" />
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OAuth Client ID
              </label>
              <input
                type="text"
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
                placeholder={status?.oauthClientId ? '••••••••••••' : 'Enter Client ID'}
                autoComplete="off"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-mono"
              />
              {status?.oauthClientId && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Configured
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OAuth Client Secret
              </label>
              <input
                type="password"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                placeholder={status?.oauthClientSecret ? '••••••••••••' : 'Enter Client Secret'}
                autoComplete="new-password"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              />
              {status?.oauthClientSecret && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Configured
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Google Cloud Console
            </a>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              status?.oauthClientId && status?.oauthClientSecret
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {status?.oauthClientId && status?.oauthClientSecret ? 'Configured' : 'Required'}
            </span>
          </div>
        </div>

        {/* API Configuration Card */}
        <div className={`bg-white rounded-2xl border shadow-sm p-5 ${
          status?.developerToken && status?.mccCustomerId ? 'border-green-200' : 'border-gray-200'
        }`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${
                status?.developerToken && status?.mccCustomerId ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
              }`}>
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">API Configuration</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Developer token and MCC Customer ID
                </p>
              </div>
            </div>
            {status?.developerToken && status?.mccCustomerId ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-gray-400" />
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Developer Token
              </label>
              <input
                type="password"
                value={developerToken}
                onChange={(e) => setDeveloperToken(e.target.value)}
                placeholder={status?.developerToken ? '••••••••••••' : 'Enter developer token'}
                autoComplete="new-password"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              />
              {status?.developerToken && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Configured
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                MCC Customer ID
              </label>
              <input
                type="text"
                value={mccCustomerId}
                onChange={(e) => setMccCustomerId(e.target.value)}
                placeholder="xxx-xxx-xxxx"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              />
              {status?.mccCustomerId && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> {status.mccCustomerId}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <a
              href="https://ads.google.com/aw/apicenter"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Google Ads API Center
            </a>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              status?.developerToken && status?.mccCustomerId
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {status?.developerToken && status?.mccCustomerId ? 'Configured' : 'Required'}
            </span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="mb-6">
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Configuration
        </button>
      </div>

      {/* OAuth Connection Card */}
      <div className={`bg-white rounded-2xl border shadow-sm p-5 mb-6 ${
        status?.connected ? 'border-green-200' : 'border-gray-200'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${
              status?.connected ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
            }`}>
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">OAuth Connection</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {status?.connected
                  ? 'Your Google Ads account is connected and ready'
                  : canConnect
                    ? 'Click Connect to authorize with Google'
                    : 'Save OAuth credentials first, then connect'}
              </p>
            </div>
          </div>
          {status?.connected ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-gray-400" />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              status?.connected
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {status?.connected ? 'Connected' : 'Not Connected'}
            </span>
            {status?.lastSyncAt && (
              <span className="text-xs text-gray-500">
                Last sync: {new Date(status.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
              >
                {disconnecting ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Unlink className="h-3 w-3" />
                )}
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={!canConnect}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Link2 className="h-3 w-3" />
                Connect Google Ads
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Redirect URI Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-sm p-4 mb-6">
        <h3 className="font-medium text-amber-900 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Required: Add Redirect URI
        </h3>
        <p className="text-sm text-amber-700 mt-1">
          Add this URI to your OAuth app&apos;s Authorized redirect URIs in Google Cloud Console:
        </p>
        <code className="block mt-2 p-2 bg-white rounded border border-amber-300 text-xs break-all font-mono">
          {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/google-ads/callback` : ''}
        </code>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl shadow-sm p-4">
        <h3 className="font-medium text-blue-900 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Setup Instructions
        </h3>
        <ol className="list-decimal list-inside space-y-2 mt-2 text-sm text-blue-700">
          <li><strong>Create OAuth App:</strong> Go to Google Cloud Console → Create OAuth 2.0 Client ID</li>
          <li><strong>Get Developer Token:</strong> Apply at Google Ads API Center</li>
          <li><strong>Enter MCC ID:</strong> Your Manager Account ID from Google Ads</li>
          <li><strong>Save &amp; Connect:</strong> Save configuration, then authorize with Google</li>
        </ol>
      </div>
    </div>
  )
}
