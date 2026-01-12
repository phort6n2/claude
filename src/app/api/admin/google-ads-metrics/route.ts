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

    // Fetch metrics for each account in parallel
    const accountResults = await Promise.all(
      clientGoogleAds.map(async (config) => {
        try {
          const [metricsResult, detailsResult] = await Promise.all([
            getAccountMetrics(config.customerId, dateRange),
            getCustomerDetails(config.customerId),
          ])

          return {
            clientId: config.clientId,
            clientName: config.client.businessName,
            clientSlug: config.client.slug,
            customerId: config.customerId,
            accountName: detailsResult.success
              ? detailsResult.details?.descriptiveName
              : config.customerId,
            metrics: metricsResult.success ? metricsResult.metrics : null,
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
        return acc
      },
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }
    )

    // Calculate aggregate rates
    const totals = {
      ...sums,
      costPerConversion: sums.conversions > 0 ? sums.cost / sums.conversions : 0,
      ctr: sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : 0,
      avgCpc: sums.clicks > 0 ? sums.cost / sums.clicks : 0,
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

    return NextResponse.json({ campaigns: result.campaigns })
  } catch (error) {
    console.error('Failed to fetch campaign metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch campaign metrics' },
      { status: 500 }
    )
  }
}
