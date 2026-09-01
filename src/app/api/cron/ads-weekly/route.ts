import { NextRequest, NextResponse } from 'next/server'
import { runWeeklyPlaybook } from '@/lib/google-ads-playbook'
import { emailFindingsDigest } from '@/lib/google-ads-checks'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/ads-weekly (Monday mornings)
 *
 * The optimization playbook: maturity-ladder bidding recommendations,
 * leaking settings, negatives candidates — every one cooldown-checked
 * against the last 30 days of change history first. Files WEEKLY findings
 * and emails the digest only when something new appeared.
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

  const summary = await runWeeklyPlaybook()
  const digest = await emailFindingsDigest(summary)
  console.log(
    `[AdsPlaybook] weekly: ${summary.accounts} accounts, ${summary.newFindings.length} new, ${summary.resolved} resolved, ${summary.heldByCooldown.length} held by cooldown, ${summary.errors.length} errors`
  )
  return NextResponse.json({ ...summary, digest })
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
