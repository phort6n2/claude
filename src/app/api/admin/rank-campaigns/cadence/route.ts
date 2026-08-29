import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { campaignDetail, getScheduledScanSchedule, SCAN_PRESETS } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET — is every rank campaign actually running as often as its tier says?
 *
 * "The map hasn't updated" has four different causes and they are
 * indistinguishable from the outside:
 *
 * 1. The client is not an SEO client, so the campaign is MONTHLY by design
 *    and nothing is wrong.
 * 2. The campaign is on the wrong schedule on their side — created before a
 *    tier change, or rescheduled by hand.
 * 3. Their scheduler is running it, but the webhook is not reaching us, so
 *    their map moves and our stored history does not.
 * 4. Nothing is running at all.
 *
 * Reading THEIR run count against OUR stored scans separates 3 from 4, and
 * the schedule they hold separates 2 from 1. One call, no guessing from
 * screenshots.
 *
 * Reads only, on both sides.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: {
        id: true,
        businessName: true,
        seoClient: true,
        rankTrackingId: true,
        rankMapUrl: true,
      },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  const rows = []
  for (const client of clients) {
    const id = client.rankTrackingId as string
    const tier = client.seoClient ? 'seo' : 'standard'
    const expected = SCAN_PRESETS[tier]

    // One campaign at a time — the loop is what stays sequential, because
    // their API is not fast and fifteen campaigns fanned out at once is how a
    // diagnostic becomes the thing that needs diagnosing. The four reads for
    // a single campaign are independent, so those go together.
    const [detail, schedule, stored, storedCount] = await Promise.all([
      campaignDetail(id),
      getScheduledScanSchedule(id),
      prisma.localRankScan
        .findFirst({
          where: { clientId: client.id },
          orderBy: { scannedAt: 'desc' },
          select: { scannedAt: true },
        })
        .catch(() => null),
      prisma.localRankScan.count({ where: { clientId: client.id } }).catch(() => 0),
    ])

    const notes: string[] = []
    if (schedule?.scheduling && schedule.scheduling !== expected.cron) {
      notes.push(
        `Their schedule is "${schedule.scheduling}", the ${tier} tier expects "${expected.cron}". Fix with /api/admin/rank-campaigns/reschedule.`
      )
    }
    if (!client.seoClient) {
      notes.push(
        'Not an SEO client, so this campaign is monthly by design — a map that has not moved in a week is correct. Flip Client.seoClient for weekly.'
      )
    }
    if ((detail.runCount ?? 0) > 0 && storedCount === 0) {
      notes.push(
        'They have completed runs and we have stored none: the webhook is not reaching us. Their map still updates; our history does not.'
      )
    }
    if (detail.httpStatus && detail.httpStatus >= 400) {
      notes.push(`Their API answered ${detail.httpStatus} for this campaign.`)
    }

    rows.push({
      client: client.businessName,
      clientId: client.id,
      tier,
      campaignId: id,
      expectedCron: expected.cron,
      theirCron: schedule?.scheduling ?? null,
      nextRunAt: schedule?.nextRunAt ?? null,
      theirRunCount: detail.runCount,
      theirLastRun: detail.lastRunDate,
      ourScanCount: storedCount,
      ourLastScan: stored?.scannedAt ?? null,
      hasMapUrl: !!client.rankMapUrl,
      notes,
    })
  }

  return NextResponse.json({ checked: rows.length, campaigns: rows })
}
