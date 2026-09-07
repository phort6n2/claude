import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  analyticsConnected,
  refreshSiteAnalytics,
  rangeFrom,
  DEFAULT_RANGE,
  type RangeKey,
} from '@/lib/site-analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/sync-site-analytics (nightly)
 *
 * Refreshes every connected client's Analytics and Search Console snapshot so
 * the first person to open the portal in the morning gets a page rather than a
 * spinner.
 *
 * NOT LOAD-BEARING, unlike the Clarity job next door. Clarity's window closes
 * after three days and a day not copied is gone at any price; these two APIs
 * answer for history whenever asked, so the worst a missed run costs is a
 * slower page load. That is why this is allowed to fail quietly per client and
 * carry on, rather than being retried.
 *
 * SEQUENTIAL, ON PURPOSE. Fifteen clients times four Search Console queries
 * and three GA4 reports, fired at once, is how a quota gets spent in a second
 * and every shop's page goes blank together.
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

  if (!(await analyticsConnected())) {
    return NextResponse.json({ skipped: 'Google Analytics is not connected' })
  }

  const clients = await prisma.client
    .findMany({
      where: {
        // A paused shop keeps its history: pausing stops the site, not the
        // record of what it did, and the numbers are wanted the day it
        // comes back.
        OR: [{ ga4PropertyId: { not: null } }, { searchConsoleSiteUrl: { not: null } }],
      },
      select: { id: true, businessName: true },
    })
    .catch(() => [])

  let refreshed = 0
  const failures: string[] = []
  for (const client of clients) {
    /* WARM WHAT THIS SHOP ACTUALLY OPENS, not only the default.
       The job existed so the first person in each morning gets a page rather
       than a spinner, and then refreshed the 90-day window alone — so anyone
       who had picked "Last 12 months" still paid a cold eleven-call fetch
       inside their page render. Existing rows name the ranges someone chose;
       a range nobody has opened is still not fetched. */
    const ranges = await prisma.siteTrafficSnapshot
      .findMany({ where: { clientId: client.id }, select: { range: true } })
      .catch(() => [])
    const wanted = new Set<RangeKey>([DEFAULT_RANGE, ...ranges.map((r) => rangeFrom(r.range))])
    for (const range of wanted) {
    const result = await refreshSiteAnalytics(client.id, range).catch((err) => ({
      traffic: null,
      search: null,
      fetchedAt: null,
      error: err instanceof Error ? err.message : 'failed',
    }))
    if (result.error) failures.push(`${client.businessName} (${range}): ${result.error}`)
    if (result.traffic || result.search) refreshed += 1
    }
  }

  console.log(
    `[Site analytics] nightly sync: ${refreshed}/${clients.length} refreshed` +
      (failures.length ? ` · ${failures.length} failed` : '')
  )
  return NextResponse.json({ clients: clients.length, refreshed, failures })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
