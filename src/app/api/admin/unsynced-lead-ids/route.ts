import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Hard cap so a UI bulk-sync can't balloon into a runaway loop.
// The /api/cron/sync-enhanced-conversions cron picks up anything beyond this.
const MAX_IDS = 5000
const MAX_LOOKBACK_DAYS = 365

/**
 * GET /api/admin/unsynced-lead-ids?days=365&clientId=xxx
 *
 * Returns IDs of leads that haven't been synced to Google Ads Enhanced
 * Conversions yet and have an email or phone. Used by the UI to drive
 * a client-side batched bulk-sync loop.
 *
 * Returns at most MAX_IDS; `total` tells the caller how many exist in
 * total so a truncation message can be shown.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })
  if (user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const days = Math.min(
    Math.max(parseInt(searchParams.get('days') || '365', 10), 1),
    MAX_LOOKBACK_DAYS
  )
  const clientId = searchParams.get('clientId') || undefined

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const where = {
    createdAt: { gte: startDate },
    enhancedConversionSent: false,
    OR: [{ email: { not: null } }, { phone: { not: null } }],
    ...(clientId ? { clientId } : {}),
  }

  try {
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_IDS,
      }),
    ])

    return NextResponse.json({
      ids: leads.map((l) => l.id),
      total,
      truncated: total > MAX_IDS,
      max: MAX_IDS,
    })
  } catch (error) {
    console.error('[unsynced-lead-ids] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
