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
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {SOCIAL_PLATFORMS.map((platform) => (
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
                  disabled={!enabledPlatforms.includes(platform.key)}
                />
              </div>
            ))}
          </div>

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
          </ul>
        </div>
      </div>
    </div>
  )
}
