'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Client {
  id: string
  businessName: string
}

interface GoogleAdsConfig {
  connected: boolean
  customerId: string | null
  leadConversionActionId: string | null
  saleConversionActionId: string | null
  isActive: boolean
  lastSyncAt: string | null
  lastError: string | null
}

interface ConversionAction {
  id: string
  name: string
  category: string
}

export default function ClientGoogleAdsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [config, setConfig] = useState<GoogleAdsConfig | null>(null)
  const [conversionActions, setConversionActions] = useState<ConversionAction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingActions, setLoadingActions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [customerId, setCustomerId] = useState('')
  const [leadConversionActionId, setLeadConversionActionId] = useState('')
  const [saleConversionActionId, setSaleConversionActionId] = useState('')
  const [conversionActionsError, setConversionActionsError] = useState<string | null>(null)

  // Load client and config
  useEffect(() => {
    async function load() {
      try {
        const [clientRes, configRes] = await Promise.all([
          fetch(`/api/clients/${id}`),
          fetch(`/api/clients/${id}/google-ads`),
        ])

        if (clientRes.ok) {
          const clientData = await clientRes.json()
          setClient(clientData)
        }

        if (configRes.ok) {
          const configData = await configRes.json()
          setConfig(configData)
          setCustomerId(configData.customerId || '')
          setLeadConversionActionId(configData.leadConversionActionId || '')
          setSaleConversionActionId(configData.saleConversionActionId || '')

          // Load conversion actions if customer is set
          if (configData.customerId) {
            loadConversionActions(configData.customerId)
          }
        }
      } catch (err) {
        setError('Failed to load configuration')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [id])

  async function loadConversionActions(custId: string) {
    setLoadingActions(true)
    setConversionActionsError(null)
    try {
      const response = await fetch(
        `/api/integrations/google-ads/customers/${custId}/conversion-actions`
      )
      const data = await response.json()
      if (response.ok) {
        setConversionActions(data.actions || [])
        if (data.actions?.length === 0) {
          setConversionActionsError('No conversion actions found in this Google Ads account')
        }
      } else {
        console.warn('Failed to load conversion actions:', data.error)
        setConversionActionsError(data.error || 'Failed to load conversion actions')
        setConversionActions([])
      }
    } catch (err) {
      console.error('Error loading conversion actions:', err)
      setConversionActionsError(err instanceof Error ? err.message : 'Network error')
      setConversionActions([])
    } finally {
      setLoadingActions(false)
    }
  }

  async function handleSave() {
    if (!customerId) {
      setError('Customer ID is required')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/clients/${id}/google-ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          leadConversionActionId: leadConversionActionId || null,
          saleConversionActionId: saleConversionActionId || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      setConfig((prev) => prev ? { ...prev, ...data, connected: true } : null)
      setSuccess('Configuration saved!')

      // Load conversion actions if we just set a customer ID
      if (customerId && conversionActions.length === 0) {
        loadConversionActions(customerId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!confirm('Remove Google Ads configuration for this client?')) return

    try {
      await fetch(`/api/clients/${id}/google-ads`, { method: 'DELETE' })
      setConfig(null)
      setCustomerId('')
      setLeadConversionActionId('')
      setSaleConversionActionId('')
      setConversionActions([])
      setSuccess('Configuration removed')
    } catch (err) {
      setError('Failed to remove configuration')
    }
  }

  function handleCustomerIdChange(value: string) {
    setCustomerId(value)
    // If a valid customer ID is entered, load conversion actions
    const cleaned = value.replace(/-/g, '')
    if (cleaned.length === 10) {
      loadConversionActions(value)
    } else {
      setConversionActions([])
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/admin/clients/${id}`}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client?.businessName}</h1>
            <p className="text-gray-600">Google Ads Configuration</p>
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

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Google Ads Conversion Tracking</p>
              <p className="mt-1">
                Link this client to their Google Ads customer ID to enable:
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>Enhanced Conversions (send hashed email/phone when leads arrive)</li>
                <li>Offline Conversion Import (send sale value when leads convert)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
          {/* Customer ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Google Ads Customer ID *
            </label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => handleCustomerIdChange(e.target.value)}
              placeholder="xxx-xxx-xxxx"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <p className="text-sm text-gray-500 mt-1">
              The client&apos;s Google Ads account ID (under your MCC)
            </p>
          </div>

          {/* Conversion Actions */}
          {loadingActions ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading conversion actions...
            </div>
          ) : conversionActions.length > 0 ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead Conversion Action
                </label>
                <select
                  value={leadConversionActionId}
                  onChange={(e) => setLeadConversionActionId(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select conversion action...</option>
                  {conversionActions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.name} ({action.category})
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  For Enhanced Conversions when a lead is captured
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sale Conversion Action
                </label>
                <select
                  value={saleConversionActionId}
                  onChange={(e) => setSaleConversionActionId(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select conversion action...</option>
                  {conversionActions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.name} ({action.category})
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  For Offline Conversion Import when a lead converts to a sale
                </p>
              </div>
            </>
          ) : customerId.replace(/-/g, '').length === 10 && conversionActionsError ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
              <p className="text-sm font-medium text-yellow-800">
                Error loading conversion actions:
              </p>
              <p className="mt-1 text-sm text-yellow-700 font-mono bg-yellow-100 p-2 rounded">
                {conversionActionsError}
              </p>
              <p className="mt-3 text-sm text-yellow-800">
                Make sure:
              </p>
              <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                <li>Google Ads is connected in Settings → Google Ads</li>
                <li>This customer ID is accessible from your MCC</li>
                <li>The customer has conversion actions set up</li>
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => loadConversionActions(customerId)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <Button onClick={handleSave} disabled={saving || !customerId}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>

            {config?.connected && (
              <Button variant="outline" onClick={handleRemove}>
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            )}
          </div>
        </div>

        {/* Status */}
        {config?.connected && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Status</h3>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-600">
                Connected to Google Ads customer {config.customerId}
              </span>
            </div>
            {config.lastError && (
              <div className="mt-2 text-sm text-red-600">
                Last error: {config.lastError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
