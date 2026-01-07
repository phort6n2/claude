import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { TIME_SLOTS, DAY_PAIRS, DayPairKey } from '@/lib/automation/auto-scheduler'
import { selectNextPAA, markPAAAsUsed, renderPAAQuestion } from '@/lib/automation/paa-selector'
import { selectNextLocation, markLocationAsUsed, getDefaultLocation } from '@/lib/automation/location-rotator'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'

// Allow up to 10 minutes for the full content pipeline
// Podcast generation can take 5-10 minutes on slower plans
export const maxDuration = 600

/**
 * Hourly Publishing Cron Job
 * Runs every hour to check if any clients should publish NOW
 *
 * This replaces the previous multi-step flow:
 * - No more Sunday pre-scheduling
 * - Content is created and published at the exact scheduled time
 *
 * Schedule: 0 * * * * (every hour at minute 0)
 */

export async function GET(request: NextRequest) {
  // Verify cron secret
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const now = new Date()
  const currentHour = now.getUTCHours()
  const currentDay = now.getUTCDay() // 0=Sun, 1=Mon, 2=Tue, etc.
  const currentTimeSlot = `${currentHour.toString().padStart(2, '0')}:00`

  console.log(`[HourlyPublish] Running at ${now.toISOString()}`)
  console.log(`[HourlyPublish] Current: Day=${currentDay}, Hour=${currentHour}, TimeSlot=${currentTimeSlot}`)

  // Check if current time matches any of our time slots
  const slotIndex = TIME_SLOTS.indexOf(currentTimeSlot as typeof TIME_SLOTS[number])
  if (slotIndex === -1) {
    return NextResponse.json({
      success: true,
      message: `No time slot at ${currentTimeSlot} UTC`,
      processed: 0,
    })
  }

  console.log(`[HourlyPublish] Matched time slot index: ${slotIndex}`)

  try {
    // Find all clients scheduled for this exact time slot AND day
    const clients = await prisma.client.findMany({
      where: {
        status: 'ACTIVE',
        autoScheduleEnabled: true,
        scheduleTimeSlot: slotIndex,
        subscriptionStatus: { in: ['TRIAL', 'ACTIVE'] },
      },
      include: {
        serviceLocations: {
          where: { isActive: true },
        },
      },
    })

    console.log(`[HourlyPublish] Found ${clients.length} clients with time slot ${slotIndex}`)

    // Filter to clients whose day pair includes today
    const clientsForToday = clients.filter(client => {
      const dayPair = client.scheduleDayPair as DayPairKey | null
      if (!dayPair || !DAY_PAIRS[dayPair]) return false

      const { day1, day2 } = DAY_PAIRS[dayPair]
      const isScheduledToday = currentDay === day1 || currentDay === day2

      console.log(`[HourlyPublish] Client ${client.businessName}: dayPair=${dayPair}, day1=${day1}, day2=${day2}, today=${currentDay}, scheduled=${isScheduledToday}`)

      return isScheduledToday
    })

    console.log(`[HourlyPublish] ${clientsForToday.length} clients scheduled for today`)

    if (clientsForToday.length === 0) {
      // Note: Can't log to publishingLog without a clientId
      // The cron health is visible in Vercel cron logs
      return NextResponse.json({
        success: true,
        message: `No clients scheduled for day ${currentDay} at slot ${slotIndex}`,
        timeSlot: currentTimeSlot,
        slotIndex,
        day: currentDay,
        processed: 0,
      })
    }

    const results: Array<{
      clientId: string
      clientName: string
      success: boolean
      contentItemId?: string
      error?: string
    }> = []

    for (const client of clientsForToday) {
      console.log(`[HourlyPublish] Processing client: ${client.businessName}`)

      try {
        // Select next PAA question
        const paa = await selectNextPAA(client.id)
        if (!paa) {
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            error: 'No PAA questions available',
          })
          continue
        }

        // Select next location
        const selectedLocation = await selectNextLocation(client.id)
        if (!selectedLocation) {
          // Try to get default location as fallback
          const defaultLoc = await getDefaultLocation(client.id)
          if (!defaultLoc.locationId) {
            results.push({
              clientId: client.id,
              clientName: client.businessName,
              success: false,
              error: 'No service locations available',
            })
            continue
          }
          // Use default location for rendering, but we'll need to handle content creation differently
          const renderedQuestion = renderPAAQuestion(paa.question, defaultLoc)

          const contentItem = await prisma.contentItem.create({
            data: {
              clientId: client.id,
              clientPAAId: paa.id,
              serviceLocationId: defaultLoc.locationId,
              paaQuestion: renderedQuestion,
              scheduledDate: now,
              status: 'GENERATING',
              priority: 1,
            },
          })

          console.log(`[HourlyPublish] Created content item ${contentItem.id} for ${client.businessName} (default location)`)
          await markPAAAsUsed(paa.id)
          if (defaultLoc.locationId) {
            await markLocationAsUsed(defaultLoc.locationId)
          }

          // Run pipeline
          try {
            await runContentPipeline(contentItem.id)
            results.push({
              clientId: client.id,
              clientName: client.businessName,
              success: true,
              contentItemId: contentItem.id,
            })
          } catch (pipelineError) {
            console.error(`[HourlyPublish] Pipeline error for ${client.businessName}:`, pipelineError)
            await prisma.contentItem.update({
              where: { id: contentItem.id },
              data: { status: 'FAILED', pipelineStep: 'error' },
            })
            results.push({
              clientId: client.id,
              clientName: client.businessName,
              success: false,
              contentItemId: contentItem.id,
              error: pipelineError instanceof Error ? pipelineError.message : 'Pipeline failed',
            })
          }
          continue
        }

        // Render the PAA question with location
        const renderedQuestion = renderPAAQuestion(paa.question, selectedLocation)

        // Create the content item with current time as scheduled date
        const contentItem = await prisma.contentItem.create({
          data: {
            clientId: client.id,
            clientPAAId: paa.id,
            serviceLocationId: selectedLocation.id,
            paaQuestion: renderedQuestion,
            scheduledDate: now,
            status: 'GENERATING',
            priority: 1,
          },
        })

        console.log(`[HourlyPublish] Created content item ${contentItem.id} for ${client.businessName}`)

        // Mark PAA and location as used
        await markPAAAsUsed(paa.id)
        await markLocationAsUsed(selectedLocation.id)

        // Run the full content pipeline (generates and publishes)
        try {
          await runContentPipeline(contentItem.id)

          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: true,
            contentItemId: contentItem.id,
          })

          console.log(`[HourlyPublish] Successfully processed ${client.businessName}`)
        } catch (pipelineError) {
          console.error(`[HourlyPublish] Pipeline error for ${client.businessName}:`, pipelineError)

          // Update content item status to failed
          await prisma.contentItem.update({
            where: { id: contentItem.id },
            data: {
              status: 'FAILED',
              pipelineStep: 'error',
            },
          })

          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            contentItemId: contentItem.id,
            error: pipelineError instanceof Error ? pipelineError.message : 'Pipeline failed',
          })
        }

      } catch (clientError) {
        console.error(`[HourlyPublish] Error processing ${client.businessName}:`, clientError)
        results.push({
          clientId: client.id,
          clientName: client.businessName,
          success: false,
          error: clientError instanceof Error ? clientError.message : 'Unknown error',
        })
      }

      // Small delay between clients to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Log the run
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    // Always log when we processed clients
    if (results.length > 0) {
      try {
        await prisma.publishingLog.create({
          data: {
            clientId: results[0].clientId,
            action: 'cron_hourly_publish',
            status: failCount === 0 ? 'SUCCESS' : 'FAILED',
            responseData: JSON.stringify({
              timeSlot: currentTimeSlot,
              slotIndex,
              day: currentDay,
              processed: results.length,
              successful: successCount,
              failed: failCount,
              results,
            }),
            startedAt: new Date(startTime),
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
          },
        })
        console.log(`[HourlyPublish] Logged cron run: ${successCount} success, ${failCount} failed`)
      } catch (logError) {
        console.error('[HourlyPublish] Failed to log cron run:', logError)
      }
    }

    return NextResponse.json({
      success: true,
      timeSlot: currentTimeSlot,
      slotIndex,
      day: currentDay,
      processed: results.length,
      successful: successCount,
      failed: failCount,
      results,
      durationMs: Date.now() - startTime,
    })

  } catch (error) {
    console.error('[HourlyPublish] Cron error:', error)

    // Try to log the error
    try {
      // Find any active client to associate the error log with
      const anyClient = await prisma.client.findFirst({
        where: { status: 'ACTIVE', autoScheduleEnabled: true },
        select: { id: true },
      })
      if (anyClient) {
        await prisma.publishingLog.create({
          data: {
            clientId: anyClient.id,
            action: 'cron_hourly_publish',
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            responseData: JSON.stringify({
              timeSlot: currentTimeSlot,
              slotIndex,
              day: currentDay,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
            startedAt: new Date(startTime),
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
          },
        })
      }
    } catch (logError) {
      console.error('[HourlyPublish] Failed to log error:', logError)
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST endpoint for manual trigger
 */
export async function POST(request: NextRequest) {
  return GET(request)
}
