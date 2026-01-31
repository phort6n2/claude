import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import {
  getAccountMetrics,
  getCampaignMetrics,
  getCustomerDetails,
  getGoogleAdsCredentials,
} from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

type DateRange = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_7_DAYS' | 'LAST_30_DAYS'

// Helper to get date range for database queries
function getDateRangeFilter(dateRange: DateRange): { gte: Date; lte: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  switch (dateRange) {
    case 'TODAY':
      return { gte: today, lte: tomorrow }
    case 'YESTERDAY': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { gte: yesterday, lte: today }
    }
    case 'THIS_WEEK': {
      const startOfWeek = new Date(today)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      return { gte: startOfWeek, lte: tomorrow }
    }
    case 'THIS_MONTH': {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return { gte: startOfMonth, lte: tomorrow }
    }
    case 'LAST_7_DAYS': {
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      return { gte: sevenDaysAgo, lte: tomorrow }
    }
    case 'LAST_30_DAYS': {
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return { gte: thirtyDaysAgo, lte: tomorrow }
    }
    default:
      return { gte: today, lte: tomorrow }
  }
}

/**
 * GET /api/admin/google-ads-metrics - Get Google Ads performance metrics
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateRange = (searchParams.get('dateRange') || 'TODAY') as DateRange
  const clientId = searchParams.get('clientId') // Optional: filter to specific client

  try {
    // Check if Google Ads is connected
    const creds = await getGoogleAdsCredentials()
    if (!creds?.accessToken) {
      return NextResponse.json({
        connected: false,
        error: 'Google Ads not connected',
      })
    }

    // Get all clients with Google Ads configured
    const where = clientId ? { clientId } : { isActive: true }
    const clientGoogleAds = await prisma.clientGoogleAds.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            slug: true,
          },
        },
      },
    })

    if (clientGoogleAds.length === 0) {
      return NextResponse.json({
        connected: true,
        accounts: [],
        totals: {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          costPerConversion: 0,
        },
      })
    }

    // Get date range for sales queries
    const dateFilter = getDateRangeFilter(dateRange)

    // Fetch metrics for each account in parallel
    const accountResults = await Promise.all(
      clientGoogleAds.map(async (config) => {
        try {
          const [metricsResult, detailsResult, salesData] = await Promise.all([
            getAccountMetrics(config.customerId, dateRange),
            getCustomerDetails(config.customerId),
            // Get sales data for this client within date range
            prisma.lead.aggregate({
              where: {
                clientId: config.clientId,
                status: 'SOLD',
                saleDate: dateFilter,
              },
              _sum: {
                saleValue: true,
              },
              _count: {
                id: true,
              },
            }),
          ])

          // Also get total leads for the period
          const leadsCount = await prisma.lead.count({
            where: {
              clientId: config.clientId,
              createdAt: dateFilter,
            },
          })

          return {
            clientId: config.clientId,
            clientName: config.client.businessName,
            clientSlug: config.client.slug,
            customerId: config.customerId,
            accountName: detailsResult.success
              ? detailsResult.details?.descriptiveName
              : config.customerId,
            metrics: metricsResult.success ? metricsResult.metrics : null,
            sales: {
              count: salesData._count.id,
              value: salesData._sum.saleValue || 0,
            },
            leads: leadsCount,
            error: metricsResult.success ? null : metricsResult.error,
          }
        } catch (error) {
          return {
            clientId: config.clientId,
            clientName: config.client.businessName,
            clientSlug: config.client.slug,
            customerId: config.customerId,
            accountName: config.customerId,
            metrics: null,
            sales: { count: 0, value: 0 },
            leads: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })
    )

    // Calculate totals
    const sums = accountResults.reduce(
      (acc, account) => {
        if (account.metrics) {
          acc.impressions += account.metrics.impressions
          acc.clicks += account.metrics.clicks
          acc.cost += account.metrics.cost
          acc.conversions += account.metrics.conversions
          acc.conversionValue += account.metrics.conversionValue
        }
        acc.salesCount += account.sales?.count || 0
        acc.salesValue += account.sales?.value || 0
        acc.leadsCount += account.leads || 0
        return acc
      },
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0, salesCount: 0, salesValue: 0, leadsCount: 0 }
    )

    // Calculate aggregate rates
    const totals = {
      ...sums,
      costPerConversion: sums.conversions > 0 ? sums.cost / sums.conversions : 0,
      ctr: sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : 0,
      avgCpc: sums.clicks > 0 ? sums.cost / sums.clicks : 0,
      costPerLead: sums.leadsCount > 0 ? sums.cost / sums.leadsCount : 0,
      roas: sums.cost > 0 ? sums.salesValue / sums.cost : 0,
    }

    return NextResponse.json({
      connected: true,
      dateRange,
      accounts: accountResults,
      totals,
    })
  } catch (error) {
    console.error('Failed to fetch Google Ads metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/google-ads-metrics/campaigns?customerId=xxx
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { customerId, dateRange = 'LAST_7_DAYS' } = body

    if (!customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 })
    }

    const result = await getCampaignMetrics(customerId, dateRange)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Filter to only show campaigns with spend > 0
    const campaignsWithSpend = (result.campaigns || []).filter(c => c.cost > 0)

    return NextResponse.json({ campaigns: campaignsWithSpend })
  } catch (error) {
    console.error('Failed to fetch campaign metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch campaign metrics' },
      { status: 500 }
    )
  }
}
