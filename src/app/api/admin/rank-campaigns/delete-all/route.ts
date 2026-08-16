import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { deleteScheduledScan } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * POST — delete every rank campaign at Local Dominator.
 *
 * Irreversible on their side: their docs are explicit that deleting a
 * scheduled scan removes "its associated data", which is every run it has
 * taken. Recreating is not a restore — it is a new campaign, new ids, new
 * share tokens, and a run's credits per client the moment it is created.
 *
 * Our stored scans are a separate decision, hence `purgeScans`. Left alone
 * they keep the trend history, but their maps point at tokens Local
 * Dominator has just purged, so those frames will 404 — the report degrades
 * to "this scan didn't come back with a map" rather than breaking, but the
 * history becomes numbers without pictures. Purge them if the point of
 * deleting was to start clean.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const purgeScans = !!body?.purgeScans

  const clients = await prisma.client
    .findMany({
      where: { rankTrackingId: { not: null } },
      select: { id: true, businessName: true, rankTrackingId: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return NextResponse.json({ success: false, message: 'No campaigns to delete.' })
  }

  let deleted = 0
  let purged = 0
  const failures: string[] = []

  for (const client of clients) {
    const ok = await deleteScheduledScan(client.rankTrackingId as string)
    if (!ok) {
      // Clear our side anyway: a campaign we cannot delete is one we can no
      // longer manage, and leaving the id behind means the daily sweep skips
      // the client forever, believing it already has a campaign.
      failures.push(client.businessName)
    } else {
      deleted++
    }

    await prisma.client
      .update({
        where: { id: client.id },
        data: { rankTrackingId: null, rankMapUrl: null },
      })
      .catch(() => {})

    if (purgeScans) {
      const removed = await prisma.localRankScan
        .deleteMany({ where: { clientId: client.id } })
        .catch(() => ({ count: 0 }))
      purged += removed.count
    }

    console.warn(
      `[RankCampaigns] deleted ${client.businessName} campaign=${client.rankTrackingId} ok=${ok}`
    )
  }

  return NextResponse.json({
    success: failures.length === 0,
    message:
      `${deleted} of ${clients.length} campaigns deleted at Local Dominator` +
      (purgeScans ? `, ${purged} stored scans removed` : ', stored scans kept') +
      `. Every client is now unlinked, so "Create campaigns now" will build fresh ones — that spends a run's credits each.` +
      (failures.length
        ? ` Their API refused: ${failures.join(', ')} — unlinked here anyway, so check for orphans in their dashboard.`
        : ''),
    deleted,
    purged,
    failed: failures.length,
  })
}
