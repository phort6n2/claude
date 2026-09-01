import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { runDailyAdsChecks, emailFindingsDigest } from '@/lib/google-ads-checks'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — run the daily Google Ads checks right now, from the maintenance
 * page. Same run as the cron, digest included, so "did the email look
 * right" is answerable without waiting for tomorrow.
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const summary = await runDailyAdsChecks()
  const digest = await emailFindingsDigest(summary)
  return NextResponse.json({ ...summary, digest })
}
