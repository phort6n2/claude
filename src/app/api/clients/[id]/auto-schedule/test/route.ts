import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { prisma } from '@/lib/db'
import { selectNextPAACombination, markPAAAsUsed, renderPAAQuestion } from '@/lib/automation/paa-selector'
import { markLocationAsUsed } from '@/lib/automation/location-rotator'

// Allow up to 10 minutes for the full pipeline (blog + images + WP + WRHQ + podcast + video + social)
export const maxDuration = 600

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST - Test the full automation flow for a client
 * Creates a single content item and triggers generation
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const startTime = Date.now()

  try {
    const { id: clientId } = await params

    // Get client info
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        businessName: true,
        preferredPublishTime: true,
        timezone: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Select next PAA + Location combination
    // This ensures all combinations are used before any repeat
    const combination = await selectNextPAACombination(clientId)
    if (!combination) {
      return NextResponse.json({
        success: false,
        error: 'No active PAA questions or locations available. Add PAAs and locations for this client first.',
        step: 'combination_selection',
      }, { status: 400 })
    }

    const { paa, location } = combination

    // Render the PAA question with location
    const renderedQuestion = renderPAAQuestion(paa.question, {
      city: location.city,
      state: location.state,
      neighborhood: location.neighborhood,
    })

    const locationString = location.neighborhood
      ? `${location.neighborhood}, ${location.city}, ${location.state}`
      : `${location.city}, ${location.state}`

    // Create the content item - schedule for today
    const today = new Date()
    const contentItem = await prisma.contentItem.create({
      data: {
        clientId,
        clientPAAId: paa.id,
        serviceLocationId: location.id,
        paaQuestion: renderedQuestion,
        scheduledDate: today,
        scheduledTime: client.preferredPublishTime,
        status: 'GENERATING',
      },
    })

    // Mark PAA and location as used (for legacy tracking)
    await markPAAAsUsed(paa.id)
    await markLocationAsUsed(location.id)

    // Build review URL for the response
    const reviewUrl = `/admin/content/${contentItem.id}/review`

    console.log(`[Test] Created content item ${contentItem.id}, scheduling pipeline in background`)
    console.log(`[Test] Review URL: ${reviewUrl}`)

    // Use Next.js after() to run the pipeline after the response is sent
    // This allows the user to be redirected to the review page immediately
    after(async () => {
      console.log(`[Test] Background: Starting generation for ${contentItem.id}`)
      try {
        await triggerFullGeneration(contentItem.id)
        console.log(`[Test] Background: Generation completed for ${contentItem.id}`)
      } catch (err) {
        console.error(`[Test] Background: Generation failed for ${contentItem.id}:`, err)
        // Error is already handled in triggerFullGeneration
      }
    })

    // Return immediately so user can be redirected to review page
    const response = {
      success: true,
      message: 'Content generation started. Redirecting to review page...',
      contentItemId: contentItem.id,
      details: {
        client: client.businessName,
        paa: renderedQuestion,
        location: locationString,
        scheduledDate: today.toISOString().split('T')[0],
      },
      reviewUrl,
      durationMs: Date.now() - startTime,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Test automation error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

/**
 * Trigger full content generation for a test item
 */
async function triggerFullGeneration(contentItemId: string): Promise<void> {
  console.log(`[Test] Starting generation for content item ${contentItemId}`)

  try {
    // Import the content pipeline
    console.log(`[Test] Importing content pipeline...`)
    const { runContentPipeline } = await import('@/lib/pipeline/content-pipeline')
    console.log(`[Test] Content pipeline imported successfully`)

    // Note: runContentPipeline runs the full pipeline including blog, images,
    // podcast, short video, social posts, and WRHQ publishing.
    // The pipeline will set the final status to PUBLISHED automatically.
    console.log(`[Test] Running content pipeline...`)
    await runContentPipeline(contentItemId)

    // Don't override the status - let the pipeline set the final status
    // The pipeline sets PUBLISHED if WordPress succeeded, or keeps the status it set
    console.log(`[Test] Generation complete for ${contentItemId}`)
  } catch (error) {
    console.error(`[Test] Generation failed for ${contentItemId}:`, error)
    console.error(`[Test] Error details:`, error instanceof Error ? error.stack : String(error))

    // Update status to FAILED
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        status: 'FAILED',
        lastError: error instanceof Error ? error.message : 'Generation failed',
      },
    })

    throw error
  }
}
