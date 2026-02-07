import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Check if user is authorized for master leads
async function checkAuthorization() {
  const session = await auth()

  if (!session?.user?.email) {
    return { authorized: false, userId: null }
  }

  const allowedEmail = process.env.MASTER_LEADS_EMAIL
  if (!allowedEmail) {
    return { authorized: false, userId: null }
  }

  const isAuthorized = session.user.email.toLowerCase() === allowedEmail.toLowerCase()

  // Get the user ID from the database
  if (isAuthorized) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    return { authorized: true, userId: user?.id || null }
  }

  return { authorized: false, userId: null }
}

/**
 * POST /api/admin/master-leads/notifications/subscribe - Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
    const { authorized, userId } = await checkAuthorization()

    if (!authorized || !userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const { subscription, userAgent, clientIds } = await request.json()

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      )
    }

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one client must be selected' },
        { status: 400 }
      )
    }

    // Upsert the subscription
    const pushSub = await prisma.adminPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
        isActive: true,
        failCount: 0,
        updatedAt: new Date(),
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
      },
    })

    // Delete existing client associations and create new ones
    await prisma.adminPushSubscriptionClient.deleteMany({
      where: { subscriptionId: pushSub.id },
    })

    await prisma.adminPushSubscriptionClient.createMany({
      data: clientIds.map((clientId: string) => ({
        subscriptionId: pushSub.id,
        clientId,
      })),
    })

    return NextResponse.json({
      success: true,
      subscriptionId: pushSub.id,
      clientCount: clientIds.length,
    })
  } catch (error) {
    console.error('Failed to save admin push subscription:', error)
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/master-leads/notifications/subscribe - Unsubscribe
 */
export async function DELETE(request: NextRequest) {
  try {
    const { authorized } = await checkAuthorization()

    if (!authorized) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const { endpoint } = await request.json()

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 })
    }

    // Mark subscription as inactive
    await prisma.adminPushSubscription.updateMany({
      where: { endpoint },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to unsubscribe:', error)
    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/master-leads/notifications/subscribe - Check subscription status
 */
export async function GET() {
  try {
    const { authorized, userId } = await checkAuthorization()

    if (!authorized || !userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    // Get active subscriptions for this user with their client associations
    const subscriptions = await prisma.adminPushSubscription.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        clients: {
          select: {
            clientId: true,
          },
        },
      },
    })

    // Get all subscribed client IDs
    const subscribedClientIds = subscriptions.flatMap(s =>
      s.clients.map(c => c.clientId)
    )

    return NextResponse.json({
      subscribed: subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
      subscribedClientIds: [...new Set(subscribedClientIds)],
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })
  } catch (error) {
    console.error('Failed to check subscription status:', error)
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/master-leads/notifications/subscribe - Update subscribed clients
 */
export async function PATCH(request: NextRequest) {
  try {
    const { authorized, userId } = await checkAuthorization()

    if (!authorized || !userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const { endpoint, clientIds } = await request.json()

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 })
    }

    if (!clientIds || !Array.isArray(clientIds)) {
      return NextResponse.json({ error: 'clientIds array required' }, { status: 400 })
    }

    // Find the subscription
    const subscription = await prisma.adminPushSubscription.findUnique({
      where: { endpoint },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    // If no clients, deactivate the subscription
    if (clientIds.length === 0) {
      await prisma.adminPushSubscription.update({
        where: { id: subscription.id },
        data: { isActive: false },
      })
      await prisma.adminPushSubscriptionClient.deleteMany({
        where: { subscriptionId: subscription.id },
      })
      return NextResponse.json({ success: true, subscribed: false })
    }

    // Update client associations
    await prisma.adminPushSubscriptionClient.deleteMany({
      where: { subscriptionId: subscription.id },
    })

    await prisma.adminPushSubscriptionClient.createMany({
      data: clientIds.map((clientId: string) => ({
        subscriptionId: subscription.id,
        clientId,
      })),
    })

    // Ensure subscription is active
    await prisma.adminPushSubscription.update({
      where: { id: subscription.id },
      data: { isActive: true },
    })

    return NextResponse.json({
      success: true,
      subscribed: true,
      clientCount: clientIds.length,
    })
  } catch (error) {
    console.error('Failed to update subscription:', error)
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    )
  }
}
