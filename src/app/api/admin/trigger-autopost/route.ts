import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DAY_PAIRS, DayPairKey, MOUNTAIN_TIMEZONE } from '@/lib/automation/auto-scheduler'
import { selectNextPAACombination, markPAAAsUsed, renderPAAQuestion } from '@/lib/automation/paa-selector'
import { markLocationAsUsed } from '@/lib/automation/location-rotator'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'

const MOUNTAIN_TIME_HOURS = [7, 8, 9, 10, 11, 13, 14, 15, 16, 17] as const

/**
 * GET - Debug client configuration
 * POST - Trigger content creation for a client
 *
 * Usage:
 *   GET /api/admin/trigger-autopost?client=collision
 *   POST /api/admin/trigger-autopost?client=collision
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientName = searchParams.get('client')

  if (!clientName) {
    return NextResponse.json({
      error: 'Missing client parameter',
      usage: 'GET /api/admin/trigger-autopost?client=collision'
    }, { status: 400 })
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        businessName: { contains: clientName, mode: 'insensitive' },
      },
      include: {
        serviceLocations: { where: { isActive: true } },
        clientPAAs: { where: { isActive: true }, take: 5 },
      },
    })

    if (!client) {
      return NextResponse.json({ error: `Client not found: ${clientName}` }, { status: 404 })
    }

    // Get today's content
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const todayContent = await prisma.contentItem.findMany({
      where: {
        clientId: client.id,
        scheduledDate: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        status: true,
        paaQuestion: true,
        scheduledDate: true,
        pipelineStep: true,
      },
    })

    // Get current Mountain Time
    const now = new Date()
    const mtFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: MOUNTAIN_TIMEZONE,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    })

    const slotIndex = client.scheduleTimeSlot as number | null
    const dayPair = client.scheduleDayPair as DayPairKey | null
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    let scheduleInfo = 'Not configured'
    if (slotIndex !== null && dayPair !== null) {
      const scheduledHour = MOUNTAIN_TIME_HOURS[slotIndex]
      const { day1, day2 } = DAY_PAIRS[dayPair]
      scheduleInfo = `${dayNames[day1]}/${dayNames[day2]} at ${scheduledHour}:00 MT`
    }

    // Check what would happen if we triggered now
    const combination = await selectNextPAACombination(client.id, MOUNTAIN_TIMEZONE)

    return NextResponse.json({
      client: {
        id: client.id,
        businessName: client.businessName,
        autoScheduleEnabled: client.autoScheduleEnabled,
        schedule: scheduleInfo,
        serviceLocations: client.serviceLocations.length,
        activePAAs: client.clientPAAs.length,
      },
      currentMountainTime: mtFormatter.format(now),
      todayContent: todayContent.length > 0 ? todayContent : 'No content today',
      nextCombination: combination ? {
        paa: combination.paa.question,
        location: `${combination.location.city}, ${combination.location.state}`,
      } : 'No available combination (all used today or none configured)',
      canTrigger: combination !== null && todayContent.length === 0,
      triggerUrl: `POST /api/admin/trigger-autopost?client=${encodeURIComponent(clientName)}`,
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientName = searchParams.get('client')
  const force = searchParams.get('force') === 'true'

  if (!clientName) {
    return NextResponse.json({
      error: 'Missing client parameter',
      usage: 'POST /api/admin/trigger-autopost?client=collision'
    }, { status: 400 })
  }

  const startTime = Date.now()

  try {
    const client = await prisma.client.findFirst({
      where: {
        businessName: { contains: clientName, mode: 'insensitive' },
      },
      include: {
        serviceLocations: { where: { isActive: true } },
      },
    })

    if (!client) {
      return NextResponse.json({ error: `Client not found: ${clientName}` }, { status: 404 })
    }

    // Check for existing content today (unless force=true)
    if (!force) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const existingContent = await prisma.contentItem.findFirst({
        where: {
          clientId: client.id,
          scheduledDate: { gte: todayStart, lte: todayEnd },
          status: { notIn: ['FAILED'] },
        },
      })

      if (existingContent) {
        return NextResponse.json({
          error: 'Content already exists for today',
          existingContent: {
            id: existingContent.id,
            status: existingContent.status,
            paaQuestion: existingContent.paaQuestion,
          },
          hint: 'Use ?force=true to create additional content',
        }, { status: 400 })
      }
    }

    // Select next PAA/location combination
    const combination = await selectNextPAACombination(client.id, MOUNTAIN_TIMEZONE)
    if (!combination) {
      return NextResponse.json({
        error: 'No available PAA/location combination',
        hint: 'All combinations may have been used today, or no PAAs/locations are configured',
      }, { status: 400 })
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
        scheduledTime: new Date().toLocaleTimeString('en-US', {
          timeZone: MOUNTAIN_TIMEZONE,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        status: 'GENERATING',
        priority: 1,
      },
    })

    console.log(`[TriggerAutopost] Created content item ${contentItem.id} for ${client.businessName}`)

    // Mark PAA and location as used
    await markPAAAsUsed(paa.id)
    await markLocationAsUsed(location.id)

    // Run the pipeline
    try {
      await runContentPipeline(contentItem.id)

      return NextResponse.json({
        success: true,
        contentItemId: contentItem.id,
        client: client.businessName,
        paaQuestion: renderedQuestion,
        location: `${location.city}, ${location.state}`,
        durationMs: Date.now() - startTime,
      })
    } catch (pipelineError) {
      console.error(`[TriggerAutopost] Pipeline error:`, pipelineError)

      await prisma.contentItem.update({
        where: { id: contentItem.id },
        data: {
          status: 'FAILED',
          pipelineStep: 'error',
          lastError: pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
        },
      })

      return NextResponse.json({
        success: false,
        contentItemId: contentItem.id,
        error: pipelineError instanceof Error ? pipelineError.message : 'Pipeline failed',
        durationMs: Date.now() - startTime,
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[TriggerAutopost] Error:', error)
    return NextResponse.json({
      error: String(error),
      durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}

// Allow longer execution for the full pipeline
export const maxDuration = 720
