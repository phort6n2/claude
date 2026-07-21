import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEnhancedConversion } from '@/lib/google-ads'
import { eligibleLeadWhere } from '@/lib/conversion-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

// How far back to look when picking up unsynced leads
const LOOKBACK_DAYS = 30
// Max leads to process per cron run (keeps run time bounded)
const BATCH_LIMIT = 100

/**
 * GET /api/cron/sync-enhanced-conversions
 *
 * Runs on a schedule (every 2 hours, see vercel.json). Picks up leads
 * from the last LOOKBACK_DAYS that haven't been synced to Google Ads
 * yet and sends them as Enhanced Conversions. Processes up to
 * BATCH_LIMIT per run so a backlog drains steadily without any single
 * run hitting the function timeout.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const leads = await prisma.lead.findMany({
      // Eligibility (age gate + permanent-error skip) is centralized so the
      // cron, manual bulk-sync, and the unsynced list stay in agreement.
      where: eligibleLeadWhere(LOOKBACK_DAYS),
      include: {
        client: {
          include: { googleAdsConfig: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_LIMIT,
    })

    const eligibleLeads = leads.filter((lead) => {
      const config = lead.client.googleAdsConfig
      if (!config?.isActive) return false
      const conversionActionId =
        lead.source === 'PHONE'
          ? config.callConversionActionId
          : config.formConversionActionId
      return !!conversionActionId
    })

    const results = {
      total: eligibleLeads.length,
      success: 0,
      failed: 0,
      skipped: leads.length - eligibleLeads.length,
    }

    for (const lead of eligibleLeads) {
      const config = lead.client.googleAdsConfig!
      const conversionActionId =
        lead.source === 'PHONE'
          ? config.callConversionActionId!
          : config.formConversionActionId!

      try {
        const result = await sendEnhancedConversion({
          customerId: config.customerId,
          gclid: lead.gclid || undefined,
          gbraid: lead.gbraid || undefined,
          wbraid: lead.wbraid || undefined,
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
              googleSyncError: `Cron sync failed: ${result.error}`,
            },
          })
          results.failed++
        }
      } catch (error) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            googleSyncError:
              error instanceof Error ? error.message : 'Unknown error',
          },
        }).catch(() => {})
        results.failed++
      }

      // Small delay to stay under Google Ads API rate limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return NextResponse.json({
      ranAt: new Date().toISOString(),
      ...results,
    })
  } catch (error) {
    console.error('[Cron sync-enhanced-conversions] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
