import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generatePressRelease } from '@/lib/integrations/claude'

// Runs on the 1st of every month at 2 AM
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all active clients
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
    })

    const results = []
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    for (const client of clients) {
      try {
        // Get published content from last month
        const publishedContent = await prisma.contentItem.findMany({
          where: {
            clientId: client.id,
            status: 'PUBLISHED',
            publishedAt: {
              gte: lastMonth,
              lte: lastMonthEnd,
            },
          },
          orderBy: { publishedAt: 'desc' },
          take: 3,
          include: {
            blogPost: {
              select: { title: true, wordpressUrl: true },
            },
          },
        })

        if (publishedContent.length === 0) {
          results.push({
            clientId: client.id,
            status: 'skipped',
            reason: 'No published content last month',
          })
          continue
        }

        // Count total content pieces
        const blogPostsCount = publishedContent.length
        const imagesCount = await prisma.image.count({
          where: {
            clientId: client.id,
            createdAt: { gte: lastMonth, lte: lastMonthEnd },
          },
        })
        const podcastsCount = await prisma.podcast.count({
          where: {
            clientId: client.id,
            createdAt: { gte: lastMonth, lte: lastMonthEnd },
          },
        })
        const videosCount = await prisma.video.count({
          where: {
            clientId: client.id,
            createdAt: { gte: lastMonth, lte: lastMonthEnd },
          },
        })
        const socialPostsCount = await prisma.socialPost.count({
          where: {
            clientId: client.id,
            createdAt: { gte: lastMonth, lte: lastMonthEnd },
          },
        })

        const totalContentPieces =
          blogPostsCount + imagesCount + podcastsCount + videosCount + socialPostsCount

        // Generate press release
        const monthName = lastMonth.toLocaleDateString('en-US', { month: 'long' })

        const pressReleaseContent = await generatePressRelease({
          businessName: client.businessName,
          city: client.city,
          state: client.state,
          month: monthName,
          year: lastMonth.getFullYear(),
          featuredTopics: publishedContent.map((c) => ({
            question: c.paaQuestion,
            url: c.blogPost?.wordpressUrl || '',
          })),
          blogPostsCount,
          totalContentPieces,
          newReviews: 0, // TODO: Integrate with GBP API
          totalReviews: client.gbpReviewCount || 0,
          averageRating: client.gbpRating || 0,
          ownerName: client.contactPerson || undefined,
        })

        // Save press release
        await prisma.pressRelease.create({
          data: {
            clientId: client.id,
            month: lastMonth,
            featuredPaaIds: publishedContent.map((c) => c.id),
            newReviews: 0,
            totalReviews: client.gbpReviewCount,
            averageRating: client.gbpRating,
            blogPostsCount,
            totalContentPieces,
            headline: pressReleaseContent.headline,
            content: pressReleaseContent.content,
            status: 'READY',
          },
        })

        results.push({
          clientId: client.id,
          status: 'success',
          headline: pressReleaseContent.headline,
        })
      } catch (error) {
        results.push({
          clientId: client.id,
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
    console.error('Press release cron job failed:', error)
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    )
  }
}
