import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendPushNotification } from '@/lib/push-notifications'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/test-notification - Test push notifications
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Check if tables exist
    let tablesExist = true
    try {
      await prisma.$queryRaw`SELECT 1 FROM "AdminPushSubscription" LIMIT 1`
    } catch {
      tablesExist = false
    }

    if (!tablesExist) {
      return NextResponse.json({
        success: false,
        error: 'Tables not created',
        message: 'Run the migration first: /api/admin/add-notification-tables?key=glassleads2024',
      })
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found in database',
      })
    }

    // Get subscriptions for this user
    const subscriptions = await prisma.adminPushSubscription.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      include: {
        clients: {
          include: {
            client: {
              select: { businessName: true },
            },
          },
        },
      },
    })

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active subscriptions',
        message: 'Enable notifications in the master-leads page first',
        userId: user.id,
      })
    }

    // Try to send a test notification
    const sub = subscriptions[0]
    const clientNames = sub.clients.map(c => c.client.businessName).join(', ')

    // Check VAPID keys
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({
        success: false,
        error: 'VAPID keys not configured',
        vapidPublicExists: !!vapidPublic,
        vapidPrivateExists: !!vapidPrivate,
        subscriptionCount: subscriptions.length,
        clientsSubscribed: sub.clients.length,
      })
    }

    // Try sending with detailed error capture
    let sendError: string | null = null
    let result = false

    try {
      const webpush = await import('web-push')

      webpush.setVapidDetails(
        'mailto:' + (process.env.ADMIN_EMAIL || 'admin@glassleads.app'),
        vapidPublic,
        vapidPrivate
      )

      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: '🔔 Test Notification',
          body: `This is a test! Subscribed to: ${clientNames || 'No clients'}`,
          tag: 'test-notification',
          data: { url: '/master-leads' },
        }),
        { TTL: 60 * 60, urgency: 'high' }
      )
      result = true
    } catch (err: unknown) {
      const error = err as { statusCode?: number; body?: string; message?: string }
      sendError = `Status: ${error.statusCode}, Body: ${error.body}, Message: ${error.message}`
      console.error('Push error details:', error)
    }

    return NextResponse.json({
      success: result,
      error: sendError,
      subscriptionCount: subscriptions.length,
      clientsSubscribed: sub.clients.length,
      clientNames: clientNames,
      endpoint: sub.endpoint.substring(0, 50) + '...',
    })
  } catch (error) {
    console.error('Test notification error:', error)
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
