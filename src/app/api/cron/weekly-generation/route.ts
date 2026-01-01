import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'

/**
 * Weekly cron job for automatic content generation
 * Should run every Monday morning to generate content for upcoming week
 *
 * This endpoint:
 * 1. Finds all DRAFT content items scheduled for the upcoming week
 * 2. Triggers generation for each (blog + podcast + images + social)
 * 3. Updates status to REVIEW when complete
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
    // Calculate date range: next 7 days
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 7)

    // Find DRAFT content items scheduled for the week
    const draftItems = await prisma.contentItem.findMany({
      where: {
        status: 'DRAFT',
        scheduledDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            status: true,
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 50, // Process max 50 per run to avoid timeout
    })

    // Filter to only active clients
    const itemsToProcess = draftItems.filter(
      (item) => item.client.status === 'ACTIVE'
    )

    if (itemsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No content items to process',
        processed: 0,
      })
    }

    const results: Array<{
      id: string
      clientName: string
      question: string
      success: boolean
      error?: string
    }> = []

    // Process each item
    for (const item of itemsToProcess) {
      try {
        // Call the generate endpoint
        const generateResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/content/${item.id}/generate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Use internal auth bypass for cron
              'X-Cron-Secret': cronSecret || '',
            },
            body: JSON.stringify({
              generateBlog: true,
              generatePodcast: true,
              generateImages: true,
              generateSocial: true,
              generateWrhqBlog: true,
              generateWrhqSocial: true,
            }),
          }
        )

        if (generateResponse.ok) {
          results.push({
            id: item.id,
            clientName: item.client.businessName,
            question: item.paaQuestion.substring(0, 50),
            success: true,
          })
        } else {
          const error = await generateResponse.text()
          results.push({
            id: item.id,
            clientName: item.client.businessName,
            question: item.paaQuestion.substring(0, 50),
            success: false,
            error,
          })
        }
      } catch (error) {
        results.push({
          id: item.id,
          clientName: item.client.businessName,
          question: item.paaQuestion.substring(0, 50),
          success: false,
          error: String(error),
        })
      }

      // Small delay between items to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    // Summary
    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    // Log run
    await prisma.publishingLog.create({
      data: {
        clientId: itemsToProcess[0].clientId,
        action: 'cron_weekly_generation',
        status: failCount === 0 ? 'SUCCESS' : 'FAILED',
        responseData: JSON.stringify({
          total: results.length,
          success: successCount,
          failed: failCount,
          results,
        }),
        startedAt: startDate,
        completedAt: new Date(),
        durationMs: Date.now() - startDate.getTime(),
      },
    })

    return NextResponse.json({
      success: true,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      processed: results.length,
      successful: successCount,
      failed: failCount,
      results,
    })
  } catch (error) {
    console.error('Weekly generation cron error:', error)
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
