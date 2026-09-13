import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createRankCampaignFor } from '@/lib/rank-campaigns'
import { coordsFromText } from '@/lib/place-location'
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
export async function POST(request: Request, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params

  /* AN OPERATOR-SUPPLIED GRID CENTRE, which is not a fallback for a broken
     lookup — it is the right answer for a service-area business. A shop with
     no storefront has no address on its profile, so the centre of the grid is
     the middle of the area they actually cover, and only the operator knows
     where that is. Parsed here rather than in the browser so the URL forms
     and the plausibility rules have one implementation. */
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  let centre: { latitude: number; longitude: number } | undefined
  if (typeof body.centre === 'string' && body.centre.trim()) {
    const parsed = coordsFromText(body.centre)
    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'No coordinates in that. Paste the Google Maps URL from the address bar, or a "latitude, longitude" pair.',
        },
        { status: 400 }
      )
    }
    centre = parsed
  }

  // appOrigin(), not the calling host: the webhook has to point at a host
  // Local Dominator can reach. Same reason the cron uses it.
  const result = await createRankCampaignFor(id, appOrigin(), centre)

  // 409 rather than 500: a refusal here is a state of the client, not a
  // failure of this endpoint, and the message names what to change.
  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
