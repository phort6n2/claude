import { NextRequest, NextResponse } from 'next/server'
import { buildMonthlyReports } from '@/lib/monthly-report-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/monthly-reports — the 1st of each month.
 *
 * BUILDS ONLY. Nothing is emailed here; a person presses send from
 * /admin/monthly-reports. See lib/monthly-report-run.ts for why.
 *
 * SCHEDULED AT 13:00 UTC, NOT MIDNIGHT, and the hour is load-bearing. At
 * 00:00 UTC on the 1st it is still the previous month in every US timezone,
 * so "last month" resolves to the month BEFORE last for every client on the
 * platform — February's report would cover January, every month, and nothing
 * about the output would look wrong. 13:00 UTC is mid-morning in the east and
 * early morning in the west, by which point every zone this platform serves
 * has finished the month. `scripts/check-tz-windows.ts` asserts the trap.
 */
async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && !cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await buildMonthlyReports()
  // Logged as well as returned: a month that built nothing is the state that
  // needs a person, and nothing else in the app would show it.
  console.log(`[MonthlyReport] build run: ${result.message}`)
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
