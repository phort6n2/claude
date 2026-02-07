import webpush from 'web-push'
import { prisma } from './db'

// Configure VAPID details
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = 'mailto:' + (process.env.ADMIN_EMAIL || 'admin@glassleads.app')

// Only set VAPID details if keys are configured and valid
// Wrapped in try-catch to prevent build failures with example/invalid keys
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  } catch (error) {
    console.warn('[Push] Failed to configure VAPID keys - push notifications disabled:',
      error instanceof Error ? error.message : 'Invalid key format')
  }
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, unknown>
}

/**
 * Send push notification to a specific subscription
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    }

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60, // 1 hour
        urgency: 'high',
      }
    )

    return true
  } catch (error: unknown) {
    const err = error as { statusCode?: number }
    console.error('[Push] Failed to send notification:', error)

    // If subscription is invalid (410 Gone or 404), mark as inactive
    if (err.statusCode === 410 || err.statusCode === 404) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: subscription.endpoint },
        data: { isActive: false },
      })
    }

    return false
  }
}

/**
 * Send push notification to all active subscriptions for a client
 */
export async function notifyClientUsers(
  clientId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  // Get all active push subscriptions for users of this client
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      isActive: true,
      clientUser: {
        clientId: clientId,
        isActive: true,
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const sub of subscriptions) {
    const success = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload
    )

    if (success) {
      sent++
      // Update last used timestamp
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastUsed: new Date(), failCount: 0 },
      })
    } else {
      failed++
      // Increment fail count
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { failCount: { increment: 1 } },
      })
    }
  }

  console.log(`[Push] Sent ${sent} notifications, ${failed} failed for client ${clientId}`)
  return { sent, failed }
}

/**
 * Send push notification to admin users subscribed to a specific client
 */
export async function notifyAdminUsers(
  clientId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  // Get all active admin push subscriptions that include this client
  const subscriptions = await prisma.adminPushSubscription.findMany({
    where: {
      isActive: true,
      clients: {
        some: {
          clientId: clientId,
        },
      },
    },
  })

  let sent = 0
  let failed = 0

  for (const sub of subscriptions) {
    const success = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload
    )

    if (success) {
      sent++
      await prisma.adminPushSubscription.update({
        where: { id: sub.id },
        data: { lastUsed: new Date(), failCount: 0 },
      })
    } else {
      failed++
      await prisma.adminPushSubscription.update({
        where: { id: sub.id },
        data: { failCount: { increment: 1 } },
      })
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`[Push] Admin notifications: ${sent} sent, ${failed} failed for client ${clientId}`)
  }
  return { sent, failed }
}

/**
 * Send new lead notification to client users AND admin users
 */
export async function notifyNewLead(
  clientId: string,
  leadInfo: { firstName?: string | null; phone?: string | null; source: string }
): Promise<void> {
  const clientName = leadInfo.firstName || 'New customer'
  const sourceLabel = leadInfo.source === 'PHONE' ? '📞 Phone Call' : '📝 Form Submission'

  // Get client business name for admin notifications
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true },
  })

  // Notify portal users (client employees)
  await notifyClientUsers(clientId, {
    title: '🎉 New Lead!',
    body: `${clientName} - ${sourceLabel}`,
    tag: 'new-lead',
    data: {
      url: '/portal/leads',
      type: 'new-lead',
    },
  })

  // Notify admin users subscribed to this client
  await notifyAdminUsers(clientId, {
    title: `🎉 New Lead - ${client?.businessName || 'Client'}`,
    body: `${clientName} - ${sourceLabel}`,
    tag: `new-lead-${clientId}`,
    data: {
      url: '/master-leads',
      type: 'new-lead',
      clientId,
    },
  })
}
