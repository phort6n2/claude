import { prisma } from '@/lib/db'

/**
 * What has actually been done for a shop, as a dated feed.
 *
 * The point is retention: SEO and lead generation fail with a small business
 * not because they do not work but because three months pass with nothing to
 * look at, and the retainer gets cancelled before the work compounds. This is
 * the answer to "what am I paying for", and the client reads it themselves.
 *
 * EVERY ITEM IS DERIVED FROM SOMETHING THAT HAPPENED. There is no activity
 * table and deliberately so — a table someone writes to by hand is a table
 * that can say a thing was done when it was not. These rows come from the
 * scans, photos, numbers, calls and uploads themselves, so the feed cannot
 * drift from the work.
 *
 * It also does NOT only show wins. A month where the ranking went sideways
 * still shows the scans that were run. A feed that is positive every single
 * month reads as marketing within two visits, and then the genuinely good
 * month reads as marketing too.
 */

export type ActivityKind =
  | 'ranking'
  | 'website'
  | 'photos'
  | 'reviews'
  | 'calls'
  | 'leads'
  | 'ads'
  | 'setup'

export interface ActivityItem {
  /** When it happened. Feed is newest first. */
  at: Date
  kind: ActivityKind
  /** One line, plain language, no jargon. */
  title: string
  /** Optional supporting sentence. Never speculative. */
  detail?: string
}

export interface ActivityMonth {
  /** First of the month, for keying and sorting. */
  month: Date
  label: string
  items: ActivityItem[]
}

/** Lower average position is better, so a negative delta is an improvement. */
function describeMovement(first: number, latest: number, keyword: string): string | null {
  const delta = Math.round((latest - first) * 10) / 10
  if (delta <= -0.3) {
    return `Moved up ${Math.abs(delta).toFixed(1)} positions on average for “${keyword}” since tracking started — from ${first.toFixed(1)} to ${latest.toFixed(1)}.`
  }
  if (delta >= 0.3) {
    return `Sitting ${delta.toFixed(1)} lower on average for “${keyword}” than when tracking started — from ${first.toFixed(1)} to ${latest.toFixed(1)}.`
  }
  return `Holding around position ${latest.toFixed(1)} for “${keyword}”.`
}

