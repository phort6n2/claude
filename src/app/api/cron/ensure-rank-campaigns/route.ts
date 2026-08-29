import { NextRequest, NextResponse } from 'next/server'
import { ensureRankCampaigns } from '@/lib/rank-campaigns'
import { siteOriginFor } from '@/lib/site-origin'
import { appOrigin } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/ensure-rank-campaigns (daily)
 *
 * Gives every active client a rank-tracking campaign, without anyone
 * enabling anything. Converges rather than fires once: a client who gains a
 * Place ID next week, or whose first attempt failed, is picked up on the
 * next run.
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

  // The webhook has to point at a host Local Dominator can reach, which is
  // the deployment's public origin rather than whatever host called the cron.
  const origin = appOrigin()

  try {
    const result = await ensureRankCampaigns(origin)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[RankCampaigns] sweep failed:', error)
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
