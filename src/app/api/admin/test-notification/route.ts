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

    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: '🔔 Test Notification',
        body: `This is a test! Subscribed to: ${clientNames || 'No clients'}`,
        tag: 'test-notification',
        data: { url: '/master-leads' },
      }
    )

    return NextResponse.json({
      success: result,
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
