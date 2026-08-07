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

/** Outcome of one send — enough for the caller to prune its own table. */
export interface PushResult {
  delivered: boolean
  /** The push service says this endpoint is permanently dead. Stop sending. */
  gone: boolean
}

/**
 * Status codes that mean the subscription no longer exists: the user
 * uninstalled, cleared site data, or the token expired. Retrying never
 * succeeds.
 */
const GONE_STATUS_CODES = new Set([404, 410])

/**
 * Consecutive failures after which an endpoint is retired anyway.
 *
 * Not every dead endpoint announces itself with a 410 — some just refuse the
 * connection (ECONNRESET) or time out indefinitely. Without this, such a
 * subscription is retried on every single lead forever.
 */
const MAX_CONSECUTIVE_FAILURES = 10

/**
 * Send a push notification to one subscription.
 *
 * Deliberately does NOT touch the database. There are two subscription tables
 * (`PushSubscription` for portal users, `AdminPushSubscription` for admins)
 * sharing this function, and the previous version only ever deactivated rows
 * in the first one — so a dead admin endpoint was never retired and every new
 * lead retried it and logged a failure. The caller knows which table its row
 * lives in; this returns enough for it to act.
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<PushResult> {
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

    return { delivered: true, gone: false }
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode
    const gone = statusCode !== undefined && GONE_STATUS_CODES.has(statusCode)

    if (gone) {
      // Expected end-of-life, not a fault worth a stack trace on every lead.
      console.warn(
        `[Push] Endpoint gone (${statusCode}); retiring subscription ${subscription.endpoint.slice(0, 40)}…`
      )
    } else {
      console.error('[Push] Failed to send notification:', error)
    }

    return { delivered: false, gone }
  }
}

/**
 * Persist the result of a send against whichever subscription table the row
 * came from. `update` is a closure over the caller's Prisma delegate.
 */
async function recordOutcome(
  result: PushResult,
  current: { id: string; failCount: number; endpoint: string },
  update: (data: {
    isActive?: boolean
    lastUsed?: Date
    failCount?: number
  }) => Promise<unknown>
): Promise<void> {
  try {
    if (result.delivered) {
      await update({ lastUsed: new Date(), failCount: 0 })
      return
    }

    const failCount = current.failCount + 1
    const retire = result.gone || failCount >= MAX_CONSECUTIVE_FAILURES

    if (retire && !result.gone) {
      console.warn(
        `[Push] Retiring subscription after ${failCount} consecutive failures: ${current.endpoint.slice(0, 40)}…`
      )
    }

    await update({ failCount, ...(retire ? { isActive: false } : {}) })
  } catch (error) {
    // Bookkeeping must never abort the loop — the other recipients still
    // deserve their notification.
    console.error(`[Push] Failed to record outcome for ${current.id}:`, error)
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
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload
    )

    if (result.delivered) sent++
    else failed++

    await recordOutcome(result, sub, (data) =>
      prisma.pushSubscription.update({ where: { id: sub.id }, data })
    )
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
    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload
    )

    if (result.delivered) sent++
    else failed++

    // This is the path that was leaking: a dead admin endpoint used to be
    // retried on every lead because the 410 handling only knew about the
    // portal-user table.
    await recordOutcome(result, sub, (data) =>
      prisma.adminPushSubscription.update({ where: { id: sub.id }, data })
    )
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
