// Service Worker for Push Notifications
// This file must be served from the root of the domain

self.addEventListener('install', (event) => {
  console.log('[SW] Push notification service worker installed')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Push notification service worker activated')
  event.waitUntil(clients.claim())
})

// Handle push events
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event)

  let data = {
    title: 'New Lead!',
    body: 'You have a new lead waiting',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'new-lead',
    data: { url: '/portal/leads' }
  }

  if (event.data) {
    try {
      const payload = event.data.json()
      data = { ...data, ...payload }
    } catch (e) {
      console.error('[SW] Error parsing push data:', e)
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'new-lead',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: data.data || { url: '/portal/leads' },
    actions: [
      { action: 'view', title: 'View Lead' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event)

  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  // Get the URL to open
  const urlToOpen = event.notification.data?.url || '/portal/leads'
  const isMasterLeads = urlToOpen.includes('master-leads')

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a matching window open
        for (const client of clientList) {
          const isMatchingPage = isMasterLeads
            ? client.url.includes('/master-leads')
            : client.url.includes('/portal')

          if (isMatchingPage && 'focus' in client) {
            // Master Leads opens on its Campaigns screen now, and an open app
            // window may be sitting there (or on the Dashboard). A lead alert
            // has to land on the LEADS list, so a window on any other screen
            // is moved there first — focusing it would show no lead at all.
            if (isMasterLeads && new URL(client.url).pathname !== '/master-leads' && 'navigate' in client) {
              return client
                .navigate(urlToOpen)
                .then((c) => (c || client).focus())
                .catch(() => clients.openWindow && clients.openWindow(urlToOpen))
            }
            client.postMessage({ type: 'NEW_LEAD', url: urlToOpen })
            return client.focus()
          }
        }
        // Open a new window if none found
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
  )
})

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event)
})
