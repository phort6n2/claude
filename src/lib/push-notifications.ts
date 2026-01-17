import webpush from 'web-push'
import { prisma } from './db'

// Configure VAPID details
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = 'mailto:' + (process.env.ADMIN_EMAIL || 'admin@glassleads.app')

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
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
 * Send new lead notification to client users
 */
export async function notifyNewLead(
  clientId: string,
  leadInfo: { firstName?: string | null; phone?: string | null; source: string }
): Promise<void> {
  const clientName = leadInfo.firstName || 'New customer'
  const sourceLabel = leadInfo.source === 'PHONE' ? '📞 Phone Call' : '📝 Form Submission'

  await notifyClientUsers(clientId, {
    title: '🎉 New Lead!',
    body: `${clientName} - ${sourceLabel}`,
    tag: 'new-lead',
    data: {
      url: '/portal/leads',
      type: 'new-lead',
    },
  })
}
