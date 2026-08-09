import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { refreshGbpReviews, refreshLocationGbpReviews } from '@/lib/gbp-reviews'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/refresh-gbp-reviews (weekly)
 *
 * Refreshes the cached GBP rating data for every ACTIVE client that has a
 * Place ID, serially. Failures are recorded per client (lastError) and never
 * remove previously cached data — a bad day at the Places API degrades to
 * slightly stale ratings, not missing ones.
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

  try {
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE', googlePlaceId: { not: null } },
      select: { id: true, slug: true },
    })

    const results: Array<{ slug: string; ok: boolean; skipped?: boolean; message: string }> = []
    for (const client of clients) {
      const result = await refreshGbpReviews(client.id)
      // rateLimited is the expected steady state, not a failure worth alerting on.
      results.push({
        slug: client.slug,
        ok: result.ok,
        skipped: !!result.rateLimited,
        message: result.message,
      })
    }

    // Extra shops carry their own Business Profiles, so each needs its own
    // call. Same floor, same failure handling.
    const locations = await prisma.clientLocation
      .findMany({
        where: { googlePlaceId: { not: null }, client: { status: 'ACTIVE' } },
        select: { id: true, label: true, client: { select: { slug: true } } },
      })
      .catch(() => [])
    for (const location of locations) {
      const result = await refreshLocationGbpReviews(location.id)
      results.push({
        slug: `${location.client.slug} / ${location.label}`,
        ok: result.ok,
        skipped: !!result.rateLimited,
        message: result.message,
      })
    }

    return NextResponse.json({ processed: results.length, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Cron] refresh-gbp-reviews failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
