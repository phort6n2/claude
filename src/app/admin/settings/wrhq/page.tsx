'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface WRHQConfig {
  wordpress: {
    url: string | null
    username: string | null
    appPassword: string | null
    isConfigured: boolean
  }
  socialMedia: {
    facebook: string | null
    instagram: string | null
    linkedin: string | null
    twitter: string | null
    tiktok: string | null
    gbp: string | null
    youtube: string | null
    bluesky: string | null
    threads: string | null
    reddit: string | null
    pinterest: string | null
    telegram: string | null
    enabledPlatforms: string[]
  }
  publishing: {
    preferredTime: string
    timezone: string
  }
  youtubeApi: {
    clientId: string | null
    clientSecret: string | null
    refreshToken: string | null
    channelId: string | null
    channelTitle: string | null
    isConfigured: boolean
  }
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

const SOCIAL_PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: '📘' },
  { key: 'instagram', label: 'Instagram', icon: '📷' },
  { key: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { key: 'twitter', label: 'Twitter/X', icon: '🐦' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵' },
  { key: 'gbp', label: 'Google Business', icon: '📍' },
  { key: 'youtube', label: 'YouTube', icon: '📺' },
  { key: 'bluesky', label: 'Bluesky', icon: '🦋' },
  { key: 'threads', label: 'Threads', icon: '🧵' },
  { key: 'reddit', label: 'Reddit', icon: '🤖' },
  { key: 'pinterest', label: 'Pinterest', icon: '📌' },
  { key: 'telegram', label: 'Telegram', icon: '✈️' },
]

export default function WRHQSettingsPage() {
  const [config, setConfig] = useState<WRHQConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Form states
  const [wordpressForm, setWordpressForm] = useState({
    url: '',
    username: '',
    appPassword: '',
  })
  const [socialForm, setSocialForm] = useState<Record<string, string>>({})
  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([])
  const [publishingForm, setPublishingForm] = useState({
    preferredTime: '10:00',
    timezone: 'America/Los_Angeles',
  })
  const [youtubeForm, setYoutubeForm] = useState({
    clientId: '',
    clientSecret: '',
  })
  const [showYoutubeSecret, setShowYoutubeSecret] = useState(false)
  const [youtubeConnecting, setYoutubeConnecting] = useState(false)
  const [youtubeRefreshing, setYoutubeRefreshing] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const response = await fetch('/api/settings/wrhq')
      if (response.ok) {
        const data = await response.json()
        setConfig(data)

        // Initialize form states
        setWordpressForm({
          url: data.wordpress.url || '',
          username: data.wordpress.username || '',
          appPassword: data.wordpress.appPassword || '',
        })

        const social: Record<string, string> = {}
        for (const p of SOCIAL_PLATFORMS) {
          social[p.key] = data.socialMedia[p.key as keyof typeof data.socialMedia] || ''
        }
        setSocialForm(social)
        setEnabledPlatforms(data.socialMedia.enabledPlatforms || [])

        setPublishingForm({
          preferredTime: data.publishing.preferredTime || '10:00',
          timezone: data.publishing.timezone || 'America/Los_Angeles',
        })

        // Load YouTube API settings
        if (data.youtubeApi) {
          setYoutubeForm({
            clientId: data.youtubeApi.clientId || '',
            clientSecret: data.youtubeApi.clientSecret || '',
          })
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  async function initiateYouTubeOAuth() {
    if (!youtubeForm.clientId || !youtubeForm.clientSecret) {
      alert('Please enter Client ID and Client Secret first, then save them before connecting.')
      return
    }
    setYoutubeConnecting(true)
    try {
      // First save the credentials
      await saveSection('youtubeApi', youtubeForm)

      // Then redirect to OAuth
      const response = await fetch('/api/settings/wrhq/youtube/oauth-url')
      if (response.ok) {
        const data = await response.json()
        window.location.href = data.url
      } else {
        throw new Error('Failed to get OAuth URL')
      }
    } catch (error) {
      console.error('Failed to initiate OAuth:', error)
      alert('Failed to connect to YouTube. Please check your credentials.')
    } finally {
      setYoutubeConnecting(false)
    }
  }

  async function disconnectYouTube() {
    if (!confirm('Are you sure you want to disconnect the YouTube channel?')) {
      return
    }
    try {
      const response = await fetch('/api/settings/wrhq/youtube/disconnect', {
        method: 'POST',
      })
      if (response.ok) {
        await loadConfig()
      }
    } catch (error) {
      console.error('Failed to disconnect YouTube:', error)
    }
  }

  async function refreshYouTubeChannel() {
    setYoutubeRefreshing(true)
    try {
      const response = await fetch('/api/settings/wrhq/youtube/refresh', {
        method: 'POST',
      })
      const data = await response.json()
      if (response.ok && data.success) {
        await loadConfig()
        alert(`Connected to: ${data.channelTitle}`)
      } else {
        // Show detailed error with debug info if available
        let errorMsg = `Failed to refresh: ${data.error || 'Unknown error'}`
        if (data.debug) {
          errorMsg += `\n\nDebug Info:\n- Has Client ID: ${data.debug.hasClientId}\n- Has Client Secret: ${data.debug.hasClientSecret}\n- Has Refresh Token: ${data.debug.hasRefreshToken}\n- Has Access Token: ${data.debug.hasAccessToken}`
          if (data.debug.tokenExpiryDate) {
            errorMsg += `\n- Token Expiry: ${data.debug.tokenExpiryDate}`
          }
        }
        alert(errorMsg)
      }
    } catch (error) {
      console.error('Failed to refresh YouTube channel:', error)
      alert('Failed to refresh YouTube channel info')
    } finally {
      setYoutubeRefreshing(false)
    }
  }

  async function saveSection(section: string, data: Record<string, unknown>) {
    setSaving(section)
    setTestResult(null)

    try {
      const response = await fetch('/api/settings/wrhq', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data }),
      })

      if (response.ok) {
        const updatedConfig = await response.json()
        setConfig(updatedConfig)
      }
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(null)
    }
  }

  async function testWordPress() {
    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/settings/wrhq/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wordpress',
          data: wordpressForm,
        }),
      })

      const result = await response.json()
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-500">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/admin" className="hover:text-gray-700">Admin</Link>
            <span>/</span>
            <Link href="/admin/settings" className="hover:text-gray-700">Settings</Link>
            <span>/</span>
            <span className="text-gray-900">WRHQ</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Windshield Repair HQ Settings</h1>
          <p className="text-gray-600 mt-2">
            Configure the WRHQ directory site for dual publishing. Every client blog post will also
            create a companion post on WRHQ with social media promotion.
          </p>
        </div>

        {/* WordPress Configuration */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">WordPress Configuration</h2>
              <p className="text-sm text-gray-500">Connect to the WRHQ WordPress site</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              config?.wordpress.isConfigured
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {config?.wordpress.isConfigured ? 'Connected' : 'Not configured'}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WordPress URL
              </label>
              <input
                type="url"
                value={wordpressForm.url}
                onChange={(e) => setWordpressForm({ ...wordpressForm, url: e.target.value })}
                placeholder="https://windshieldrepairhq.com"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={wordpressForm.username}
                onChange={(e) => setWordpressForm({ ...wordpressForm, username: e.target.value })}
                placeholder="admin"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Application Password
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={wordpressForm.appPassword}
                    onChange={(e) => setWordpressForm({ ...wordpressForm, appPassword: e.target.value })}
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    className="w-full px-3 py-2 border rounded-md pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Generate in WordPress: Users → Profile → Application Passwords
              </p>
            </div>

            {testResult && (
              <div className={`p-3 rounded-md ${
                testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {testResult.message}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={testWordPress}
                disabled={testing || !wordpressForm.url || !wordpressForm.username}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={() => saveSection('wordpress', wordpressForm)}
                disabled={saving === 'wordpress'}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving === 'wordpress' ? 'Saving...' : 'Save WordPress Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Social Media Configuration */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Social Media Accounts</h2>
            <p className="text-sm text-gray-500">
              Late (getlate.dev) account IDs for WRHQ social media scheduling
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enabled Platforms
            </label>
            <div className="flex flex-wrap gap-2">
              {SOCIAL_PLATFORMS.map((platform) => (
                <button
                  key={platform.key}
                  onClick={() => {
                    if (enabledPlatforms.includes(platform.key)) {
                      setEnabledPlatforms(enabledPlatforms.filter(p => p !== platform.key))
                    } else {
                      setEnabledPlatforms([...enabledPlatforms, platform.key])
                    }
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    enabledPlatforms.includes(platform.key)
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                >
                  {platform.icon} {platform.label}
                </button>
              ))}
            </div>
          </div>

          {enabledPlatforms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {SOCIAL_PLATFORMS.filter((platform) => enabledPlatforms.includes(platform.key)).map((platform) => (
                <div key={platform.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {platform.icon} {platform.label} Account ID
                  </label>
                  <input
                    type="text"
                    value={socialForm[platform.key] || ''}
                    onChange={(e) => setSocialForm({ ...socialForm, [platform.key]: e.target.value })}
                    placeholder={`Late ${platform.label} ID`}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 p-4 bg-gray-50 rounded-md text-gray-500 text-sm">
              Select platforms above to configure their account IDs
            </div>
          )}

          <button
            onClick={() => saveSection('socialMedia', { ...socialForm, enabledPlatforms })}
            disabled={saving === 'socialMedia'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving === 'socialMedia' ? 'Saving...' : 'Save Social Media Settings'}
          </button>
        </div>

        {/* Publishing Preferences */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Publishing Preferences</h2>
            <p className="text-sm text-gray-500">
              Configure when WRHQ posts are published (offset from client posts)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Publish Time
              </label>
              <input
                type="time"
                value={publishingForm.preferredTime}
                onChange={(e) => setPublishingForm({ ...publishingForm, preferredTime: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                WRHQ posts are scheduled 2-4 hours after client posts
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timezone
              </label>
              <select
                value={publishingForm.timezone}
                onChange={(e) => setPublishingForm({ ...publishingForm, timezone: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => saveSection('publishing', publishingForm)}
            disabled={saving === 'publishing'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving === 'publishing' ? 'Saving...' : 'Save Publishing Preferences'}
          </button>
        </div>

        {/* YouTube API Configuration */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">YouTube API (Long-form Video)</h2>
              <p className="text-sm text-gray-500">Upload long-form 16:9 videos to the WRHQ YouTube channel</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              config?.youtubeApi?.isConfigured
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {config?.youtubeApi?.isConfigured
                ? `Connected: ${config.youtubeApi.channelTitle}`
                : 'Not connected'}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Setup Instructions:</strong>
              <ol className="list-decimal ml-5 mt-2 space-y-1">
                <li>Go to the <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a> and enable the <strong>YouTube Data API v3</strong></li>
                <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">Credentials</a> and create a new OAuth 2.0 Client ID (Web application type)</li>
                <li>Add <code className="bg-amber-100 px-1 rounded">{typeof window !== 'undefined' ? `${window.location.origin}/api/settings/wrhq/youtube/callback` : '/api/settings/wrhq/youtube/callback'}</code> as an authorized redirect URI</li>
                <li>Copy the Client ID and Client Secret below, then click &quot;Connect to YouTube&quot;</li>
              </ol>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OAuth Client ID
              </label>
              <input
                type="text"
                value={youtubeForm.clientId}
                onChange={(e) => setYoutubeForm({ ...youtubeForm, clientId: e.target.value })}
                placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OAuth Client Secret
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showYoutubeSecret ? 'text' : 'password'}
                    value={youtubeForm.clientSecret}
                    onChange={(e) => setYoutubeForm({ ...youtubeForm, clientSecret: e.target.value })}
                    placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border rounded-md pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowYoutubeSecret(!showYoutubeSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showYoutubeSecret ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => saveSection('youtubeApi', youtubeForm)}
                disabled={saving === 'youtubeApi'}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                {saving === 'youtubeApi' ? 'Saving...' : 'Save Credentials'}
              </button>
              {config?.youtubeApi?.isConfigured ? (
                <>
                  <button
                    onClick={refreshYouTubeChannel}
                    disabled={youtubeRefreshing}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50"
                  >
                    {youtubeRefreshing ? 'Refreshing...' : 'Refresh Channel Info'}
                  </button>
                  <button
                    onClick={disconnectYouTube}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    Disconnect YouTube
                  </button>
                </>
              ) : (
                <button
                  onClick={initiateYouTubeOAuth}
                  disabled={youtubeConnecting || !youtubeForm.clientId || !youtubeForm.clientSecret}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {youtubeConnecting ? 'Connecting...' : 'Connect to YouTube'}
                </button>
              )}
            </div>

            {config?.youtubeApi?.isConfigured && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <strong>Connected Channel:</strong> {config.youtubeApi.channelTitle || '(Unknown - click Refresh Channel Info)'}
                <p className="text-xs text-green-600 mt-1">
                  Long-form videos will be uploaded to this channel when you upload them in the content review page.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">How Dual Publishing Works</h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>
              <strong>1. Client Blog Post</strong> - Published to the client&apos;s WordPress site
            </li>
            <li>
              <strong>2. WRHQ Directory Post</strong> - A companion article is created on WRHQ that links back to the client&apos;s post
            </li>
            <li>
              <strong>3. Client Social Posts</strong> - Scheduled via Late if client has social accounts configured
            </li>
            <li>
              <strong>4. WRHQ Social Posts</strong> - Always scheduled via Late to WRHQ accounts, featuring the client
            </li>
            <li>
              <strong>5. Long-form Video</strong> - Uploaded to WRHQ YouTube channel with links to all resources
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
