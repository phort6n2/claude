import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { ensureRankCampaigns } from '@/lib/rank-campaigns'
import { appOrigin } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — run the rank-campaign sweep now instead of waiting for the daily
 * cron.
 *
 * The first run against a live account is the one most likely to surface a
 * setup problem — a key without API access, a plan without credits, a
 * Static Maps API left disabled — and watching it happen beats discovering
 * it tomorrow. Idempotent: clients that already have a campaign are skipped,
 * so pressing it twice costs nothing.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  // The webhook URL has to be one Local Dominator can reach from outside.
  const origin = appOrigin()

  try {
    const result = await ensureRankCampaigns(origin)
    const parts: string[] = []
    if (result.created) parts.push(`${result.created} campaign${result.created === 1 ? '' : 's'} created`)
    if (result.backfilled) parts.push(`${result.backfilled} location${result.backfilled === 1 ? '' : 's'} looked up`)
    if (result.skipped) parts.push(`${result.skipped} skipped (no Google Place ID or location yet)`)
    if (result.errors.length) {
      parts.push(`${result.errors.length} failed: ${result.errors.map((e) => `${e.client} — ${e.error}`).join('; ')}`)
    }
    if (parts.length === 0) parts.push('Nothing to do — every client already has a campaign.')

    return NextResponse.json({
      success: result.errors.length === 0,
      message: parts.join(' · '),
      ...result,
    })
  } catch (error) {
    console.error('[RankCampaigns] manual run failed:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Run failed' },
      { status: 500 }
    )
  }
}
