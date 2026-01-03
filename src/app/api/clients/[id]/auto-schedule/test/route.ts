import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { selectNextPAA, markPAAAsUsed, renderPAAQuestion } from '@/lib/automation/paa-selector'
import { selectNextLocation, markLocationAsUsed, getDefaultLocation } from '@/lib/automation/location-rotator'

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

    // Select next PAA
    const paa = await selectNextPAA(clientId)
    if (!paa) {
      return NextResponse.json({
        success: false,
        error: 'No active PAA questions available. Add some PAAs for this client first.',
        step: 'paa_selection',
      }, { status: 400 })
    }

    // Select next location
    let location = await selectNextLocation(clientId)
    let locationId: string | null = null

    if (location) {
      locationId = location.id
    } else {
      // Fall back to default location
      const defaultLoc = await getDefaultLocation(clientId)
      location = {
        id: defaultLoc.locationId || '',
        city: defaultLoc.city,
        state: defaultLoc.state,
        neighborhood: defaultLoc.neighborhood,
        isHeadquarters: true,
      }
      locationId = defaultLoc.locationId
    }

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
        serviceLocationId: locationId,
        paaQuestion: renderedQuestion,
        scheduledDate: today,
        scheduledTime: client.preferredPublishTime,
        status: 'GENERATING',
      },
    })

    // Mark PAA and location as used
    await markPAAAsUsed(paa.id)
    if (locationId) {
      await markLocationAsUsed(locationId)
    }

    // Log initial response with content item ID so user can track
    const initialResponse = {
      success: true,
      message: 'Test content created - generation starting',
      contentItemId: contentItem.id,
      details: {
        client: client.businessName,
        paa: renderedQuestion,
        location: locationString,
        scheduledDate: today.toISOString().split('T')[0],
      },
      reviewUrl: `/admin/content/${contentItem.id}/review`,
    }

    // Trigger generation asynchronously (don't await - let it run in background)
    triggerFullGeneration(contentItem.id).catch((err) => {
      console.error(`Test generation failed for ${contentItem.id}:`, err)
    })

    return NextResponse.json(initialResponse)
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
    // Long video is already skipped by default in the pipeline.
    console.log(`[Test] Running content pipeline...`)
    await runContentPipeline(contentItemId)

    // Update status to REVIEW after successful generation
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: 'REVIEW' },
    })

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
