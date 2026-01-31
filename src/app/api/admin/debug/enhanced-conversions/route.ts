import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/debug/enhanced-conversions
 *
 * Shows recent leads and their enhanced conversion status.
 * Query params:
 *   - clientId: Filter by client (optional)
 *   - limit: Number of leads to show (default 20)
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  try {
    // Get recent leads with their client's Google Ads config
    const leads = await prisma.lead.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            googleAdsConfig: true,
          },
        },
      },
    })

    const results = leads.map((lead) => {
      const googleAdsConfig = lead.client.googleAdsConfig

      // Determine which conversion action would be used
      const conversionActionId = lead.source === 'PHONE'
        ? googleAdsConfig?.callConversionActionId
        : googleAdsConfig?.formConversionActionId

      return {
        leadId: lead.id,
        createdAt: lead.createdAt,
        client: lead.client.businessName,
        source: lead.source,
        hasEmail: !!lead.email,
        hasPhone: !!lead.phone,
        hasGclid: !!lead.gclid,

        // Enhanced conversion status
        enhancedConversion: {
          sent: lead.enhancedConversionSent,
          sentAt: lead.enhancedConversionSentAt,
          error: lead.googleSyncError,
        },

        // Offline conversion status (for sales)
        offlineConversion: {
          sent: lead.offlineConversionSent,
          sentAt: lead.offlineConversionSentAt,
          saleValue: lead.saleValue,
          saleDate: lead.saleDate,
        },

        // Google Ads config status
        googleAdsConfig: googleAdsConfig ? {
          isActive: googleAdsConfig.isActive,
          customerId: googleAdsConfig.customerId,
          formConversionActionId: googleAdsConfig.formConversionActionId,
          callConversionActionId: googleAdsConfig.callConversionActionId,
          saleConversionActionId: googleAdsConfig.saleConversionActionId,
          conversionActionUsed: conversionActionId || 'NONE - not configured for this source',
        } : null,

        // Why enhanced conversion might not have been sent
        notSentReason: !lead.enhancedConversionSent ? getNotSentReason(lead, googleAdsConfig, conversionActionId) : null,
      }
    })

    // Summary stats
    const stats = {
      total: leads.length,
      withGclid: leads.filter(l => l.gclid).length,
      withEmail: leads.filter(l => l.email).length,
      withPhone: leads.filter(l => l.phone).length,
      enhancedConversionSent: leads.filter(l => l.enhancedConversionSent).length,
      offlineConversionSent: leads.filter(l => l.offlineConversionSent).length,
      withErrors: leads.filter(l => l.googleSyncError).length,
    }

    return NextResponse.json({
      stats,
      leads: results,
    })
  } catch (error) {
    console.error('Debug enhanced conversions error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

function getNotSentReason(
  lead: { gclid: string | null; email: string | null; phone: string | null; source: string },
  googleAdsConfig: { isActive: boolean; formConversionActionId: string | null; callConversionActionId: string | null } | null,
  conversionActionId: string | null | undefined
): string {
  if (!lead.gclid) {
    return 'No GCLID - lead did not come from a Google Ads click'
  }
  if (!lead.email && !lead.phone) {
    return 'No email or phone to send'
  }
  if (!googleAdsConfig) {
    return 'Client has no Google Ads config'
  }
  if (!googleAdsConfig.isActive) {
    return 'Google Ads config is not active'
  }
  if (!conversionActionId) {
    return lead.source === 'PHONE'
      ? 'No callConversionActionId configured'
      : 'No formConversionActionId configured'
  }
  return 'Unknown - should have been sent'
}
