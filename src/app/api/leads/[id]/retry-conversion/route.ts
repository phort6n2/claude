import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendEnhancedConversion } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/leads/[id]/retry-conversion
 *
 * Retry sending enhanced conversion for a lead.
 * Requires the lead to have a GCLID and either email or phone.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Get the lead with client's Google Ads config
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            googleAdsConfig: true,
          },
        },
      },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Check requirements
    if (!lead.gclid) {
      return NextResponse.json({
        error: 'Cannot send enhanced conversion: Lead has no GCLID',
      }, { status: 400 })
    }

    if (!lead.email && !lead.phone) {
      return NextResponse.json({
        error: 'Cannot send enhanced conversion: Lead has no email or phone',
      }, { status: 400 })
    }

    const googleAdsConfig = lead.client.googleAdsConfig
    if (!googleAdsConfig) {
      return NextResponse.json({
        error: 'Cannot send enhanced conversion: Client has no Google Ads config',
      }, { status: 400 })
    }

    if (!googleAdsConfig.isActive) {
      return NextResponse.json({
        error: 'Cannot send enhanced conversion: Google Ads config is not active',
      }, { status: 400 })
    }

    // Determine which conversion action to use based on lead source
    const conversionActionId = lead.source === 'PHONE'
      ? googleAdsConfig.callConversionActionId
      : googleAdsConfig.formConversionActionId

    if (!conversionActionId) {
      const actionType = lead.source === 'PHONE' ? 'callConversionActionId' : 'formConversionActionId'
      return NextResponse.json({
        error: `Cannot send enhanced conversion: No ${actionType} configured for this client`,
      }, { status: 400 })
    }

    // Send the enhanced conversion
    console.log(`[Retry Conversion] Sending enhanced conversion for lead ${id}`, {
      customerId: googleAdsConfig.customerId,
      gclid: lead.gclid,
      hasEmail: !!lead.email,
      hasPhone: !!lead.phone,
      conversionActionId,
      leadSource: lead.source,
    })

    const result = await sendEnhancedConversion({
      customerId: googleAdsConfig.customerId,
      gclid: lead.gclid,
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      conversionAction: conversionActionId,
      conversionDateTime: lead.createdAt, // Use original lead creation time
    })

    if (result.success) {
      // Update the lead record
      await prisma.lead.update({
        where: { id },
        data: {
          enhancedConversionSent: true,
          enhancedConversionSentAt: new Date(),
          googleSyncError: null,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Enhanced conversion sent successfully',
      })
    } else {
      // Update with error
      await prisma.lead.update({
        where: { id },
        data: {
          googleSyncError: `Retry failed: ${result.error}`,
        },
      })

      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send enhanced conversion',
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[Retry Conversion] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
