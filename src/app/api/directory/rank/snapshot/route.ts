import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { getShopBySlug } from '@/lib/directory/data'
import { snapshotRanks, getRankEvents } from '@/lib/directory/rank-history'
import {
  segmentRecipients,
  isUnsubscribed,
  unsubscribeUrlFor,
  campaignEnabled,
} from '@/lib/directory/campaign'
import { notifyRankDrop } from '@/lib/directory/notify'
import { sendLeadEvent } from '@/lib/directory/webhooks'

// Rank snapshot + "you just got passed" trigger.
//
// GET   → the recent movement feed (admin), no writes.
// POST  → take a snapshot, diff against the last one, record movement events,
//         and email owners who DROPPED a position (loss aversion is sharpest
//         right after a drop). Runs daily via vercel.json crons.
//
// The drop email is marketing, not transactional, so it only goes to owners who
// opted into marketing AND haven't unsubscribed — and only when the campaign is
// fully armed. Snapshotting itself always runs; it's just data.
//
// Auth (any one):
//   • Vercel Cron / CRON_SECRET:  Authorization: Bearer $CRON_SECRET  or  ?secret=$CRON_SECRET
//   • Agency console:             admin session cookie / x-upload-secret
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isCron(request: Request): boolean {
  const cron = process.env.CRON_SECRET
  if (!cron) return false
  const url = new URL(request.url)
  return (
    request.headers.get('authorization') === `Bearer ${cron}` ||
    url.searchParams.get('secret') === cron
  )
}

function authorized(request: Request): boolean {
  return isCron(request) || isAdmin(request)
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200)
  return NextResponse.json({ events: await getRankEvents(limit) })
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  // Preview from the console by default; a real cron tick always commits.
  const dryRun = !isCron(request) && url.searchParams.get('commit') !== '1'

  const report = await snapshotRanks({ dryRun })

  const drops = report.events.filter((e) => e.direction === 'dropped')
  const notified: string[] = []
  const skipped: string[] = []

  // Push drops to AGMP regardless of the shop's marketing consent: this is
  // B2B prospect intel for the agency's own outbound, not an email to the shop.
  // (The email below is what's consent-gated.)
  if (!dryRun) {
    for (const e of drops) {
      const shop = getShopBySlug(e.slug)
      await sendLeadEvent({
        type: 'shop.rank_dropped',
        slug: e.slug,
        name: e.name,
        email: shop?.email || undefined,
        phone: shop?.phone || undefined,
        city: e.city,
        state: e.state.toUpperCase(),
        website: shop?.website || undefined,
        rank: e.to,
        previousRank: e.from,
        total: e.total,
        passedBy: e.passedBy?.map((p) => p.name),
      })
    }
  }
  // Safety valve: a bulk listing import shifts every rank in a city at once.
  // Cap the sends so that can never turn into a mass blast; the events are all
  // still recorded, and the rest simply aren't emailed.
  const MAX_SENDS = 25
  const capped = drops.length > MAX_SENDS

  if (!dryRun && drops.length && campaignEnabled()) {
    // Reuse the campaign's consent logic (dashboard toggle > claim checkbox,
    // AGMP clients excluded) so one opt-out silences every marketing send.
    const recipients = await segmentRecipients()
    const emailBySlug = new Map(recipients.map((r) => [r.slug, r.email]))
    const address = process.env.DIRECTORY_MAILING_ADDRESS || ''

    for (const e of drops) {
      if (notified.length >= MAX_SENDS) {
        skipped.push(e.slug)
        continue
      }
      const email = emailBySlug.get(e.slug)
      if (!email) {
        skipped.push(e.slug)
        continue
      }
      if (await isUnsubscribed(e.slug)) {
        skipped.push(e.slug)
        continue
      }
      const shop = getShopBySlug(e.slug)
      if (!shop) {
        skipped.push(e.slug)
        continue
      }
      try {
        await notifyRankDrop({
          shop,
          email,
          from: e.from,
          to: e.to,
          total: e.total,
          passedBy: e.passedBy,
          unsubscribeUrl: unsubscribeUrlFor(e.slug),
          mailingAddress: address,
        })
        notified.push(e.slug)
      } catch {
        skipped.push(e.slug)
      }
    }
  }

  return NextResponse.json({
    ...report,
    dryRun,
    notified: notified.length,
    notifiedSlugs: notified,
    skipped: skipped.length,
    // Surfaced so a capped run is never mistaken for "everyone was contacted".
    ...(capped ? { capped: true, sendCap: MAX_SENDS } : {}),
  })
}
