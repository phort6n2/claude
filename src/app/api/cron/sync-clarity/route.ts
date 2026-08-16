import { NextRequest, NextResponse } from 'next/server'
import { syncClarityHistory } from '@/lib/clarity'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/sync-clarity (nightly)
 *
 * Clarity's export API serves the last three days and nothing older. A day not
 * copied out inside that window cannot be fetched again at any price — it
 * survives only in their dashboard, for a person to read by eye. This is the
 * job that turns "the last three days" into a history worth reasoning about.
 *
 * Runs after the other nightly jobs so a slow one cannot eat into the window.
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

  const result = await syncClarityHistory()
  console.log(`[Clarity] nightly sync: ${result.message}`)
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
