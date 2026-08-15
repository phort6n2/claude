import { NextRequest, NextResponse } from 'next/server'
import { syncSeoArticles } from '@/lib/seo-articles'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/sync-seo-articles (nightly)
 *
 * BabyLoveGrowth publishes on its own schedule and pushes nothing, so this is
 * the only thing that puts new articles on a shop's site. Nightly rather than
 * hourly because articles appear a few times a week at most, and their API is
 * rate limited.
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

  const result = await syncSeoArticles()
  // Held and unmatched articles are the states that need a human, so they go
  // in the log where the nightly run can be checked without opening the app.
  console.log(`[SEO] nightly sync: ${result.message}`)
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
