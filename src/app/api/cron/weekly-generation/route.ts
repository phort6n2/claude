import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { runWeeklyAutoSchedule } from '@/lib/automation/auto-scheduler'

/**
 * Weekly cron job for automatic content generation
 * Runs every Monday at 7 AM to generate content for the upcoming week
 *
 * This endpoint uses the auto-scheduler which:
 * 1. Finds all clients with autoScheduleEnabled = true
 * 2. Creates content items for each client's assigned days (SCHEDULED status)
 * 3. Runs the full content pipeline automatically (blog, images, podcast, video, social)
 * 4. Publishes everything - no approval/review step needed
 *
 * Final status: PUBLISHED (or FAILED if something went wrong)
 *
 * Secured via CRON_SECRET environment variable
 */

export async function GET(request: NextRequest) {
  // Verify cron secret (set by Vercel cron or external scheduler)
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[WeeklyGeneration] Starting automated content generation...')

    // Run the auto-scheduler which handles everything automatically:
    // - Creates content items for each enabled client
    // - Runs full pipeline (blog, images, podcast, video, social, WRHQ)
    // - Publishes to WordPress and all platforms
    // - No manual approval needed
    const result = await runWeeklyAutoSchedule()

    console.log(`[WeeklyGeneration] Complete. Processed: ${result.processed}, Success: ${result.successful}, Failed: ${result.failed}`)

    return NextResponse.json({
      success: true,
      message: 'Weekly auto-schedule completed',
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      results: result.results.map(r => ({
        clientName: r.details.clientName,
        paaQuestion: r.details.paaQuestion.substring(0, 50),
        scheduledDate: r.details.scheduledDate,
        success: r.success,
        contentItemId: r.contentItemId,
        error: r.error,
        generationSuccess: r.generationSuccess,
        generationError: r.generationError,
      })),
    })
  } catch (error) {
    console.error('[WeeklyGeneration] Cron error:', error)
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
  // Forward to GET handler (same auth check inside)
  return GET(request)
}
