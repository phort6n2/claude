import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/notifications/subscribe - Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
    // Get portal session from cookie
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('portal_session')

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Parse session
    let session: { clientUserId: string; clientId: string }
    try {
      session = JSON.parse(sessionCookie.value)
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

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
        clientUserId: session.clientUserId,
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
    // Get portal session from cookie
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('portal_session')

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { endpoint } = await request.json()

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint required' },
        { status: 400 }
      )
    }

    // Mark subscription as inactive (soft delete)
    await prisma.pushSubscription.updateMany({
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
 * GET /api/portal/notifications/subscribe - Check subscription status
 */
export async function GET() {
  try {
    // Get portal session from cookie
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('portal_session')

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let session: { clientUserId: string }
    try {
      session = JSON.parse(sessionCookie.value)
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Get active subscriptions count for this user
    const count = await prisma.pushSubscription.count({
      where: {
        clientUserId: session.clientUserId,
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
