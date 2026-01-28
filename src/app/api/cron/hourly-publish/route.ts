import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { DAY_PAIRS, DayPairKey } from '@/lib/automation/auto-scheduler'
import { selectNextPAACombination, markPAAAsUsed, renderPAAQuestion } from '@/lib/automation/paa-selector'
import { markLocationAsUsed } from '@/lib/automation/location-rotator'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'

// Local time slots - these represent the client's LOCAL preferred publish time
// Slot index maps to these hours in the client's timezone
const LOCAL_TIME_HOURS = [7, 8, 9, 10, 11, 13, 14, 15, 16, 17] as const // 7-11 AM, 1-5 PM local

/**
 * Get the current hour in a specific timezone
 */
function getCurrentHourInTimezone(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })
    const hourStr = formatter.format(new Date())
    return parseInt(hourStr, 10)
  } catch {
    // Fallback to UTC if timezone is invalid
    console.warn(`[HourlyPublish] Invalid timezone: ${timezone}, falling back to UTC`)
    return new Date().getUTCHours()
  }
}

/**
 * Get the current day (0-6) in a specific timezone
 */
function getCurrentDayInTimezone(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    })
    const dayStr = formatter.format(new Date())
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return dayMap[dayStr] ?? new Date().getUTCDay()
  } catch {
    return new Date().getUTCDay()
  }
}

