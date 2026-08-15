import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import {
  SCAN_PRESETS,
  getScheduledScanSchedule,
  updateScheduledScanSchedule,
} from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — move every campaign onto the weekday, business-hours schedule.
 *
 * Why it matters: a geogrid measures the local pack at the moment it runs,
 * and the pack on a Sunday morning is not the one that sells jobs.
 * Competitors with weekend hours surface, closed shops get demoted, and the
 * grid moves for reasons that have nothing to do with the SEO being paid
 * for — which is exactly the wrong noise in a chart whose whole job is
 * showing whether the work is paying off.
 *
 * The monthly expression is `0 19 1-7 * 2`, meaning "the first Tuesday" only
 * if their scheduler ANDs day-of-month with day-of-week. Classic Vixie cron
 * ORs them, which would read as "every Tuesday, plus the 1st to the 7th" —
 * four times the runs and four times the credits for a client paying for
 * one scan a month.
 *
 * Their docs do not say which. So one campaign is changed first and its
 * `next_run_at` read back: a Tuesday inside the next five weeks means AND.
 * Anything else is reverted before a second campaign is touched.
 */
const SAFE_MONTHLY = '0 19 2 * *'

function describe(iso: string | null): string {
  if (!iso) return 'unknown'
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? 'unknown'
    : at.toUTCString().replace(':00 GMT', ' UTC')
}

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const clients = await prisma.client
    .findMany({
      where: { status: 'ACTIVE', rankTrackingId: { not: null } },
      select: { id: true, businessName: true, seoClient: true, rankTrackingId: true },
      orderBy: { businessName: 'asc' },
    })
    .catch(() => [])

  if (clients.length === 0) {
    return NextResponse.json({ success: false, message: 'No campaigns to reschedule.' })
  }

  // Weekly clients are unambiguous — a plain day-of-week cron means the same
  // thing under either reading — so they go first and carry no risk.
  const weekly = clients.filter((c) => c.seoClient)
  const monthly = clients.filter((c) => !c.seoClient)

  const notes: string[] = []
  let changed = 0
  const failures: string[] = []

  for (const client of weekly) {
    const result = await updateScheduledScanSchedule(client.rankTrackingId!, SCAN_PRESETS.seo.cron)
    if (result.ok) changed++
    else failures.push(`${client.businessName}: ${result.error}`)
  }
  if (weekly.length) {
    notes.push(`${weekly.length} weekly → Tuesdays 19:00 UTC`)
  }

  // Now the monthly ones, canary first.
  let monthlyCron: string = SCAN_PRESETS.standard.cron
  if (monthly.length > 0) {
    const canary = monthly[0]
    const applied = await updateScheduledScanSchedule(canary.rankTrackingId!, monthlyCron)
    if (!applied.ok) {
      // Rejected outright: fall straight back to a plain day-of-month cron.
      monthlyCron = SAFE_MONTHLY
      notes.push(`their API rejected the first-Tuesday expression, using the 2nd of the month`)
    } else {
      const schedule = await getScheduledScanSchedule(canary.rankTrackingId!)
      const next = schedule?.nextRunAt ? new Date(schedule.nextRunAt) : null
      const isTuesday = !!next && !Number.isNaN(next.getTime()) && next.getUTCDay() === 2
      const withinFiveWeeks =
        !!next && next.getTime() - Date.now() < 35 * 24 * 3_600_000
      if (isTuesday && withinFiveWeeks) {
        notes.push(`first-Tuesday confirmed — next run ${describe(schedule?.nextRunAt ?? null)}`)
      } else {
        // Either it ORed (weekly cadence) or it landed somewhere unexpected.
        // Revert this one and use the safe expression for everybody.
        monthlyCron = SAFE_MONTHLY
        await updateScheduledScanSchedule(canary.rankTrackingId!, monthlyCron)
        notes.push(
          `first-Tuesday NOT honoured (next run would have been ${describe(
            schedule?.nextRunAt ?? null
          )}), so monthly clients use the 2nd of the month at 19:00 UTC instead`
        )
      }
    }

    for (const client of monthly) {
      const result = await updateScheduledScanSchedule(client.rankTrackingId!, monthlyCron)
      if (result.ok) changed++
      else failures.push(`${client.businessName}: ${result.error}`)
    }
    notes.push(`${monthly.length} monthly → ${monthlyCron}`)
  }

  return NextResponse.json({
    success: failures.length === 0,
    message:
      `${changed} of ${clients.length} campaigns rescheduled. ` +
      notes.join(' · ') +
      (failures.length ? ` · Failed: ${failures.join('; ')}` : ''),
    changed,
    failed: failures.length,
  })
}
