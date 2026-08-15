import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { runScheduledScanNow } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — run every campaign now.
 *
 * The only way to see a geometry change on a map. Their scheduler holds the
 * grid and a stored run keeps whatever spacing it was measured at, so after
 * a respace the maps stay at the old zoom until a fresh run completes.
 *
 * Spends a run's credits per campaign, which is why it is a deliberate
 * button with a confirm and never part of the daily sweep.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: { businessName: true, rankTrackingId: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return NextResponse.json({ success: false, message: 'No campaigns to run.' })
  }

  let started = 0
  const failures: string[] = []
  for (const client of clients) {
    const result = await runScheduledScanNow(client.rankTrackingId as string)
    if (result.ok) started++
    else failures.push(`${client.businessName} (${result.error})`)
  }

  return NextResponse.json({
    success: failures.length === 0,
    message:
      `${started} of ${clients.length} campaigns started. Results arrive by webhook over the next few minutes; ` +
      `the maps widen once each run lands.` +
      (failures.length ? ` Failed: ${failures.join('; ')}` : ''),
    started,
    failed: failures.length,
  })
}
