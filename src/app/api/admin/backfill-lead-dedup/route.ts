import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizePhone, normalizeEmail } from '@/lib/lead-dedup'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * One-shot backfill: scan recent Lead rows and mark same-day same-customer
 * leads as duplicates of the earliest one of the day. Skips leads already
 * pointed at a canonical.
 *
 * Auth: ?secret=$CRON_SECRET. Args: ?days=N (default 30, max 365).
 *
 * Matching, in priority order, scoped to (clientId, calendar day in client TZ):
 *   1. Phone (normalized last-10-digits)
 *   2. Email (lowercased)
 *   3. HighLevel contact ID (exact)
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  if (new URL(req.url).searchParams.get('secret') === secret) return true
  return false
}

interface DayBucket {
  canonicalId: string
  // Within a day, the canonical is the earliest. Used to follow chains.
}

function dayKey(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

async function backfill(req: NextRequest) {
  const days = Math.min(
    365,
    Math.max(1, parseInt(new URL(req.url).searchParams.get('days') ?? '30', 10) || 30)
  )
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Pull every candidate Lead in the window, ordered oldest-first per client.
  // We process per client + per day, picking the earliest as canonical.
  const clients = await prisma.client.findMany({
    select: { id: true, businessName: true, timezone: true },
  })

  let scanned = 0
  let marked = 0
  let alreadyMarked = 0
  const perClient: Array<{
    clientId: string
    businessName: string
    scanned: number
    marked: number
  }> = []

  for (const client of clients) {
    const tz = client.timezone ?? 'America/Denver'
    const rows = await prisma.lead.findMany({
      where: {
        clientId: client.id,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        phone: true,
        email: true,
        highlevelContactId: true,
        createdAt: true,
        duplicateOfLeadId: true,
      },
    })

    // Within this client, walk leads chronologically. For each, compute its
    // dedup key and check whether we've seen that key today. Phone is the
    // primary key; only if absent does email or highlevel id take over.
    const byPhoneKey = new Map<string, DayBucket>() // `${day}|${normPhone}`
    const byEmailKey = new Map<string, DayBucket>() // `${day}|${normEmail}`
    const byHlKey = new Map<string, DayBucket>() // `${day}|${hlContactId}`

    let clientMarked = 0

    for (const row of rows) {
      scanned += 1
      const day = dayKey(row.createdAt, tz)
      const phone = normalizePhone(row.phone)
      const email = normalizeEmail(row.email)
      const hl = row.highlevelContactId

      // Find an existing canonical for any of this row's keys.
      let bucket: DayBucket | undefined
      if (phone) bucket = byPhoneKey.get(`${day}|${phone}`)
      if (!bucket && email) bucket = byEmailKey.get(`${day}|${email}`)
      if (!bucket && hl) bucket = byHlKey.get(`${day}|${hl}`)

      if (!bucket) {
        // First contact in the day for this customer — becomes canonical.
        const newBucket: DayBucket = { canonicalId: row.id }
        if (phone) byPhoneKey.set(`${day}|${phone}`, newBucket)
        if (email) byEmailKey.set(`${day}|${email}`, newBucket)
        if (hl) byHlKey.set(`${day}|${hl}`, newBucket)
        continue
      }

      // Existing canonical — also index this row's other keys so future rows
      // that only share one of them still match.
      if (phone) byPhoneKey.set(`${day}|${phone}`, bucket)
      if (email) byEmailKey.set(`${day}|${email}`, bucket)
      if (hl) byHlKey.set(`${day}|${hl}`, bucket)

      if (row.duplicateOfLeadId === bucket.canonicalId) {
        alreadyMarked += 1
        continue
      }

      // Don't let a row reference itself.
      if (row.id === bucket.canonicalId) continue

      try {
        await prisma.lead.update({
          where: { id: row.id },
          data: { duplicateOfLeadId: bucket.canonicalId },
        })
        marked += 1
        clientMarked += 1
      } catch (err) {
        console.warn(
          `[Dedup backfill] Failed to mark ${row.id} as duplicate:`,
          err
        )
      }
    }

    perClient.push({
      clientId: client.id,
      businessName: client.businessName,
      scanned: rows.length,
      marked: clientMarked,
    })
  }

  return NextResponse.json({
    days,
    sinceIso: since.toISOString(),
    totals: { scanned, marked, alreadyMarked },
    perClient,
  })
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return backfill(request)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return backfill(request)
}
