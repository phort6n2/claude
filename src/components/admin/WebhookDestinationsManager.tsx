'use client'

import { useState, useEffect } from 'react'
import { Trash2, Loader2, Plus, Send, Check, AlertCircle } from 'lucide-react'

/** Outbound webhook destinations for a client. Each action applies immediately. */

interface WebhookDestinationRow {
  id: string
  label: string
  url: string
  enabled: boolean
  lastDelivery: {
    status: 'PENDING' | 'SUCCESS' | 'FAILED'
    attempts: number
    responseStatus: number | null
    lastError: string | null
    lastAttemptAt: string | null
    createdAt: string
  } | null
}

export default function WebhookDestinationsManager({ clientId }: { clientId: string }) {
  const [destinations, setDestinations] = useState<WebhookDestinationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  useEffect(() => {
    fetch(`/api/clients/${clientId}/webhooks`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.destinations)) setDestinations(data.destinations)
        else if (data.error) setError(data.error)
      })
      .catch(() => setError('Failed to load destinations'))
      .finally(() => setLoading(false))
  }, [clientId])

  async function addDestination() {
    if (!newLabel.trim() || !newUrl.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, url: newUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add destination')
        return
      }
      setDestinations((prev) => [...prev, { ...data, lastDelivery: null }])
      setNewLabel('')
      setNewUrl('')
    } catch {
      setError('Failed to add destination')
    } finally {
      setAdding(false)
    }
  }

  async function toggleDestination(dest: WebhookDestinationRow) {
    setBusyId(dest.id)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks/${dest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !dest.enabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update destination')
        return
      }
      setDestinations((prev) =>
        prev.map((d) => (d.id === dest.id ? { ...d, enabled: data.enabled } : d))
      )
    } catch {
      setError('Failed to update destination')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteDestination(dest: WebhookDestinationRow) {
    if (!window.confirm(`Delete "${dest.label}"? New leads will no longer be forwarded there.`)) {
      return
    }
    setBusyId(dest.id)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks/${dest.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete destination')
        return
      }
      setDestinations((prev) => prev.filter((d) => d.id !== dest.id))
    } catch {
      setError('Failed to delete destination')
    } finally {
      setBusyId(null)
    }
  }

  async function testDestination(dest: WebhookDestinationRow) {
    setBusyId(dest.id)
    setTestResults((prev) => ({ ...prev, [dest.id]: { success: false, message: 'Sending…' } }))
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks/${dest.id}/test`, {
        method: 'POST',
      })
      const data = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [dest.id]: data.success
          ? { success: true, message: `Delivered (HTTP ${data.responseStatus})` }
          : { success: false, message: data.error || 'Delivery failed' },
      }))
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [dest.id]: { success: false, message: 'Delivery failed' },
      }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-gray-500 text-sm">Loading destinations…</div>
      ) : destinations.length === 0 ? (
        <p className="text-sm text-gray-500">
          No destinations configured. Leads are stored here either way — add a destination
          (like this client&apos;s HighLevel inbound webhook) to have every lead forwarded
          there automatically.
        </p>
      ) : (
        <div className="space-y-3">
          {destinations.map((dest) => {
            const test = testResults[dest.id]
            const last = dest.lastDelivery
            return (
              <div
                key={dest.id}
                className={`p-4 border rounded-lg ${dest.enabled ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-75'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{dest.label}</span>
                      {!dest.enabled && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
                          Disabled
                        </span>
                      )}
                    </div>
                    <code className="block text-xs text-gray-500 truncate mt-1">{dest.url}</code>
                    {last && (
                      <p className="text-xs mt-1">
                        <span
                          className={
                            last.status === 'SUCCESS'
                              ? 'text-green-600'
                              : last.status === 'FAILED'
                                ? 'text-red-600'
                                : 'text-amber-600'
                          }
                        >
                          Last delivery: {last.status.toLowerCase()}
                          {last.responseStatus ? ` (HTTP ${last.responseStatus})` : ''}
                        </span>
                        {last.status === 'FAILED' && last.lastError && (
                          <span className="text-gray-400"> — {last.lastError}</span>
                        )}
                      </p>
                    )}
                    {test && (
                      <p className={`text-xs mt-1 ${test.success ? 'text-green-600' : 'text-red-600'}`}>
                        Test: {test.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => testDestination(dest)}
                      disabled={busyId === dest.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Send a test payload"
                    >
                      <Send className="h-3 w-3" />
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDestination(dest)}
                      disabled={busyId === dest.id}
                      className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {dest.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDestination(dest)}
                      disabled={busyId === dest.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete destination"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      <div className="border-t pt-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="HighLevel — main workflow"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Webhook URL (https)</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://services.leadconnectorhq.com/hooks/..."
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={addDestination}
            disabled={adding || !newLabel.trim() || !newUrl.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Use the Test button after adding — it sends a clearly-marked test contact so you can
          confirm it arrives before real leads depend on it.
        </p>
      </div>
    </div>
  )
}

