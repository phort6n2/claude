import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DAY_PAIRS, DayPairKey } from '@/lib/automation/auto-scheduler'
import { selectNextPAACombination, markPAAAsUsed, renderPAAQuestion } from '@/lib/automation/paa-selector'
import { markLocationAsUsed } from '@/lib/automation/location-rotator'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'

export const maxDuration = 720

/**
 * Force run content generation for a specific client or all ready clients
 * POST /api/cron/hourly-publish/force
 * Body: { clientId?: string } - if not provided, runs for all ready clients
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))
    const targetClientId = body.clientId as string | undefined

    // Get clients to process
    const whereClause: Record<string, unknown> = {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
      subscriptionStatus: { in: ['TRIAL', 'ACTIVE'] },
    }

    if (targetClientId) {
      whereClause.id = targetClientId
    }

    const clients = await prisma.client.findMany({
      where: whereClause,
      include: {
        serviceLocations: { where: { isActive: true } },
      },
    })

    if (clients.length === 0) {
      return NextResponse.json({
        success: false,
        error: targetClientId ? 'Client not found or not eligible' : 'No eligible clients found',
      }, { status: 404 })
    }

    console.log(`[ForceRun] Processing ${clients.length} clients...`)

    const results: Array<{
      clientId: string
      clientName: string
      success: boolean
      contentItemId?: string
      error?: string
    }> = []

    for (const client of clients) {
      console.log(`[ForceRun] Processing: ${client.businessName}`)

      try {
        // Check service locations
        if (!client.serviceLocations || client.serviceLocations.length === 0) {
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            error: 'No active service locations',
          })
          continue
        }

        // Select next PAA + Location
        const combination = await selectNextPAACombination(client.id)
        if (!combination) {
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            error: 'No available PAA/location combinations (may already have content today)',
          })
          continue
        }

        const { paa, location } = combination
        const renderedQuestion = renderPAAQuestion(paa.question, location)

        // Create content item
        const now = new Date()
        const contentItem = await prisma.contentItem.create({
          data: {
            clientId: client.id,
            clientPAAId: paa.id,
            serviceLocationId: location.id,
            paaQuestion: renderedQuestion,
            scheduledDate: now,
            scheduledTime: '12:00',
            status: 'GENERATING',
            priority: 1,
          },
        })

        console.log(`[ForceRun] Created content ${contentItem.id} for ${client.businessName}`)

        // Mark as used
        await markPAAAsUsed(paa.id)
        await markLocationAsUsed(location.id)

        // Run pipeline
        try {
          await runContentPipeline(contentItem.id)
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: true,
            contentItemId: contentItem.id,
          })
          console.log(`[ForceRun] SUCCESS: ${client.businessName}`)
        } catch (pipelineError) {
          console.error(`[ForceRun] Pipeline failed for ${client.businessName}:`, pipelineError)
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            contentItemId: contentItem.id,
            error: pipelineError instanceof Error ? pipelineError.message : 'Pipeline failed',
          })
        }
      } catch (clientError) {
        console.error(`[ForceRun] Error for ${client.businessName}:`, clientError)
        results.push({
          clientId: client.id,
          clientName: client.businessName,
          success: false,
          error: clientError instanceof Error ? clientError.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful: successCount,
      failed: failCount,
      results,
      durationMs: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[ForceRun] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