export async function getClientActivity(clientId: string): Promise<ActivityMonth[]> {
  const [client, scans, photos, content, cityPages, numbers, calls, reviews, domains, leadCounts] =
    await Promise.all([
      prisma.client
        .findUnique({
          where: { id: clientId },
          select: { createdAt: true, siteSubdomain: true, rankKeywords: true },
        })
        .catch(() => null),
      prisma.localRankScan
        .findMany({
          where: { clientId },
          orderBy: { scannedAt: 'asc' },
          select: { searchTerm: true, scannedAt: true, averageRank: true },
        })
        .catch(() => []),
      prisma.clientSitePhoto
        .findMany({ where: { clientId }, select: { createdAt: true } })
        .catch(() => []),
      prisma.clientSiteContent
        .findUnique({ where: { clientId }, select: { updatedAt: true } })
        .catch(() => null),
      prisma.clientCityContent
        .findMany({ where: { clientId }, select: { city: true, updatedAt: true } })
        .catch(() => []),
      prisma.trackingNumber
        .findMany({ where: { clientId }, select: { createdAt: true } })
        .catch(() => []),
      prisma.callAnalysis
        .findMany({
          where: { clientId, status: 'COMPLETE' },
          select: { createdAt: true, score: true },
        })
        .catch(() => []),
      prisma.clientGbpReviews
        .findUnique({ where: { clientId }, select: { fetchedAt: true, rating: true, reviewCount: true } })
        .catch(() => null),
      prisma.clientDomain
        .findMany({ where: { clientId }, select: { domain: true, createdAt: true } })
        .catch(() => []),
      prisma.lead
        .findMany({
          where: { clientId, duplicateOfLeadId: null },
          select: { createdAt: true, status: true, saleValue: true },
        })
        .catch(() => []),
    ])

  const items: ActivityItem[] = []
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`

  // ---- Ranking. One entry per scan date, plus the movement on the shop's
  // headline keyword, which is the number they actually care about.
  const scanDates = new Map<string, Set<string>>()
  for (const scan of scans) {
    const key = scan.scannedAt.toISOString().slice(0, 10)
    const set = scanDates.get(key) || new Set<string>()
    set.add(scan.searchTerm)
    scanDates.set(key, set)
  }
  for (const [day, terms] of scanDates) {
    items.push({
      at: new Date(`${day}T12:00:00Z`),
      kind: 'ranking',
      title: `Map ranking measured across ${terms.size === 1 ? 'your keyword' : `${terms.size} keywords`}`,
      detail: 'A 10×10 grid across the service area, so the result is where you rank in each part of town — not one average.',
    })
  }
  const headline = client?.rankKeywords?.[0]
  if (headline) {
    const forTerm = scans.filter(
      (s) => s.searchTerm === headline && typeof s.averageRank === 'number'
    )
    if (forTerm.length >= 2) {
      const first = forTerm[0].averageRank as number
      const latest = forTerm[forTerm.length - 1].averageRank as number
      const movement = describeMovement(first, latest, headline)
      if (movement) {
        items.push({
          at: forTerm[forTerm.length - 1].scannedAt,
          kind: 'ranking',
          title: 'Where you stand now',
          detail: movement,
        })
      }
    }
  }

  // ---- Website work.
  const photosByMonth = new Map<string, { at: Date; n: number }>()
  for (const photo of photos) {
    const key = monthKey(photo.createdAt)
    const entry = photosByMonth.get(key) || { at: photo.createdAt, n: 0 }
    entry.n++
    if (photo.createdAt > entry.at) entry.at = photo.createdAt
    photosByMonth.set(key, entry)
  }
  for (const { at, n } of photosByMonth.values()) {
    items.push({
      at,
      kind: 'photos',
      title: `${n} photo${n === 1 ? '' : 's'} added to your site`,
      detail: 'Your own work, on your own pages — the gallery and the pictures beside the text.',
    })
  }
  if (content) {
    items.push({
      at: content.updatedAt,
      kind: 'website',
      title: 'Site copy updated',
      detail: 'Warranty wording, the questions customers ask, and the story on your homepage.',
    })
  }
  for (const page of cityPages) {
    items.push({
      at: page.updatedAt,
      kind: 'website',
      title: `Page written for ${page.city}`,
      detail: 'A page about working in that city specifically, so it can rank for searches naming it.',
    })
  }
  for (const domain of domains) {
    items.push({
      at: domain.createdAt,
      kind: 'setup',
      title: `${domain.domain} connected`,
      detail: 'Your site answers on your own address.',
    })
  }

  // ---- Calls.
  for (const number of numbers) {
    items.push({
      at: number.createdAt,
      kind: 'calls',
      title: 'Call tracking switched on',
      detail: 'Calls from your ads and site are recorded and attributed, so a missed one is visible the same day.',
    })
  }
  const callsByMonth = new Map<string, { at: Date; n: number; scored: number[] }>()
  for (const call of calls) {
    const key = monthKey(call.createdAt)
    const entry = callsByMonth.get(key) || { at: call.createdAt, n: 0, scored: [] }
    entry.n++
    if (typeof call.score === 'number') entry.scored.push(call.score)
    if (call.createdAt > entry.at) entry.at = call.createdAt
    callsByMonth.set(key, entry)
  }
  for (const { at, n, scored } of callsByMonth.values()) {
    const avg = scored.length
      ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length)
      : null
    items.push({
      at,
      kind: 'calls',
      title: `${n} call${n === 1 ? '' : 's'} reviewed`,
      detail: avg === null
        ? 'Each one transcribed so what was said on the phone is on the record.'
        : `Each one transcribed and scored on how the call was handled — average ${avg} out of 100 this month.`,
    })
  }

  // ---- Leads and booked work.
  const leadsByMonth = new Map<string, { at: Date; n: number; sold: number; value: number }>()
  for (const lead of leadCounts) {
    const key = monthKey(lead.createdAt)
    const entry = leadsByMonth.get(key) || { at: lead.createdAt, n: 0, sold: 0, value: 0 }
    entry.n++
    if (lead.status === 'SOLD') {
      entry.sold++
      entry.value += lead.saleValue || 0
    }
    if (lead.createdAt > entry.at) entry.at = lead.createdAt
    leadsByMonth.set(key, entry)
  }
  for (const { at, n, sold, value } of leadsByMonth.values()) {
    items.push({
      at,
      kind: 'leads',
      title: `${n} enquir${n === 1 ? 'y' : 'ies'} delivered`,
      detail: sold
        ? `${sold} of them booked${value ? `, worth ${value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}` : ''} — reported back to Google so the ads learn which clicks turn into work.`
        : 'Sent to you by text and email the moment they came in.',
    })
  }

  // ---- Reviews.
  if (reviews) {
    items.push({
      at: reviews.fetchedAt,
      kind: 'reviews',
      title: 'Google reviews refreshed on your site',
      detail: `Showing ${reviews.rating.toFixed(1)} from ${reviews.reviewCount} review${reviews.reviewCount === 1 ? '' : 's'}, straight from your Google listing.`,
    })
  }

  // ---- The beginning, so the feed always has a floor.
  if (client) {
    items.push({
      at: client.createdAt,
      kind: 'setup',
      title: 'Your site went live',
      detail: client.siteSubdomain ? `${client.siteSubdomain}.glassleads.app` : undefined,
    })
  }

  // Newest first, grouped by month.
  items.sort((a, b) => b.at.getTime() - a.at.getTime())
  const months = new Map<string, ActivityMonth>()
  for (const item of items) {
    const key = monthKey(item.at)
    const existing = months.get(key)
    if (existing) {
      existing.items.push(item)
      continue
    }
    months.set(key, {
      month: new Date(item.at.getFullYear(), item.at.getMonth(), 1),
      label: item.at.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      items: [item],
    })
  }
  return [...months.values()]
}
