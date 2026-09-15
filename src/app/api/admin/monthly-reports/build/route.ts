import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { buildMonthlyReports } from '@/lib/monthly-report-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — build (or rebuild) the month's reports on demand.
 *
 * The same code the cron runs, so a press cannot produce a differently-shaped
 * report from the 1st's run — the rule the rank-campaign button follows. Takes
 * an explicit `year`/`month` for a backfill, and `clientId` for one shop.
 *
 * A report already SENT is never rebuilt: the shop has that email, so the
 * stored copy is a record of what they were told.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const year = Number.isInteger(body?.year) ? Number(body.year) : undefined
  const month = Number.isInteger(body?.month) ? Number(body.month) : undefined
  if ((year && !month) || (month && !year)) {
    return NextResponse.json(
      { error: 'Pass both year and month, or neither for last month.' },
      { status: 400 }
    )
  }
  if (month !== undefined && (month < 1 || month > 12)) {
    return NextResponse.json({ error: 'month is 1-12' }, { status: 400 })
  }

  const result = await buildMonthlyReports({
    year,
    month,
    clientId: typeof body?.clientId === 'string' ? body.clientId : undefined,
  })
  return NextResponse.json(result)
}
