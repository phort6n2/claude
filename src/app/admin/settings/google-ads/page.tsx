'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  ArrowLeft,
  TrendingUp,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  Link2,
  Unlink,
  AlertCircle,
  Key,
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
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [mccCustomerId, setMccCustomerId] = useState('')
  const [developerToken, setDeveloperToken] = useState('')
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')

  // Load status
  useEffect(() => {
    fetch('/api/integrations/google-ads/status')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data)
        setMccCustomerId(data.mccCustomerId || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))

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

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Google Ads Settings" subtitle="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  const canConnect = status?.oauthClientId && status?.oauthClientSecret

  return (
    <div className="flex flex-col h-full">
      <Header title="Google Ads Settings" subtitle="Connect your MCC for conversion tracking" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl space-y-6">
          {/* Back link */}
          <Link
            href="/admin/settings"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Link>

          {/* Alerts */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-800">{success}</p>
              </div>
            </div>
          )}

          {/* OAuth App Credentials Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                OAuth App Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Create these in{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google Cloud Console
                  <ExternalLink className="h-3 w-3 inline ml-1" />
                </a>
                {' '}→ Create Credentials → OAuth client ID → Web application
              </p>

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
                  data-lpignore="true"
                  data-form-type="other"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
                />
                {status?.oauthClientId && (
                  <p className="text-xs text-green-600 mt-1">✓ Configured</p>
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
                  data-lpignore="true"
                  data-form-type="other"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {status?.oauthClientSecret && (
                  <p className="text-xs text-green-600 mt-1">✓ Configured</p>
                )}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
                <strong>Redirect URI:</strong> Add this to your OAuth app&apos;s Authorized redirect URIs:
                <code className="block mt-1 p-2 bg-white rounded border text-xs break-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/google-ads/callback` : ''}
                </code>
              </div>
            </CardContent>
          </Card>

          {/* MCC Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle>API Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  MCC Customer ID
                </label>
                <input
                  type="text"
                  value={mccCustomerId}
                  onChange={(e) => setMccCustomerId(e.target.value)}
                  placeholder="xxx-xxx-xxxx"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Your Manager Account (MCC) customer ID in xxx-xxx-xxxx format
                </p>
              </div>

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
                  data-lpignore="true"
                  data-form-type="other"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Get this from your{' '}
                  <a
                    href="https://ads.google.com/aw/apicenter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Google Ads API Center
                    <ExternalLink className="h-3 w-3 inline ml-1" />
                  </a>
                </p>
                {status?.developerToken && (
                  <p className="text-xs text-green-600 mt-1">✓ Configured</p>
                )}
              </div>

              <Button onClick={handleSaveConfig} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Configuration
              </Button>
            </CardContent>
          </Card>

          {/* Connection Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                OAuth Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 via-white to-slate-50 rounded-2xl border border-gray-200">
                <div className="flex items-center gap-3">
                  {status?.connected ? (
                    <>
                      <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-green-800">Connected</p>
                        <p className="text-sm text-gray-500">OAuth tokens are active</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                        <XCircle className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">Not Connected</p>
                        <p className="text-sm text-gray-500">
                          {canConnect
                            ? 'Click Connect to authorize'
                            : 'Save OAuth credentials first'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {status?.connected ? (
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-2" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button onClick={handleConnect} disabled={!canConnect}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect Google Ads
                  </Button>
                )}
              </div>

              <p className="text-sm text-gray-500">
                Connecting allows the platform to send Enhanced Conversions and import offline conversions
                to your Google Ads accounts.
              </p>
            </CardContent>
          </Card>

          {/* Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <ol className="list-decimal list-inside space-y-3">
                <li>
                  <strong>Create OAuth App:</strong> Go to{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Google Cloud Console
                  </a>
                  , create an OAuth 2.0 Client ID (Web application), and enter the credentials above.
                </li>
                <li>
                  <strong>Get Developer Token:</strong> Go to{' '}
                  <a
                    href="https://ads.google.com/aw/apicenter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Google Ads API Center
                  </a>{' '}
                  and apply for API access. Enter the token above.
                </li>
                <li>
                  <strong>Enter MCC Customer ID:</strong> Your Manager Account ID from the top right
                  of Google Ads.
                </li>
                <li>
                  <strong>Save &amp; Connect:</strong> Save your configuration, then click &quot;Connect Google Ads&quot; to authorize.
                </li>
                <li>
                  <strong>Configure Clients:</strong> For each client, go to their settings and link
                  their Google Ads customer ID and conversion actions.
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
