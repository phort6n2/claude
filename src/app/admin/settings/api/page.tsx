'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface ApiKeyConfig {
  key: string
  label: string
  description: string
  isTextarea?: boolean
  testable?: boolean
}

const API_KEYS: ApiKeyConfig[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    description: 'Used for Claude AI content generation',
    testable: true,
  },
  {
    key: 'NANO_BANANA_API_KEY',
    label: 'Nano Banana API Key',
    description: 'Used for image generation',
    testable: true,
  },
  {
    key: 'AUTOCONTENT_API_KEY',
    label: 'AutoContent API Key',
    description: 'Used for podcast generation',
    testable: true,
  },
  {
    key: 'CREATIFY_API_KEY',
    label: 'Creatify API Key',
    description: 'Used for video generation',
    testable: true,
  },
  {
    key: 'GETLATE_API_KEY',
    label: 'GetLate API Key',
    description: 'Used for social media scheduling',
    testable: true,
  },
  {
    key: 'PODBEAN_CLIENT_ID',
    label: 'Podbean Client ID',
    description: 'OAuth client ID for Podbean podcast publishing',
    testable: false,
  },
  {
    key: 'PODBEAN_CLIENT_SECRET',
    label: 'Podbean Client Secret',
    description: 'OAuth client secret for Podbean podcast publishing',
    testable: true,
  },
  {
    key: 'GOOGLE_PLACES_API_KEY',
    label: 'Google Places API Key',
    description: 'Used for business search and auto-populating client info',
    testable: true,
  },
  {
    key: 'GOOGLE_CLOUD_PROJECT_ID',
    label: 'Google Cloud Project ID',
    description: 'Your GCP project identifier',
    testable: false,
  },
  {
    key: 'GOOGLE_CLOUD_STORAGE_BUCKET',
    label: 'Google Cloud Storage Bucket',
    description: 'Bucket name for storing media files',
    testable: false,
  },
  {
    key: 'GOOGLE_CLOUD_CREDENTIALS',
    label: 'Google Cloud Credentials',
    description: 'Service account JSON credentials',
    isTextarea: true,
    testable: true,
  },
  {
    key: 'DATAFORSEO_LOGIN',
    label: 'DataForSEO Login',
    description: 'Email/login for DataForSEO SERP API (fetches Google PAAs)',
    testable: false,
  },
  {
    key: 'DATAFORSEO_PASSWORD',
    label: 'DataForSEO Password',
    description: 'API password for DataForSEO',
    testable: true,
  },
  {
    key: 'GBP_CLIENT_ID',
    label: 'Google Business Profile Client ID',
    description: 'OAuth client ID for GBP photo fetching (create in Google Cloud Console)',
    testable: false,
  },
  {
    key: 'GBP_CLIENT_SECRET',
    label: 'Google Business Profile Client Secret',
    description: 'OAuth client secret for GBP photo fetching',
    testable: true,
  },
]

interface SettingState {
  value: string
  masked: string
  hasValue: boolean
  visible: boolean
  editing: boolean
  newValue: string
  testing: boolean
  testResult?: { success: boolean; message: string }
}

export default function ApiSettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()

      const initialState: Record<string, SettingState> = {}
      for (const config of API_KEYS) {
        const setting = data[config.key] || { value: '', masked: '', hasValue: false }
        initialState[config.key] = {
          value: setting.value,
          masked: setting.masked,
          hasValue: setting.hasValue,
          visible: false,
          editing: false,
          newValue: '',
          testing: false,
        }
      }
      setSettings(initialState)
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setLoading(false)
    }
  }

  function toggleVisibility(key: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], visible: !prev[key].visible },
    }))
  }

  function startEditing(key: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], editing: true, newValue: '' },
    }))
  }

  function cancelEditing(key: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], editing: false, newValue: '' },
    }))
  }

  function updateNewValue(key: string, value: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], newValue: value },
    }))
  }

  async function saveKey(key: string) {
    const setting = settings[key]
    if (!setting.newValue.trim()) {
      cancelEditing(key)
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [{ key, value: setting.newValue }] }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: `${key} saved successfully` })
        // Update local state with masked value
        setSettings(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            hasValue: true,
            masked: '••••••••' + setting.newValue.slice(-4),
            editing: false,
            newValue: '',
          },
        }))
      } else {
        setMessage({ type: 'error', text: 'Failed to save setting' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save setting' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  async function testConnection(key: string) {
    const setting = settings[key]
    const valueToTest = setting.editing ? setting.newValue : undefined

    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], testing: true, testResult: undefined },
    }))

    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: valueToTest }),
      })

      const result = await response.json()
      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], testing: false, testResult: result },
      }))
    } catch (error) {
      setSettings(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          testing: false,
          testResult: { success: false, message: 'Test failed' },
        },
      }))
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="API Settings" subtitle="Configure external API integrations" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="API Settings" subtitle="Configure external API integrations" />
      <div className="flex-1 p-6 overflow-auto">
        {message && (
          <div
            className={`mb-4 p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-4">
          {API_KEYS.map((config) => {
            const setting = settings[config.key]
            if (!setting) return null

            return (
              <Card key={config.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{config.label}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">{config.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {setting.hasValue && !setting.editing && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          Configured
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {setting.editing ? (
                    <div className="space-y-3">
                      {config.isTextarea ? (
                        <textarea
                          value={setting.newValue}
                          onChange={(e) => updateNewValue(config.key, e.target.value)}
                          placeholder="Paste your credentials JSON here..."
                          rows={6}
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                      ) : (
                        <input
                          type="text"
                          value={setting.newValue}
                          onChange={(e) => updateNewValue(config.key, e.target.value)}
                          placeholder="Enter new value..."
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => saveKey(config.key)}
                          disabled={saving || !setting.newValue.trim()}
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save'
                          )}
                        </Button>
                        <Button variant="outline" onClick={() => cancelEditing(config.key)}>
                          Cancel
                        </Button>
                        {config.testable && setting.newValue.trim() && (
                          <Button
                            variant="secondary"
                            onClick={() => testConnection(config.key)}
                            disabled={setting.testing}
                          >
                            {setting.testing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              'Test Connection'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {setting.hasValue ? (
                          <>
                            <code className="bg-gray-100 px-3 py-1.5 rounded font-mono text-sm">
                              {setting.visible ? setting.masked : '••••••••••••'}
                            </code>
                            <button
                              onClick={() => toggleVisibility(config.key)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {setting.visible ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">Not configured</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {config.testable && setting.hasValue && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnection(config.key)}
                            disabled={setting.testing}
                          >
                            {setting.testing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              'Test Connection'
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(config.key)}
                        >
                          {setting.hasValue ? 'Update' : 'Add'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {setting.testResult && (
                    <div
                      className={`mt-3 p-3 rounded-md flex items-center gap-2 ${
                        setting.testResult.success
                          ? 'bg-green-50 text-green-800'
                          : 'bg-red-50 text-red-800'
                      }`}
                    >
                      {setting.testResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {setting.testResult.message}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
