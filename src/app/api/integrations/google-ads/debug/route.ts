import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  getGoogleAdsCredentials,
  getValidAccessToken,
  listAccessibleCustomers
} from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/google-ads/debug
 * Debug Google Ads connection - tests API access without querying specific accounts
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get current configuration
    const creds = await getGoogleAdsCredentials()
    const accessToken = await getValidAccessToken()

    // Get client account configurations
    const clientConfigs = await prisma.clientGoogleAds.findMany({
      include: {
        client: {
          select: { businessName: true }
        }
      }
    })

    const debug = {
      timestamp: new Date().toISOString(),
      config: {
        mccCustomerId: creds?.mccCustomerId || 'NOT SET',
        hasDeveloperToken: !!creds?.developerToken,
        developerTokenLength: creds?.developerToken?.length || 0,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!creds?.refreshToken,
      },
      clientAccounts: clientConfigs.map(c => ({
        clientName: c.client.businessName,
        customerId: c.customerId,
        isActive: c.isActive,
      })),
      apiTest: null as { success: boolean; customers?: string[]; error?: string } | null,
    }

    // Test API access by listing accessible customers
    if (accessToken && creds?.developerToken) {
      const result = await listAccessibleCustomers()
      debug.apiTest = {
        success: result.success,
        customers: result.customers?.map(c => c.customerId),
        error: result.error,
      }
    } else {
      debug.apiTest = {
        success: false,
        error: 'Missing access token or developer token',
      }
    }

    return NextResponse.json(debug)
  } catch (error) {
    console.error('Google Ads debug error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
