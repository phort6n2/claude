import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { SCAN_PRESETS, updateScheduledScanGrid } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — push the current grid geometry onto every existing campaign.
 *
 * Spacing lives in SCAN_PRESETS, but a campaign already created at the old
 * spacing keeps it forever: their scheduler holds the geometry, not us. This
 * PATCHes each one instead of recreating it, so campaign ids, stored history
 * and webhooks all survive, and nothing spends a run's credits to get there.
 *
 * The next scheduled run uses the new grid. Runs already stored keep the
 * geometry they were taken at, which is correct — a scan measures a
 * particular area, and relabelling old ones would turn the trend into a
 * comparison between two different questions.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: { id: true, businessName: true, seoClient: true, rankTrackingId: true },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return NextResponse.json({ success: false, message: 'No campaigns to update.' })
  }

  let updated = 0
  const failures: string[] = []

  for (const client of clients) {
    const preset = SCAN_PRESETS[client.seoClient ? 'seo' : 'standard']
    const result = await updateScheduledScanGrid(client.rankTrackingId!, {
      distance: preset.distance,
      gridSize: preset.gridSize,
    })
    if (result.ok) updated++
    else failures.push(`${client.businessName}: ${result.error}`)
  }

  const span = (SCAN_PRESETS.seo.distance * (SCAN_PRESETS.seo.gridSize - 1)) / 1609.344
  return NextResponse.json({
    success: failures.length === 0,
    message:
      `${updated} of ${clients.length} campaigns now scan at ${SCAN_PRESETS.seo.distance}m between pins ` +
      `(${span.toFixed(2)} miles across). Takes effect on their next run.` +
      (failures.length ? ` Failed: ${failures.join('; ')}` : ''),
    updated,
    failed: failures.length,
  })
}
