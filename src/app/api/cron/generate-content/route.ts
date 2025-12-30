import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'

// Runs every 15 minutes to check for content scheduled in the next 2 hours
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    // Find content items scheduled within the next 2 hours that are still in SCHEDULED status
    const scheduledContent = await prisma.contentItem.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledDate: {
          gte: now,
          lte: twoHoursFromNow,
        },
      },
      orderBy: [{ priority: 'desc' }, { scheduledDate: 'asc' }],
      take: 5, // Process up to 5 at a time
    })

    const results = []

    for (const content of scheduledContent) {
      try {
        // Start pipeline in background (don't await)
        runContentPipeline(content.id).catch((error) => {
          console.error(`Pipeline failed for ${content.id}:`, error)
        })

        results.push({
          id: content.id,
          status: 'started',
        })
      } catch (error) {
        results.push({
          id: content.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error('Cron job failed:', error)
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    )
  }
}
