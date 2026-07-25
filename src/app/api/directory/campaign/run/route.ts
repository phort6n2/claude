import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { runCampaign } from '@/lib/directory/campaign'

// Lifecycle upsell drip. Runs daily via vercel.json crons; deciding who's "due"
// is date-based, so a once-a-day tick is all it needs. Can also be triggered
// from the admin console — always as a dry-run preview there unless ?send=1.
//
// Auth (any one):
//   • Vercel Cron / CRON_SECRET:  Authorization: Bearer $CRON_SECRET  or  ?secret=$CRON_SECRET
//   • Agency console:             admin session cookie / x-upload-secret
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const url = new URL(request.url)
  const cron = process.env.CRON_SECRET
  if (cron) {
    if (request.headers.get('authorization') === `Bearer ${cron}`) return true
    if (url.searchParams.get('secret') === cron) return true
  }
  return isAdmin(request)
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  // Preview by default. Only an explicit ?send=1 (or a real cron tick) sends —
  // and even then the engine won't deliver unless the campaign is fully armed.
  const isCron =
    !!process.env.CRON_SECRET &&
    (request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}` ||
      url.searchParams.get('secret') === process.env.CRON_SECRET)
  const send = isCron || url.searchParams.get('send') === '1'

  const report = await runCampaign({ dryRun: !send })
  return NextResponse.json(report)
}

export const POST = GET
