import { NextRequest, NextResponse } from 'next/server'
import { prisma, withRetry } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/admin/clients-dashboard[?days=30]
 *
 * Per-client lead/sales/coaching metrics across all clients, plus a top-line
 * roll-up. Powers /master-leads/dashboard. Filters use the (clientId-filtered)
 * default leads query, so duplicate-marked Leads are excluded — daily/period
 * counts match what shows in the leads list.
 */
type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'QUOTED' | 'SOLD' | 'LOST'
const TERMINAL_STATUSES = new Set<LeadStatus>(['SOLD', 'LOST', 'QUOTED', 'UNQUALIFIED'])

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10) || 30))
  const now = Date.now()
  const since = new Date(now - days * 24 * 60 * 60 * 1000)
  const priorSince = new Date(now - days * 2 * 24 * 60 * 60 * 1000)
  const priorEnd = since

  const [clients, leadsInWindow, leadsInPrior, callAnalyses, lastLeadByClient] =
    await withRetry(() =>
      Promise.all([
        prisma.client.findMany({
          select: {
            id: true,
            businessName: true,
            slug: true,
            status: true,
            callCoachingEnabled: true,
          },
          orderBy: { businessName: 'asc' },
        }),
        prisma.lead.findMany({
          where: {
            createdAt: { gte: since },
            duplicateOfLeadId: null,
          },
          select: {
            id: true,
            clientId: true,
            source: true,
            status: true,
            saleValue: true,
          },
        }),
        prisma.lead.groupBy({
          by: ['clientId'],
          where: {
            createdAt: { gte: priorSince, lt: priorEnd },
            duplicateOfLeadId: null,
          },
          _count: { _all: true },
        }),
        prisma.callAnalysis.findMany({
          where: {
            status: 'COMPLETE',
            completedAt: { gte: since },
            score: { not: null },
          },
          select: { clientId: true, score: true },
        }),
        prisma.lead.groupBy({
          by: ['clientId'],
          where: { duplicateOfLeadId: null },
          _max: { createdAt: true },
        }),
      ])
    )

  const priorByClient = new Map(leadsInPrior.map((r) => [r.clientId, r._count._all]))
  const lastLeadAtByClient = new Map(
    lastLeadByClient.map((r) => [r.clientId, r._max.createdAt])
  )

  // Build per-client aggregates from the in-window leads we already pulled.
  interface ClientAgg {
    leads: number
    calls: number
    forms: number
    decided: number
    sold: number
    revenue: number
    scoreSum: number
    scoreCount: number
  }
  const agg = new Map<string, ClientAgg>()
  function ensure(clientId: string): ClientAgg {
    let a = agg.get(clientId)
    if (!a) {
      a = { leads: 0, calls: 0, forms: 0, decided: 0, sold: 0, revenue: 0, scoreSum: 0, scoreCount: 0 }
      agg.set(clientId, a)
    }
    return a
  }

  for (const l of leadsInWindow) {
    const a = ensure(l.clientId)
    a.leads += 1
    if (l.source === 'PHONE') a.calls += 1
    else if (l.source === 'FORM') a.forms += 1
    if (TERMINAL_STATUSES.has(l.status as LeadStatus)) {
      a.decided += 1
      if (l.status === 'SOLD') {
        a.sold += 1
        a.revenue += l.saleValue ?? 0
      }
    }
  }
  for (const ca of callAnalyses) {
    const a = ensure(ca.clientId)
    if (typeof ca.score === 'number') {
      a.scoreSum += ca.score
      a.scoreCount += 1
    }
  }

  // Roll up top-line totals.
  let totalLeads = 0
  let totalSales = 0
  let totalRevenue = 0
  let activeClients = 0
  for (const a of agg.values()) {
    totalLeads += a.leads
    totalSales += a.sold
    totalRevenue += a.revenue
    if (a.leads > 0) activeClients += 1
  }

  // Combine with the clients list (so clients with zero in-window leads still
  // appear in the table, sorted to the bottom).
  const rows = clients.map((c) => {
    const a = agg.get(c.id) ?? {
      leads: 0,
      calls: 0,
      forms: 0,
      decided: 0,
      sold: 0,
      revenue: 0,
      scoreSum: 0,
      scoreCount: 0,
    }
    const priorLeads = priorByClient.get(c.id) ?? 0
    const deltaPct =
      priorLeads === 0
        ? a.leads > 0
          ? null // new activity, no baseline
          : 0
        : Math.round(((a.leads - priorLeads) / priorLeads) * 100)
    return {
      clientId: c.id,
      businessName: c.businessName,
      slug: c.slug,
      status: c.status,
      callCoachingEnabled: c.callCoachingEnabled,
      leads: a.leads,
      priorLeads,
      deltaPct,
      calls: a.calls,
      forms: a.forms,
      decided: a.decided,
      sold: a.sold,
      pctSold: a.decided > 0 ? Math.round((a.sold / a.decided) * 100) : null,
      revenue: a.revenue,
      avgCoachingScore:
        a.scoreCount > 0 ? Math.round(a.scoreSum / a.scoreCount) : null,
      lastLeadAt: lastLeadAtByClient.get(c.id) ?? null,
    }
  })

  return NextResponse.json({
    rangeDays: days,
    sinceIso: since.toISOString(),
    totals: {
      totalLeads,
      totalSales,
      totalRevenue,
      activeClients,
      totalClients: clients.length,
    },
    rows,
  })
}
