import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEnhancedConversion } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for bulk operations

/**
 * GET /api/admin/bulk-sync-conversions?days=30
 *
 * Sends ALL leads with email/phone to Google Ads Enhanced Conversions,
 * including those without GCLID. Google can match users via hashed
 * email/phone data even without a click ID.
 *
 * Query params:
 * - days: Number of days to look back (default 30, max 90) — ignored if leadIds provided
 * - leadIds: Comma-separated lead IDs to sync (overrides days). Max 100 per call for batching.
 * - dryRun: Set to "true" to see what would be synced without actually syncing
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const days = parseInt(searchParams.get('days') || '30', 10)
  const dryRun = searchParams.get('dryRun') === 'true'
  const leadIdsParam = searchParams.get('leadIds')

  const leadIds = leadIdsParam
    ? leadIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null

  if (leadIds && leadIds.length > 100) {
    return NextResponse.json({ error: 'leadIds limited to 100 per batch' }, { status: 400 })
  }

  if (!leadIds && (days < 1 || days > 90)) {
    return NextResponse.json({ error: 'Days must be between 1 and 90' }, { status: 400 })
  }

  try {
    // Build where clause: either explicit IDs (batched mode) or date-range fallback
    const where = leadIds
      ? {
          id: { in: leadIds },
          enhancedConversionSent: false,
          OR: [{ email: { not: null } }, { phone: { not: null } }],
        }
      : (() => {
          const startDate = new Date()
          startDate.setDate(startDate.getDate() - days)
          return {
            createdAt: { gte: startDate },
            enhancedConversionSent: false,
            OR: [{ email: { not: null } }, { phone: { not: null } }],
          }
        })()

    const leads = await prisma.lead.findMany({
      where,
      include: {
        client: {
          include: {
            googleAdsConfig: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter to only leads with active Google Ads config
    const eligibleLeads = leads.filter((lead) => {
      const config = lead.client.googleAdsConfig
      if (!config?.isActive) return false

      const conversionActionId = lead.source === 'PHONE'
        ? config.callConversionActionId
        : config.formConversionActionId

      return !!conversionActionId
    })

    // Count leads with/without GCLID
    const withGclid = eligibleLeads.filter(l => l.gclid).length
    const withoutGclid = eligibleLeads.length - withGclid

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        message: `Would sync ${eligibleLeads.length} leads from the last ${days} days`,
        summary: {
          totalFound: leads.length,
          eligible: eligibleLeads.length,
          withGclid,
          withoutGclid,
          excluded: leads.length - eligibleLeads.length,
        },
        leads: eligibleLeads.slice(0, 50).map((l) => ({
          id: l.id,
          name: [l.firstName, l.lastName].filter(Boolean).join(' ') || 'Unknown',
          email: l.email ? `${l.email.substring(0, 3)}***` : null,
          phone: l.phone ? `***${l.phone.slice(-4)}` : null,
          hasGclid: !!l.gclid,
          client: l.client.businessName,
          source: l.source,
          createdAt: l.createdAt,
        })),
        note: eligibleLeads.length > 50 ? `Showing first 50 of ${eligibleLeads.length} leads` : undefined,
      })
    }

    // Process each lead
    const results = {
      total: eligibleLeads.length,
      success: 0,
      failed: 0,
      withGclid: { success: 0, failed: 0 },
      withoutGclid: { success: 0, failed: 0 },
      errors: [] as Array<{ leadId: string; error: string }>,
    }

    for (const lead of eligibleLeads) {
      const config = lead.client.googleAdsConfig!
      const conversionActionId = lead.source === 'PHONE'
        ? config.callConversionActionId!
        : config.formConversionActionId!

      const hasGclid = !!lead.gclid

      try {
        const result = await sendEnhancedConversion({
          customerId: config.customerId,
          gclid: lead.gclid || undefined,
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
          if (hasGclid) {
            results.withGclid.success++
          } else {
            results.withoutGclid.success++
          }
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              googleSyncError: `Bulk sync failed: ${result.error}`,
            },
          })
          results.failed++
          if (hasGclid) {
            results.withGclid.failed++
          } else {
            results.withoutGclid.failed++
          }
          results.errors.push({ leadId: lead.id, error: result.error || 'Unknown error' })
        }
      } catch (error) {
        results.failed++
        if (hasGclid) {
          results.withGclid.failed++
        } else {
          results.withoutGclid.failed++
        }
        results.errors.push({
          leadId: lead.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${results.success} of ${results.total} leads from the last ${days} days`,
      results: {
        total: results.total,
        success: results.success,
        failed: results.failed,
        withGclid: results.withGclid,
        withoutGclid: results.withoutGclid,
      },
      errors: results.errors.length > 0 ? results.errors.slice(0, 10) : undefined,
      note: results.errors.length > 10 ? `Showing first 10 of ${results.errors.length} errors` : undefined,
    })
  } catch (error) {
    console.error('[Bulk Sync] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
