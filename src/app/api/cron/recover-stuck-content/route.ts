import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { runContentPipeline } from '@/lib/pipeline/content-pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

/**
 * POST /api/cron/recover-stuck-content
 *
 * This cron job runs every 2-3 hours and:
 * 1. Finds content stuck in GENERATING status for too long (> 2 hours)
 * 2. Checks what was completed and what needs to be retried
 * 3. For items with blog+images done, attempts to finish remaining steps
 * 4. For items without core content, marks as FAILED for manual review
 *
 * Also handles:
 * - Podcasts stuck in PROCESSING status
 * - Videos stuck in PROCESSING status
 * - Content marked as published but missing embeds
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {
    stuckGenerating: [] as string[],
    stuckPodcasts: [] as string[],
    missingEmbeds: [] as string[],
    errors: [] as string[],
  }

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

    // 1. Find content stuck in GENERATING for more than 2 hours
    const stuckContent = await prisma.contentItem.findMany({
      where: {
        status: 'GENERATING',
        updatedAt: { lt: twoHoursAgo },
      },
      include: {
        client: true,
        blogPost: true,
        podcast: true,
        images: true,
      },
      take: 10,
    })

    console.log(`[Recovery] Found ${stuckContent.length} content items stuck in GENERATING`)

    for (const item of stuckContent) {
      try {
        if (item.retryCount < 3) {
          // Retry the pipeline - it will skip already-completed steps
          console.log(`[Recovery] Retrying content ${item.id} (attempt ${item.retryCount + 1})`)
          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              status: 'SCHEDULED',
              retryCount: item.retryCount + 1,
              lastError: 'Recovered from stuck state - retrying',
            },
          })
          // Trigger pipeline in background
          runContentPipeline(item.id).catch(err => {
            console.error(`[Recovery] Pipeline retry failed for ${item.id}:`, err)
          })
          results.stuckGenerating.push(`${item.id}: retrying (attempt ${item.retryCount + 1})`)
        } else {
          // Max retries reached - mark as failed
          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              status: 'FAILED',
              lastError: 'Pipeline failed after 3 attempts - manual intervention required',
            },
          })
          console.log(`[Recovery] Content ${item.id} marked as FAILED (max retries)`)
          results.stuckGenerating.push(`${item.id}: marked FAILED (max retries)`)
        }
      } catch (err) {
        const error = `Error recovering ${item.id}: ${err}`
        console.error(`[Recovery] ${error}`)
        results.errors.push(error)
      }
    }

    // 2. Find podcasts stuck in PROCESSING for more than 4 hours
    const stuckPodcasts = await prisma.podcast.findMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: fourHoursAgo },
      },
      include: {
        contentItem: true,
      },
      take: 10,
    })

    console.log(`[Recovery] Found ${stuckPodcasts.length} podcasts stuck in PROCESSING`)

    for (const podcast of stuckPodcasts) {
      try {
        // Mark as FAILED so user can retry
        await prisma.podcast.update({
          where: { id: podcast.id },
          data: {
            status: 'FAILED',
          },
        })

        // Update content item status
        if (podcast.contentItem) {
          await prisma.contentItem.update({
            where: { id: podcast.contentItem.id },
            data: {
              podcastStatus: 'failed',
              lastError: 'Podcast generation timed out',
            },
          })
        }

        console.log(`[Recovery] Podcast ${podcast.id} marked as FAILED`)
        results.stuckPodcasts.push(podcast.id)
      } catch (err) {
        const error = `Error recovering podcast ${podcast.id}: ${err}`
        console.error(`[Recovery] ${error}`)
        results.errors.push(error)
      }
    }

    // 3. Find published content that says podcast is embedded but missing podbeanPlayerUrl
    const missingPodcastUrl = await prisma.contentItem.findMany({
      where: {
        status: 'PUBLISHED',
        podcastAddedToPost: true,
        podcast: {
          podbeanPlayerUrl: null,
        },
      },
      include: {
        podcast: true,
        client: true,
        blogPost: true,
      },
      take: 10,
    })

    console.log(`[Recovery] Found ${missingPodcastUrl.length} items claiming podcast embedded but missing URL`)

    for (const item of missingPodcastUrl) {
      try {
        // If podcast has audio but no Podbean URL, try to publish to Podbean and re-embed
        if (item.podcast?.audioUrl && item.podcast?.status === 'READY') {
          console.log(`[Recovery] Podcast ${item.podcast.id} has audio but no Podbean URL - re-running pipeline`)
          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              status: 'GENERATING',
              pipelineStep: 'podcast',
              podcastAddedToPost: false,
              podcastAddedAt: null,
            },
          })
          // Re-run pipeline to publish to Podbean and embed
          runContentPipeline(item.id).catch(err => {
            console.error(`[Recovery] Pipeline failed for ${item.id}:`, err)
          })
          results.missingEmbeds.push(`${item.id}: re-running pipeline to publish podcast to Podbean`)
        } else {
          // Just reset the flag - podcast needs to be regenerated
          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              podcastAddedToPost: false,
              podcastAddedAt: null,
            },
          })
          results.missingEmbeds.push(`${item.id}: reset podcastAddedToPost flag (no audio URL)`)
        }
      } catch (err) {
        const error = `Error recovering ${item.id}: ${err}`
        console.error(`[Recovery] ${error}`)
        results.errors.push(error)
      }
    }

    // 4. Find content published more than 1 hour ago that should have podcast but doesn't
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000)
    const needsPodcastEmbed = await prisma.contentItem.findMany({
      where: {
        status: 'PUBLISHED',
        clientBlogPublished: true,
        podcastAddedToPost: false,
        podcast: {
          status: 'PUBLISHED',
          podbeanPlayerUrl: { not: null },
        },
        publishedAt: { lt: oneHourAgo },
      },
      include: {
        client: true,
        blogPost: true,
        podcast: true,
      },
      take: 10,
    })

    console.log(`[Recovery] Found ${needsPodcastEmbed.length} published items needing podcast embed`)

    for (const item of needsPodcastEmbed) {
      try {
        // Re-run the pipeline - it will skip all generation steps and just do schema/embedding
        console.log(`[Recovery] Re-triggering pipeline for ${item.id} to embed podcast`)
        await prisma.contentItem.update({
          where: { id: item.id },
          data: {
            status: 'GENERATING', // Set to GENERATING so pipeline runs embedding
            pipelineStep: 'schema',
          },
        })
        // Trigger pipeline in background
        runContentPipeline(item.id).catch(err => {
          console.error(`[Recovery] Pipeline embed retry failed for ${item.id}:`, err)
        })
        results.missingEmbeds.push(`${item.id}: re-running pipeline for podcast embed`)
      } catch (err) {
        const error = `Error triggering embed for ${item.id}: ${err}`
        console.error(`[Recovery] ${error}`)
        results.errors.push(error)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      summary: {
        stuckGeneratingRecovered: results.stuckGenerating.length,
        stuckPodcastsFixed: results.stuckPodcasts.length,
        missingEmbedsFound: results.missingEmbeds.length,
        errors: results.errors.length,
      },
    })
  } catch (error) {
    console.error('[Recovery] Cron job failed:', error)
    return NextResponse.json(
      { error: 'Recovery job failed', details: String(error) },
      { status: 500 }
    )
  }
}

// Also allow GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request)
}
