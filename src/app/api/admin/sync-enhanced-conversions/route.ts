import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendEnhancedConversion } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for bulk operations

/**
 * GET /api/admin/sync-enhanced-conversions?days=7
 *
 * Bulk sync enhanced conversions for leads from the last X days.
 * Only processes leads that:
 * - Have email or phone (user-provided data for matching)
 * - Haven't already had enhanced conversion sent
 * - Have a client with active Google Ads config
 *
 * Note: GCLID is optional. Google can match conversions using hashed
 * email/phone data even without a click ID, providing better measurement.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const days = parseInt(searchParams.get('days') || '7', 10)
  const dryRun = searchParams.get('dryRun') === 'true'

  if (days < 1 || days > 90) {
    return NextResponse.json({ error: 'Days must be between 1 and 90' }, { status: 400 })
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  try {
    // Find leads that need enhanced conversion sync
    // Note: GCLID is no longer required - we send all leads with user data
    const leads = await prisma.lead.findMany({
      where: {
        createdAt: { gte: startDate },
        enhancedConversionSent: false,
        OR: [
          { email: { not: null } },
          { phone: { not: null } },
        ],
      },
      include: {
        client: {
          include: {
            googleAdsConfig: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter to only leads with active Google Ads config and conversion action
    const eligibleLeads = leads.filter((lead) => {
      const config = lead.client.googleAdsConfig
      if (!config?.isActive) return false

      const conversionActionId = lead.source === 'PHONE'
        ? config.callConversionActionId
        : config.formConversionActionId

      return !!conversionActionId
    })

    if (dryRun) {
      // Just return what would be synced
      return NextResponse.json({
        dryRun: true,
        message: `Would sync ${eligibleLeads.length} leads from the last ${days} days`,
        totalFound: leads.length,
        eligible: eligibleLeads.length,
        excluded: leads.length - eligibleLeads.length,
        leads: eligibleLeads.map((l) => ({
          id: l.id,
          name: [l.firstName, l.lastName].filter(Boolean).join(' ') || 'Unknown',
          email: l.email,
          phone: l.phone,
          hasGclid: !!l.gclid,
          client: l.client.businessName,
          source: l.source,
          createdAt: l.createdAt,
        })),
      })
    }

    // Process each lead
    const results = {
      total: eligibleLeads.length,
      success: 0,
      failed: 0,
      errors: [] as Array<{ leadId: string; error: string }>,
    }

    for (const lead of eligibleLeads) {
      const config = lead.client.googleAdsConfig!
      const conversionActionId = lead.source === 'PHONE'
        ? config.callConversionActionId!
        : config.formConversionActionId!

      try {
        const result = await sendEnhancedConversion({
          customerId: config.customerId,
          gclid: lead.gclid || undefined, // Optional - will be included if present
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          conversionAction: conversionActionId,
          conversionDateTime: lead.createdAt,
          orderId: lead.id,
        })

        if (result.success) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              enhancedConversionSent: true,
              enhancedConversionSentAt: new Date(),
              googleSyncError: null,
            },
          })
          results.success++
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              googleSyncError: `Bulk sync failed: ${result.error}`,
            },
          })
          results.failed++
          results.errors.push({ leadId: lead.id, error: result.error || 'Unknown error' })
        }
      } catch (error) {
        results.failed++
        results.errors.push({
          leadId: lead.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return NextResponse.json({
      message: `Synced ${results.success} of ${results.total} leads from the last ${days} days`,
      ...results,
    })
  } catch (error) {
    console.error('[Bulk Sync] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
