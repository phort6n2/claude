'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'

interface NotificationToggleProps {
  className?: string
  /**
   * `row` is a labelled line for the account menu. The bare bell sat in the
   * Leads page's own header with nothing to say what it switched, and the
   * one thing a shop owner needs to know about it — that it is alerts on
   * THIS phone — was only in a hover title a phone never shows.
   */
  variant?: 'icon' | 'row'
}

export function NotificationToggle({ className = '', variant = 'icon' }: NotificationToggleProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    // Check if push notifications are supported
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
      const response = await fetch('/api/portal/notifications/subscribe')
      if (response.ok) {
        const data = await response.json()
        setIsSubscribed(data.subscribed)
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

  async function subscribe() {
    setIsLoading(true)

    try {
      // Request permission if needed
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') {
          setIsLoading(false)
          return
        }
      }

      if (Notification.permission !== 'granted') {
        setIsLoading(false)
        return
      }

      // Register service worker
      const registration = await registerServiceWorker()

      // Get VAPID public key
      const response = await fetch('/api/portal/notifications/subscribe')
      const { vapidPublicKey } = await response.json()

      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured')
      }

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })

      // Send subscription to server
      const saveResponse = await fetch('/api/portal/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      })

      if (saveResponse.ok) {
        setIsSubscribed(true)
      } else {
        const errorData = await saveResponse.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save subscription')
      }
    } catch (error) {
      console.error('Failed to subscribe:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to enable notifications: ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function unsubscribe() {
    setIsLoading(true)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe()

        // Remove from server
        await fetch('/api/portal/notifications/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }

      setIsSubscribed(false)
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render if not supported
  if (!isSupported) {
    return null
  }

  if (variant === 'row') {
    const state = isLoading ? '…' : permission === 'denied' ? 'Blocked' : isSubscribed ? 'On' : 'Off'
    const Icon = isLoading ? Loader2 : isSubscribed ? Bell : BellOff
    return (
      <button
        type="button"
        disabled={isLoading || permission === 'denied'}
        onClick={isSubscribed ? unsubscribe : subscribe}
        title={permission === 'denied' ? 'Blocked — turn notifications on in this browser\'s settings' : undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 ${className}`}
      >
        <Icon className={`h-4 w-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
        <span className="flex-1">
          Lead alerts on this device
          {permission === 'denied' && (
            <span className="block text-xs font-normal text-gray-400">Turn on in your browser settings</span>
          )}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            isSubscribed ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {state}
        </span>
      </button>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <button
        disabled
        className={`p-2 rounded-full text-gray-400 ${className}`}
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </button>
    )
  }

  // Show denied state
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
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      className={`p-2 rounded-full transition-colors ${
        isSubscribed
          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      } ${className}`}
      title={isSubscribed ? 'Notifications enabled - click to disable' : 'Enable notifications'}
    >
      {isSubscribed ? (
        <Bell className="h-5 w-5" />
      ) : (
        <BellOff className="h-5 w-5" />
      )}
    </button>
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
