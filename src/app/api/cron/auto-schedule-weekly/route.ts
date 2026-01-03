import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { runWeeklyAutoSchedule } from '@/lib/automation'

/**
 * Weekly cron job for automatic content scheduling
 * Should run every Sunday evening to schedule content for upcoming Tue/Thu
 *
 * This endpoint:
 * 1. Finds all clients with autoScheduleEnabled = true
 * 2. For each client, creates content for next Tue/Thu based on frequency
 * 3. Selects PAAs using round-robin (unused first, then oldest-used)
 * 4. Rotates through service locations equally
 * 5. Triggers generation (skipping long-form video)
 *
 * Secured via CRON_SECRET environment variable
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

  try {
    // Run the auto-scheduling
    const result = await runWeeklyAutoSchedule()

    // Log the run
    if (result.results.length > 0) {
      const firstResult = result.results.find(r => r.success)
      await prisma.publishingLog.create({
        data: {
          clientId: firstResult?.details.clientId || result.results[0].details.clientId,
          action: 'cron_auto_schedule_weekly',
          status: result.failed === 0 ? 'SUCCESS' : result.successful > 0 ? 'SUCCESS' : 'FAILED',
          responseData: JSON.stringify({
            processed: result.processed,
            successful: result.successful,
            failed: result.failed,
            results: result.results.map(r => ({
              client: r.details.clientName,
              question: r.details.paaQuestion.substring(0, 50),
              location: r.details.location,
              date: r.details.scheduledDate,
              success: r.success,
              error: r.error,
            })),
          }),
          startedAt: new Date(startTime),
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: `Auto-scheduled ${result.successful} content items`,
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      results: result.results.map(r => ({
        client: r.details.clientName,
        question: r.details.paaQuestion.substring(0, 60),
        location: r.details.location,
        date: r.details.scheduledDate,
        success: r.success,
        error: r.error,
        contentItemId: r.contentItemId,
      })),
      durationMs: Date.now() - startTime,
    })
  } catch (error) {
    console.error('Auto-schedule cron error:', error)
    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * POST endpoint for manual trigger
 */
export async function POST(request: NextRequest) {
  // Verify authorization
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Forward to GET handler
  return GET(request)
}
