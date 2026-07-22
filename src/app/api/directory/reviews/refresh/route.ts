import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { refreshReviews, reviewsEnabled } from '@/lib/directory/reviews'

// Refreshes the Google review snapshot. This is the ONLY endpoint that calls
// the paid Places API. Run on a schedule via vercel.json crons; can also be
// triggered manually to populate immediately.
//
// Auth (any one):
//   • Vercel Cron / CRON_SECRET:  Authorization: Bearer $CRON_SECRET  or  ?secret=$CRON_SECRET
//   • Agency console:             x-upload-secret: $DIRECTORY_UPLOAD_SECRET
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const url = new URL(request.url)
  const cron = process.env.CRON_SECRET
  if (cron) {
    const bearer = request.headers.get('authorization') === `Bearer ${cron}`
    const qs = url.searchParams.get('secret') === cron
    if (bearer || qs) return true
  }
  if (isAdmin(request)) return true
  return false
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!reviewsEnabled()) {
    return NextResponse.json(
      { error: 'Set GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) to enable reviews.' },
      { status: 400 }
    )
  }
  const result = await refreshReviews()
  return NextResponse.json({ ok: true, ...result })
}

// Allow POST too, so the cron or a fetch() can use either verb.
export const POST = GET
