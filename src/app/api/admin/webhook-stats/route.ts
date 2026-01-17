import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/webhook-stats - Get webhook and conversion statistics
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get date ranges
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thisWeek = new Date(today)
    thisWeek.setDate(thisWeek.getDate() - 7)
    const thisMonth = new Date(today)
    thisMonth.setDate(thisMonth.getDate() - 30)

    // Get overall stats
    const [
      totalLeads,
      leadsWithGclid,
      leadsToday,
      leadsThisWeek,
      enhancedConversionsSent,
      offlineConversionsSent,
      leadsWithSyncErrors,
      leadsBySource,
      leadsByClient,
      recentLeads,
      failedConversions,
    ] = await Promise.all([
      // Total leads
      prisma.lead.count(),

      // Leads with GCLID
      prisma.lead.count({ where: { gclid: { not: null } } }),

      // Leads today
      prisma.lead.count({ where: { createdAt: { gte: today } } }),

      // Leads this week
      prisma.lead.count({ where: { createdAt: { gte: thisWeek } } }),

      // Enhanced conversions sent
      prisma.lead.count({ where: { enhancedConversionSent: true } }),

      // Offline conversions sent
      prisma.lead.count({ where: { offlineConversionSent: true } }),

      // Leads with sync errors
      prisma.lead.count({ where: { googleSyncError: { not: null } } }),

      // Leads by source
      prisma.lead.groupBy({
        by: ['source'],
        _count: true,
      }),

      // Leads by client (top 10)
      prisma.lead.groupBy({
        by: ['clientId'],
        _count: true,
        orderBy: { _count: { clientId: 'desc' } },
        take: 10,
      }),

      // Recent leads (last 10)
      prisma.lead.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          source: true,
          gclid: true,
          enhancedConversionSent: true,
          offlineConversionSent: true,
          googleSyncError: true,
          createdAt: true,
          client: {
            select: { businessName: true },
          },
        },
      }),

      // Failed conversions (leads with errors)
      prisma.lead.findMany({
        where: { googleSyncError: { not: null } },
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          gclid: true,
          googleSyncError: true,
          createdAt: true,
          client: {
            select: { businessName: true },
          },
        },
      }),
    ])

    // Get client names for the by-client stats
    const clientIds = leadsByClient.map((c) => c.clientId)
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, businessName: true },
    })
    const clientMap = new Map(clients.map((c) => [c.id, c.businessName]))

    // Calculate rates
    const gclidCaptureRate = totalLeads > 0 ? ((leadsWithGclid / totalLeads) * 100).toFixed(1) : '0'
    const enhancedConversionRate = leadsWithGclid > 0 ? ((enhancedConversionsSent / leadsWithGclid) * 100).toFixed(1) : '0'

    return NextResponse.json({
      summary: {
        totalLeads,
        leadsWithGclid,
        gclidCaptureRate: `${gclidCaptureRate}%`,
        leadsToday,
        leadsThisWeek,
        enhancedConversionsSent,
        enhancedConversionRate: `${enhancedConversionRate}%`,
        offlineConversionsSent,
        leadsWithSyncErrors,
      },
      bySource: leadsBySource.map((s) => ({
        source: s.source,
        count: s._count,
      })),
      byClient: leadsByClient.map((c) => ({
        clientId: c.clientId,
        clientName: clientMap.get(c.clientId) || 'Unknown',
        count: c._count,
      })),
      recentLeads,
      failedConversions,
    })
  } catch (error) {
    console.error('Failed to fetch webhook stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
