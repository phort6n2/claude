import { NextRequest, NextResponse } from 'next/server'
import { runDailyAdsChecks, emailFindingsDigest } from '@/lib/google-ads-checks'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/ads-daily (every morning)
 *
 * The anomaly sweep: the Google Ads conditions that cost money by tonight,
 * checked while yesterday is still one day old. Files findings; emails the
 * digest ONLY when something new appeared, so the email means something.
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

  const summary = await runDailyAdsChecks()
  const digest = await emailFindingsDigest(summary)
  console.log(
    `[AdsChecks] daily: ${summary.accounts} accounts, ${summary.newFindings.length} new, ${summary.resolved} resolved, ${summary.errors.length} errors, digest ${digest.sent ? 'sent' : `not sent${digest.error ? ` (${digest.error})` : ''}`}`
  )
  return NextResponse.json({ ...summary, digest })
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