// Allow up to 12 minutes for the full content pipeline
// Podcast generation can take 5-10 minutes on slower plans
// Requires Fluid Compute enabled (Pro plan max: 800 seconds)
export const maxDuration = 720

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
  // Verify cron secret - require auth in production
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  // In production, CRON_SECRET must be set and must match
  // In development, allow requests without secret for testing
  if (isProduction && !cronSecret) {
    console.error('[HourlyPublish] CRON_SECRET not configured in production')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const now = new Date()

  console.log(`[HourlyPublish] Running at ${now.toISOString()}`)

  try {
    // TIMEZONE-AWARE SCHEDULING:
    // Instead of matching UTC hour to a global slot, we check each client's
    // local time against their preferred slot. This ensures clients publish
    // at their expected local time regardless of timezone.

    // Find ALL auto-schedule enabled clients
    const allClients = await prisma.client.findMany({
      where: {
        status: 'ACTIVE',
        autoScheduleEnabled: true,
        subscriptionStatus: { in: ['TRIAL', 'ACTIVE'] },
        scheduleTimeSlot: { not: null },
        scheduleDayPair: { not: null },
      },
      include: {
        serviceLocations: {
          where: { isActive: true },
        },
      },
    })

    console.log(`[HourlyPublish] Found ${allClients.length} auto-schedule enabled clients`)

    // Filter to clients who should publish NOW based on their local time
    const skippedClients: Array<{
      name: string
      reason: string
      details: string
    }> = []

    const clientsForNow = allClients.filter(client => {
      const timezone = client.timezone || 'America/Denver'
      const slotIndex = client.scheduleTimeSlot as number
      const dayPair = client.scheduleDayPair as DayPairKey

      // Get current time in client's timezone
      const clientLocalHour = getCurrentHourInTimezone(timezone)
      const clientLocalDay = getCurrentDayInTimezone(timezone)

      // Check if current local hour matches client's preferred slot
      const preferredHour = LOCAL_TIME_HOURS[slotIndex]
      const hourMatches = clientLocalHour === preferredHour

      // Check if today is one of client's scheduled days
      const { day1, day2 } = DAY_PAIRS[dayPair]
      const dayMatches = clientLocalDay === day1 || clientLocalDay === day2

      const shouldPublish = hourMatches && dayMatches

      if (shouldPublish) {
        console.log(`[HourlyPublish] Client ${client.businessName}: timezone=${timezone}, localHour=${clientLocalHour}, localDay=${clientLocalDay}, preferredHour=${preferredHour}, days=[${day1},${day2}] → PUBLISH NOW`)
      } else {
        // Log why this client was skipped for debugging
        const reasons: string[] = []
        if (!hourMatches) {
          reasons.push(`hour mismatch (local=${clientLocalHour}, expected=${preferredHour})`)
        }
        if (!dayMatches) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          reasons.push(`day mismatch (today=${dayNames[clientLocalDay]}, expected=${dayNames[day1]}/${dayNames[day2]})`)
        }
        skippedClients.push({
          name: client.businessName,
          reason: reasons.join(', '),
          details: `tz=${timezone}, slot=${slotIndex}(${preferredHour}:00), pair=${dayPair}`,
        })
      }

      return shouldPublish
    })

    // Log a summary of skipped clients (limit to first 10 to avoid log spam)
    if (skippedClients.length > 0) {
      console.log(`[HourlyPublish] Skipped ${skippedClients.length} clients:`)
      skippedClients.slice(0, 10).forEach(c => {
        console.log(`  - ${c.name}: ${c.reason} (${c.details})`)
      })
      if (skippedClients.length > 10) {
        console.log(`  ... and ${skippedClients.length - 10} more`)
      }
    }

    console.log(`[HourlyPublish] ${clientsForNow.length} clients scheduled for now`)
    const clientsForToday = clientsForNow // Rename for compatibility with rest of code

    if (clientsForToday.length === 0) {
      // Note: Can't log to publishingLog without a clientId
      // The cron health is visible in Vercel cron logs
      return NextResponse.json({
        success: true,
        message: 'No clients scheduled for this hour (timezone-aware check)',
        utcTime: now.toISOString(),
        checkedClients: allClients.length,
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
      const clientTimezone = client.timezone || 'America/Denver'
      console.log(`[HourlyPublish] Processing client: ${client.businessName} (timezone: ${clientTimezone})`)

      try {
        // Validation: Check if client has service locations
        if (!client.serviceLocations || client.serviceLocations.length === 0) {
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            error: 'No active service locations configured',
          })
          continue
        }

        // Validation: Check if WordPress is connected (optional but recommended)
        if (!client.wordpressConnected) {
          console.warn(`[HourlyPublish] Client ${client.businessName} has no WordPress connection - content will be marked REVIEW`)
        }

        // Select next PAA + Location combination
        // Pass timezone so "today" check matches client's local day
        const combination = await selectNextPAACombination(client.id, clientTimezone)
        if (!combination) {
          // This means either: no PAAs/locations configured, OR all combinations already have content today
          // Let's check why to provide better error messaging
          const [paaCount, locationCount, todayContent] = await Promise.all([
            prisma.clientPAA.count({ where: { clientId: client.id, isActive: true } }),
            prisma.serviceLocation.count({ where: { clientId: client.id, isActive: true } }),
            prisma.contentItem.count({
              where: {
                clientId: client.id,
                scheduledDate: {
                  gte: new Date(new Date().setHours(0, 0, 0, 0)),
                  lte: new Date(new Date().setHours(23, 59, 59, 999)),
                },
                status: { notIn: ['FAILED'] },
              },
            }),
          ])

          let errorDetail = 'No available PAA/location combinations'
          if (paaCount === 0) {
            errorDetail = 'No active PAA questions configured'
          } else if (locationCount === 0) {
            errorDetail = 'No active service locations configured'
          } else if (todayContent > 0) {
            errorDetail = `Content already exists for today (${todayContent} items) - all combinations used`
          }

          console.warn(`[HourlyPublish] ${client.businessName}: ${errorDetail} (PAAs: ${paaCount}, Locations: ${locationCount}, Today: ${todayContent})`)

          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            error: errorDetail,
          })
          continue
        }

        const { paa, location } = combination

        // Render the PAA question with location
        const renderedQuestion = renderPAAQuestion(paa.question, location)

        // Get client's preferred local time for scheduledTime field
        const clientSlotIndex = client.scheduleTimeSlot as number
        const clientPreferredHour = LOCAL_TIME_HOURS[clientSlotIndex] || 9
        const clientTimeSlot = `${clientPreferredHour.toString().padStart(2, '0')}:00`

        // RACE CONDITION FIX: Use a transaction with a final check to prevent
        // duplicate content creation if two cron runs happen simultaneously
        const todayStart = new Date(now)
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date(now)
        todayEnd.setHours(23, 59, 59, 999)

        const contentItem = await prisma.$transaction(async (tx) => {
          // Final check: Ensure no content was created since we selected the combination
          const existingToday = await tx.contentItem.findFirst({
            where: {
              clientId: client.id,
              scheduledDate: { gte: todayStart, lte: todayEnd },
              status: { notIn: ['FAILED'] },
            },
            select: { id: true },
          })

          if (existingToday) {
            console.log(`[HourlyPublish] Content already exists for ${client.businessName} today (${existingToday.id}) - skipping to prevent duplicate`)
            return null
          }

          // Create the content item with current time as scheduled date
          return await tx.contentItem.create({
            data: {
              clientId: client.id,
              clientPAAId: paa.id,
              serviceLocationId: location.id,
              paaQuestion: renderedQuestion,
              scheduledDate: now,
              scheduledTime: clientTimeSlot, // Client's local preferred time
              status: 'GENERATING',
              priority: 1,
            },
          })
        })

        // Skip if content was already created by another process
        if (!contentItem) {
          results.push({
            clientId: client.id,
            clientName: client.businessName,
            success: false,
            error: 'Content already exists for today (concurrent run detected)',
          })
          continue
        }

        console.log(`[HourlyPublish] Created content item ${contentItem.id} for ${client.businessName}`)

        // Mark PAA and location as used (for legacy tracking)
        await markPAAAsUsed(paa.id)
        await markLocationAsUsed(location.id)

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
              utcTime: now.toISOString(),
              timezoneAware: true,
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
        console.log(`[HourlyPublish] Logged cron run: ${successCount} successful, ${failCount} failed`)
      } catch (logError) {
        console.error('[HourlyPublish] Failed to log cron run:', logError)
      }
    }

    return NextResponse.json({
      success: true,
      utcTime: now.toISOString(),
      timezoneAware: true,
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
              utcTime: now.toISOString(),
              timezoneAware: true,
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
