import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET - Get daily content report for a specific date
 * Query params:
 *   - date: ISO date string (default: today)
 *   - clientId: Optional client filter
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const clientId = searchParams.get('clientId')

    // Parse date or use today
    const targetDate = dateParam ? new Date(dateParam) : new Date()
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)

    // Build where clause
    const where: Record<string, unknown> = {
      scheduledDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    }
    if (clientId) {
      where.clientId = clientId
    }

    // Fetch content items for the date
    const contentItems = await prisma.contentItem.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            primaryColor: true,
          },
        },
        serviceLocation: {
          select: {
            city: true,
            state: true,
            neighborhood: true,
          },
        },
        blogPost: {
          select: {
            wordpressUrl: true,
          },
        },
        podcast: {
          select: {
            podbeanUrl: true,
            podbeanPlayerUrl: true,
          },
        },
        socialPosts: {
          select: {
            platform: true,
            publishedUrl: true,
            status: true,
          },
        },
      },
      orderBy: [
        { client: { businessName: 'asc' } },
        { scheduledTime: 'asc' },
      ],
    })

    // Transform for response
    const items = contentItems.map((item) => {
      const location = item.serviceLocation
        ? item.serviceLocation.neighborhood
          ? `${item.serviceLocation.neighborhood}, ${item.serviceLocation.city}, ${item.serviceLocation.state}`
          : `${item.serviceLocation.city}, ${item.serviceLocation.state}`
        : null

      return {
        id: item.id,
        client: {
          id: item.client.id,
          name: item.client.businessName,
          color: item.client.primaryColor,
        },
        question: item.paaQuestion,
        location,
        scheduledTime: item.scheduledTime,
        status: item.status,
        publishedAt: item.publishedAt,
        steps: {
          blog: {
            generated: item.blogGenerated,
            published: !!item.blogPost?.wordpressUrl,
            url: item.blogPost?.wordpressUrl || null,
          },
          podcast: {
            generated: item.podcastGenerated,
            published: !!item.podcast?.podbeanUrl,
            url: item.podcast?.podbeanPlayerUrl || item.podcast?.podbeanUrl || null,
          },
          images: {
            generated: item.imagesGenerated,
            approved: item.imagesApproved === 'APPROVED',
          },
          social: {
            generated: item.socialGenerated,
            platforms: item.socialPosts.map((sp) => ({
              platform: sp.platform,
              published: sp.status === 'PUBLISHED',
              url: sp.publishedUrl,
            })),
          },
          shortVideo: {
            generated: item.shortVideoGenerated,
            addedToPost: item.shortVideoAddedToPost,
          },
          longVideo: {
            uploaded: !!item.longformVideoUrl,
            url: item.longformVideoUrl,
          },
          schema: {
            generated: item.schemaGenerated,
          },
          embed: {
            complete: item.podcastAddedToPost || item.shortVideoAddedToPost || item.longVideoAddedToPost,
          },
        },
      }
    })

    // Calculate summary
    const summary = {
      total: items.length,
      byStatus: {
        draft: items.filter((i) => i.status === 'DRAFT').length,
        scheduled: items.filter((i) => i.status === 'SCHEDULED').length,
        generating: items.filter((i) => i.status === 'GENERATING').length,
        review: items.filter((i) => i.status === 'REVIEW').length,
        approved: items.filter((i) => i.status === 'APPROVED').length,
        published: items.filter((i) => i.status === 'PUBLISHED').length,
        failed: items.filter((i) => i.status === 'FAILED').length,
      },
      fullyComplete: items.filter((i) => i.steps.embed.complete).length,
    }

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      items,
      summary,
    })
  } catch (error) {
    console.error('Failed to get daily content report:', error)
    return NextResponse.json(
      { error: 'Failed to get daily content report' },
      { status: 500 }
    )
  }
}
