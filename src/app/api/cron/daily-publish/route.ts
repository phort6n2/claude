import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'

/**
 * Daily Publishing Cron Job
 * Runs every day at the configured publish time to:
 * 1. Publish APPROVED blogs to WordPress
 * 2. Schedule approved social posts via Late.dev
 * 3. Publish podcasts to Podbean
 *
 * Schedule: 0 9 * * * (9 AM daily, but actual publish times vary by client)
 */

interface PublishResult {
  contentItemId: string
  clientName: string
  type: 'blog' | 'social' | 'podcast'
  success: boolean
  url?: string
  error?: string
}

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
    // Get today's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Find APPROVED content items scheduled for today
    const contentItems = await prisma.contentItem.findMany({
      where: {
        status: 'APPROVED',
        scheduledDate: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        client: {
          select: {
            id: true,
            businessName: true,
            status: true,
            wordpressUrl: true,
            wordpressUsername: true,
            wordpressAppPassword: true,
            podbeanClientId: true,
            podbeanClientSecret: true,
            subscriptionStatus: true,
            socialAccountIds: true,
          },
        },
        blogPost: true,
        socialPosts: {
          where: {
            approved: true,
            status: 'SCHEDULED',
          },
        },
        podcast: true,
      },
      take: 50, // Limit to prevent timeout
    })

    // Filter to only active clients with active subscriptions
    const itemsToPublish = contentItems.filter(
      (item) =>
        item.client.status === 'ACTIVE' &&
        ['TRIAL', 'ACTIVE'].includes(item.client.subscriptionStatus)
    )

    if (itemsToPublish.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No approved content items to publish today',
        published: 0,
      })
    }

    const results: PublishResult[] = []

    for (const item of itemsToPublish) {
      // Publish Blog to WordPress
      if (
        item.blogPost &&
        !item.clientBlogPublished &&
        item.client.wordpressUrl &&
        item.client.wordpressUsername &&
        item.client.wordpressAppPassword
      ) {
        try {
          const { publishToWordPress } = await import('@/lib/integrations/wordpress')

          const wpResult = await publishToWordPress({
            client: item.client,
            title: item.blogPost.title,
            content: item.blogPost.content,
            excerpt: item.blogPost.excerpt || undefined,
            slug: item.blogPost.slug,
            scheduledDate: item.scheduledDate,
            metaTitle: item.blogPost.metaTitle || undefined,
            metaDescription: item.blogPost.metaDescription || undefined,
            schemaJson: item.blogPost.schemaJson || undefined,
          })

          // Update content item and blog post
          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              clientBlogPublished: true,
              clientBlogPublishedAt: new Date(),
              clientBlogUrl: wpResult.url,
            },
          })

          await prisma.blogPost.update({
            where: { id: item.blogPost.id },
            data: {
              wordpressPostId: wpResult.postId,
              wordpressUrl: wpResult.url,
              publishedAt: new Date(),
            },
          })

          results.push({
            contentItemId: item.id,
            clientName: item.client.businessName,
            type: 'blog',
            success: true,
            url: wpResult.url,
          })
        } catch (error) {
          results.push({
            contentItemId: item.id,
            clientName: item.client.businessName,
            type: 'blog',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Publish Social Posts via Late.dev
      for (const socialPost of item.socialPosts) {
        try {
          const { schedulePost } = await import('@/lib/integrations/getlate')

          // Get the account ID for this platform
          const socialAccountIds = (item.client.socialAccountIds as Record<string, string>) || {}
          const accountId = socialAccountIds[socialPost.platform.toLowerCase()]

          if (!accountId) {
            results.push({
              contentItemId: item.id,
              clientName: item.client.businessName,
              type: 'social',
              success: false,
              error: `No ${socialPost.platform} account configured`,
            })
            continue
          }

          const lateResult = await schedulePost({
            accountId,
            platform: socialPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
            caption: socialPost.caption,
            mediaUrls: socialPost.mediaUrls,
            scheduledTime: socialPost.scheduledTime,
            firstComment: socialPost.firstComment || undefined,
          })

          await prisma.socialPost.update({
            where: { id: socialPost.id },
            data: {
              getlatePostId: lateResult.postId,
              status: 'SCHEDULED',
            },
          })

          results.push({
            contentItemId: item.id,
            clientName: item.client.businessName,
            type: 'social',
            success: true,
          })
        } catch (error) {
          results.push({
            contentItemId: item.id,
            clientName: item.client.businessName,
            type: 'social',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Publish Podcast to Podbean
      if (
        item.podcast &&
        item.podcast.status === 'READY' &&
        item.client.podbeanClientId &&
        item.client.podbeanClientSecret
      ) {
        try {
          const { publishToPodbean } = await import('@/lib/integrations/podbean')

          const podbeanResult = await publishToPodbean({
            client: item.client,
            title: item.blogPost?.title || item.paaQuestion,
            description: item.podcastDescription || item.paaQuestion,
            audioUrl: item.podcast.audioUrl,
          })

          await prisma.podcast.update({
            where: { id: item.podcast.id },
            data: {
              status: 'READY',
            },
          })

          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              podcastUrl: podbeanResult.url,
            },
          })

          results.push({
            contentItemId: item.id,
            clientName: item.client.businessName,
            type: 'podcast',
            success: true,
            url: podbeanResult.url,
          })
        } catch (error) {
          results.push({
            contentItemId: item.id,
            clientName: item.client.businessName,
            type: 'podcast',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Update content item status if all publishing succeeded
      const itemResults = results.filter((r) => r.contentItemId === item.id)
      const allSuccessful = itemResults.every((r) => r.success)

      if (allSuccessful && itemResults.length > 0) {
        await prisma.contentItem.update({
          where: { id: item.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        })
      }

      // Small delay between items
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Summary
    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length
    const durationMs = Date.now() - startTime

    // Log the run
    if (itemsToPublish.length > 0) {
      await prisma.publishingLog.create({
        data: {
          clientId: itemsToPublish[0].clientId,
          action: 'cron_daily_publish',
          status: failCount === 0 ? 'SUCCESS' : 'FAILED',
          responseData: JSON.stringify({
            total: results.length,
            success: successCount,
            failed: failCount,
            results,
          }),
          startedAt: new Date(startTime),
          completedAt: new Date(),
          durationMs,
        },
      })
    }

    return NextResponse.json({
      success: true,
      dateRange: today.toISOString().split('T')[0],
      processed: itemsToPublish.length,
      results: {
        total: results.length,
        successful: successCount,
        failed: failCount,
      },
      details: results,
      durationMs,
    })
  } catch (error) {
    console.error('Daily publish cron error:', error)

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
  // Forward to GET handler
  return GET(request)
}
