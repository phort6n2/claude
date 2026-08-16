import { NextRequest, NextResponse } from 'next/server'
import { syncContentFeeds } from '@/lib/content-feed'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/sync-content-feeds (nightly)
 *
 * Reads each shop's published content feed so their Activity tab knows when
 * something went up. Nightly because posts appear a few times a week at most,
 * and because this fetches fifteen other people's websites — there is no
 * reason to do that more often than the content changes.
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

  const result = await syncContentFeeds()
  // A feed that stopped answering is the state that needs a human, so it goes
  // in the log as well as onto the client's SEO tab.
  console.log(`[ContentFeed] nightly sync: ${result.message}`)
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
