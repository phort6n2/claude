'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2, X, Check } from 'lucide-react'

interface Client {
  id: string
  businessName: string
}

interface MasterNotificationToggleProps {
  clients: Client[]
  className?: string
}

export function MasterNotificationToggle({ clients, className = '' }: MasterNotificationToggleProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscribedClientIds, setSubscribedClientIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [showModal, setShowModal] = useState(false)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setIsSupported(supported)

    if (supported) {
      setPermission(Notification.permission)
      checkSubscription()
    } else {
      setIsLoading(false)
    }
  }, [])

  async function checkSubscription() {
    try {
      const response = await fetch('/api/admin/master-leads/notifications/subscribe')
      if (response.ok) {
        const data = await response.json()
        setIsSubscribed(data.subscribed)
        setSubscribedClientIds(data.subscribedClientIds || [])
        setSelectedClientIds(data.subscribedClientIds || [])
      }
    } catch (error) {
      console.error('Failed to check subscription:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function registerServiceWorker() {
    const registration = await navigator.serviceWorker.register('/sw-push.js')
    await navigator.serviceWorker.ready
    return registration
  }

  function openModal() {
    setSelectedClientIds(subscribedClientIds)
    setShowModal(true)
  }

  function toggleClient(clientId: string) {
    setSelectedClientIds(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    )
  }

  function selectAll() {
    setSelectedClientIds(clients.map(c => c.id))
  }

  function selectNone() {
    setSelectedClientIds([])
  }

  async function handleSave() {
    setIsSaving(true)

    try {
      // Request permission if needed
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') {
          setIsSaving(false)
          return
        }
      }

      if (Notification.permission !== 'granted') {
        setIsSaving(false)
        return
      }

      // Register service worker
      const registration = await registerServiceWorker()

      // Get VAPID public key
      const response = await fetch('/api/admin/master-leads/notifications/subscribe')
      const { vapidPublicKey, subscribed } = await response.json()

      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured')
      }

      // Get or create push subscription
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        })
      }

      // If no clients selected, unsubscribe
      if (selectedClientIds.length === 0) {
        if (subscribed) {
          await fetch('/api/admin/master-leads/notifications/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
        }
        setIsSubscribed(false)
        setSubscribedClientIds([])
        setShowModal(false)
        setIsSaving(false)
        return
      }

      // Save or update subscription with selected clients
      const method = subscribed ? 'PATCH' : 'POST'
      const body = subscribed
        ? { endpoint: subscription.endpoint, clientIds: selectedClientIds }
        : { subscription: subscription.toJSON(), userAgent: navigator.userAgent, clientIds: selectedClientIds }

      const saveResponse = await fetch('/api/admin/master-leads/notifications/subscribe', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (saveResponse.ok) {
        setIsSubscribed(true)
        setSubscribedClientIds(selectedClientIds)
        setShowModal(false)
      } else {
        const errorData = await saveResponse.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save subscription')
      }
    } catch (error) {
      console.error('Failed to save notification settings:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to save: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isSupported) {
    return (
      <button
        disabled
        className={`p-2 rounded-full text-gray-300 cursor-not-allowed ${className}`}
        title="Push notifications not supported - add to home screen on iOS"
      >
        <BellOff className="h-5 w-5" />
      </button>
    )
  }

  if (isLoading) {
    return (
      <button disabled className={`p-2 rounded-full text-gray-400 ${className}`}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </button>
    )
  }

  if (permission === 'denied') {
    return (
      <button
        disabled
        className={`p-2 rounded-full text-gray-400 cursor-not-allowed ${className}`}
        title="Notifications blocked - enable in browser settings"
      >
        <BellOff className="h-5 w-5" />
      </button>
    )
  }

  return (
    <>
      <button
        onClick={openModal}
        className={`p-2 rounded-full transition-colors ${
          isSubscribed
            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        } ${className}`}
        title={isSubscribed ? `Notifications: ${subscribedClientIds.length} clients` : 'Enable notifications'}
      >
        {isSubscribed ? (
          <Bell className="h-5 w-5" />
        ) : (
          <BellOff className="h-5 w-5" />
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => !isSaving && setShowModal(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-md bg-white rounded-xl shadow-2xl z-[51] max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-900">Lead Notifications</h3>
              <button
                onClick={() => !isSaving && setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
                disabled={isSaving}
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-gray-600 mb-4">
                Select which clients you want to receive push notifications for when new leads come in.
              </p>

              {/* Quick actions */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={selectAll}
                  className="text-xs text-blue-600 hover:underline"
                  disabled={isSaving}
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={selectNone}
                  className="text-xs text-blue-600 hover:underline"
                  disabled={isSaving}
                >
                  Select None
                </button>
              </div>

              {/* Client list */}
              <div className="space-y-2">
                {clients.map(client => (
                  <label
                    key={client.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedClientIds.includes(client.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        selectedClientIds.includes(client.id)
                          ? 'bg-blue-500 text-white'
                          : 'border-2 border-gray-300'
                      }`}
                    >
                      {selectedClientIds.includes(client.id) && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleClient(client.id)}
                      className="sr-only"
                      disabled={isSaving}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {client.businessName}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t bg-gray-50 rounded-b-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {selectedClientIds.length} of {clients.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
