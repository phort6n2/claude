import { NextRequest, NextResponse } from 'next/server'
import { runTargetCpaSnapshot } from '@/lib/target-cpa-fetch'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/target-cpa (10:20 UTC daily — 6:20 am Eastern in summer, 5:20
 * in winter, before anybody looks)
 *
 * Reads every account under the manager into a TargetCpaSnapshot for the
 * Target CPA panel. Read-only against Google. The scheduler only; the page's
 * "Refresh now" goes through /api/admin/target-cpa/refresh.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runTargetCpaSnapshot('cron')
  console.log(
    result.ok
      ? `[TargetCpa] ${result.accounts} accounts, ${result.campaigns} AGMP campaigns, ${result.errors.length} account errors, ${result.durationMs}ms`
      : `[TargetCpa] failed: ${result.error} (${result.durationMs}ms)`
  )
  if (result.ok && result.errors.length) console.warn(`[TargetCpa] account errors: ${result.errors.join(' | ')}`)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
