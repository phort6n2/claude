import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requirePortalSession } from '@/lib/portal-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/notifications/subscribe - Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
    // Verified session only — this route used to JSON.parse the raw cookie,
    // which trusted whatever the browser sent. Mutating, so impersonated
    // sessions are refused (a push subscription would bind the admin's own
    // browser to the client's notifications).
    const guard = await requirePortalSession({ mutating: true })
    if ('response' in guard) return guard.response
    const session = guard.session

    const { subscription, userAgent } = await request.json()

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription data' },
        { status: 400 }
      )
    }

    // Upsert the subscription (update if endpoint exists, create if not)
    const pushSub = await prisma.pushSubscription.upsert({
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
        clientUserId: session.userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || null,
      },
    })

    return NextResponse.json({
      success: true,
      subscriptionId: pushSub.id,
    })
  } catch (error) {
    console.error('Failed to save push subscription:', error)
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/portal/notifications/subscribe - Unsubscribe from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requirePortalSession({ mutating: true })
    if ('response' in guard) return guard.response
    const session = guard.session

    const { endpoint } = await request.json()

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint required' },
        { status: 400 }
      )
    }

    // Soft delete, scoped to the caller's own subscriptions — an endpoint
    // alone must not be enough to silence someone else's notifications.
    await prisma.pushSubscription.updateMany({
      where: { endpoint, clientUserId: session.userId },
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
 * GET /api/portal/notifications/subscribe - Check subscription status
 */
export async function GET() {
  try {
    const guard = await requirePortalSession()
    if ('response' in guard) return guard.response
    const session = guard.session

    // Get active subscriptions count for this user
    const count = await prisma.pushSubscription.count({
      where: {
        clientUserId: session.userId,
        isActive: true,
      },
    })

    return NextResponse.json({
      subscribed: count > 0,
      subscriptionCount: count,
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
