import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createRankCampaignFor } from '@/lib/rank-campaigns'
import { appOrigin } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — create this client's rank campaign now, rather than at 04:00 UTC.
 *
 * The daily sweep was the only thing that had ever created one, which made
 * every fix to a blocked client a next-day question: link the Business
 * Profile, take the client off PAUSED, and then wait overnight to find out
 * whether that was the problem. Worse, a client who could NEVER be tracked
 * looked exactly the same as one waiting for tonight's run.
 *
 * Same code path as the sweep, so a press cannot produce a campaign shaped
 * differently from the one tonight would have made. It costs credits, so it
 * is only ever this press or the sweep — never a side effect of a save.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  // appOrigin(), not the calling host: the webhook has to point at a host
  // Local Dominator can reach. Same reason the cron uses it.
  const result = await createRankCampaignFor(id, appOrigin())

  // 409 rather than 500: a refusal here is a state of the client, not a
  // failure of this endpoint, and the message names what to change.
  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
