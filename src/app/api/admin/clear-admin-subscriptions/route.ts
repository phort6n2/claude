import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/clear-admin-subscriptions?key=glassleads2024
 * Clears all admin push subscriptions to start fresh
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'glassleads2024') {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  try {
    // Delete all admin subscription clients first (due to foreign key)
    const deletedClients = await prisma.adminPushSubscriptionClient.deleteMany({})

    // Delete all admin subscriptions
    const deletedSubs = await prisma.adminPushSubscription.deleteMany({})

    return NextResponse.json({
      success: true,
      message: 'All admin push subscriptions cleared',
      deletedSubscriptions: deletedSubs.count,
      deletedClientLinks: deletedClients.count,
      nextSteps: [
        '1. Go to master-leads (from home screen PWA)',
        '2. Tap bell icon',
        '3. Select clients and save',
        '4. Test with /api/admin/test-notification?key=glassleads2024',
      ],
    })
  } catch (error) {
    console.error('Failed to clear subscriptions:', error)
    return NextResponse.json(
      { error: 'Failed to clear', details: String(error) },
      { status: 500 }
    )
  }
}
