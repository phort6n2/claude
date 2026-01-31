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

    const debug: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      config: {
        mccCustomerId: creds?.mccCustomerId || 'NOT SET',
        hasDeveloperToken: !!creds?.developerToken,
        developerTokenLength: creds?.developerToken?.length || 0,
        // Show first/last few chars to verify token format (not exposing full token)
        developerTokenPreview: creds?.developerToken
          ? `${creds.developerToken.substring(0, 4)}...${creds.developerToken.substring(creds.developerToken.length - 4)}`
          : 'NOT SET',
        hasAccessToken: !!accessToken,
        accessTokenLength: accessToken?.length || 0,
        hasRefreshToken: !!creds?.refreshToken,
      },
      clientAccounts: clientConfigs.map(c => ({
        clientName: c.client.businessName,
        customerId: c.customerId,
        isActive: c.isActive,
      })),
    }

    // Test API access by listing accessible customers
    if (accessToken && creds?.developerToken) {
      const result = await listAccessibleCustomers()
      debug.apiTest = {
        success: result.success,
        customers: result.customers?.map(c => c.customerId),
        error: result.error,
      }

      // If the standard test fails, try a raw fetch to see exactly what happens
      if (!result.success) {
        const testUrl = 'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers'
        try {
          const rawResponse = await fetch(testUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': creds.developerToken,
            },
          })
          debug.rawApiTest = {
            url: testUrl,
            status: rawResponse.status,
            statusText: rawResponse.statusText,
            contentType: rawResponse.headers.get('content-type'),
            // Check if this is an HTML response or JSON
            responseType: rawResponse.headers.get('content-type')?.includes('html') ? 'HTML' : 'JSON',
          }
        } catch (fetchError) {
          debug.rawApiTest = {
            error: fetchError instanceof Error ? fetchError.message : 'Fetch failed',
          }
        }
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
