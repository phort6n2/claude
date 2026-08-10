import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { canonicalHostFor } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

/**
 * Every client's conversion setup, on one screen.
 *
 * Deliberately DB-only and fast. Actually proving a tag is on a page means
 * fetching fifteen live sites, and asking Google means fifteen more round
 * trips — do that on page load and the screen takes half a minute and times
 * out on Vercel. So this returns what the database already knows, instantly,
 * and the live checks are fired per row from the browser afterwards.
 *
 * The tier is not stored anywhere and does not need to be: an account is
 * under the manager account exactly when we run its ads.
 */

export interface HealthRow {
  id: string
  businessName: string
  slug: string
  status: string
  host: string
  /** We run their ads — their Ads account sits under our manager account. */
  managed: boolean
  conversionId: string | null
  hasLeadConversion: boolean
  hasCallConversion: boolean
  bingTagId: string | null
  /** Leads in the last 30 days — the upsell signal for a self-serve client. */
  leads30d: number
  lastLeadAt: string | null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const since = new Date(Date.now() - 30 * 86400000)

  // Every client, including paused ones — a paused site serves nothing, and
  // that is exactly the sort of thing this screen should show rather than
  // filter away.
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      businessName: true,
      slug: true,
      siteSubdomain: true,
      status: true,
      domains: {
        where: { isPrimary: true },
        select: { domain: true, verified: true, misconfigured: true },
        take: 1,
      },
    },
    orderBy: { businessName: 'asc' },
  })

  // Two grouped queries rather than a query per client: fifteen clients is
  // nothing today, but a per-client loop here is the thing that quietly stops
  // working at sixty.
  const [tracking, leadCounts, lastLeads] = await Promise.all([
    prisma.clientAdsTracking.findMany().catch(() => []),
    prisma.lead
      .groupBy({ by: ['clientId'], where: { createdAt: { gte: since } }, _count: true })
      .catch(() => [] as Array<{ clientId: string; _count: number }>),
    prisma.lead
      .groupBy({ by: ['clientId'], _max: { createdAt: true } })
      .catch(() => [] as Array<{ clientId: string; _max: { createdAt: Date | null } }>),
  ])

  const trackingBy = new Map(tracking.map((t) => [t.clientId, t]))
  const countBy = new Map(leadCounts.map((l) => [l.clientId, l._count]))
  const lastBy = new Map(lastLeads.map((l) => [l.clientId, l._max.createdAt]))

  const rows: HealthRow[] = clients.map((client) => {
    const t = trackingBy.get(client.id)
    return {
      id: client.id,
      businessName: client.businessName,
      slug: client.slug,
      status: client.status,
      host: canonicalHostFor(client),
      managed: !!t?.googleAdsCustomerId,
      conversionId: t?.conversionId || null,
      hasLeadConversion: !!t?.leadConversionLabel,
      hasCallConversion: !!(t?.callConversionLabel && t?.callPhoneNumber),
      bingTagId: t?.bingUetTagId || null,
      leads30d: countBy.get(client.id) ?? 0,
      lastLeadAt: lastBy.get(client.id)?.toISOString() ?? null,
    }
  })

  return NextResponse.json({ rows })
}
