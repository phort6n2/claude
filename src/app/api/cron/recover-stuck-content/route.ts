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
  // Verify cron secret - require auth in production
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  // In production, CRON_SECRET must be set and must match
  if (isProduction && !cronSecret) {
    console.error('[Recovery] CRON_SECRET not configured in production')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {
    stuckGenerating: [] as string[],
    stuckPodcasts: [] as string[],
    stuckVideos: [] as string[],
    failedPodbeanRetries: [] as string[],
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

          // FIX: Keep status as GENERATING (not SCHEDULED) so if pipeline fails,
          // recovery can pick it up again. Increment retryCount to track attempts.
          await prisma.contentItem.update({
            where: { id: item.id },
            data: {
              // Stay in GENERATING - pipeline will update to PUBLISHED or FAILED
              status: 'GENERATING',
              retryCount: item.retryCount + 1,
              lastError: `Recovery attempt ${item.retryCount + 1} started at ${new Date().toISOString()}`,
              updatedAt: new Date(), // Reset updatedAt so we don't immediately retry
            },
          })

          // Run pipeline - properly handle success/failure with atomic status updates
          runContentPipeline(item.id)
            .then(() => {
              console.log(`[Recovery] Pipeline retry succeeded for ${item.id}`)
            })
            .catch(async (err) => {
              console.error(`[Recovery] Pipeline retry failed for ${item.id}:`, err)
              // Mark as FAILED if this was our last attempt
              // Use updateMany with conditional where to avoid race conditions
              try {
                const updated = await prisma.contentItem.updateMany({
                  where: {
                    id: item.id,
                    retryCount: { gte: 3 },
                    // Only update if still in a recoverable state
                    status: { in: ['GENERATING', 'SCHEDULED'] },
                  },
                  data: {
                    status: 'FAILED',
                    lastError: `Pipeline failed after max attempts: ${err instanceof Error ? err.message : String(err)}`,
                  },
                })
                if (updated.count > 0) {
                  console.log(`[Recovery] Marked ${item.id} as FAILED after max retries`)
                }
              } catch (updateErr) {
                console.error(`[Recovery] Failed to update status for ${item.id}:`, updateErr)
              }
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

    // 3. Find videos stuck in PROCESSING for more than 2 hours
    const stuckVideos = await prisma.video.findMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: twoHoursAgo },
      },
      include: {
        contentItem: true,
      },
      take: 10,
    })

    console.log(`[Recovery] Found ${stuckVideos.length} videos stuck in PROCESSING`)

    for (const video of stuckVideos) {
      try {
        // Mark as FAILED so user can retry
        await prisma.video.update({
          where: { id: video.id },
          data: {
            status: 'FAILED',
          },
        })

        // Update content item status
        if (video.contentItem) {
          await prisma.contentItem.update({
            where: { id: video.contentItem.id },
            data: {
              shortVideoGenerated: false,
              lastError: 'Video generation timed out after 2+ hours',
            },
          })
        }

        console.log(`[Recovery] Video ${video.id} marked as FAILED`)
        results.stuckVideos.push(video.id)
      } catch (err) {
        const error = `Error recovering video ${video.id}: ${err}`
        console.error(`[Recovery] ${error}`)
        results.errors.push(error)
      }
    }

    // 4. Find podcasts that have audio but failed to publish to Podbean
    // (status is FAILED but audioUrl exists - these can be retried)
    const failedPodbeanPodcasts = await prisma.podcast.findMany({
      where: {
        status: 'FAILED',
        audioUrl: { not: '' },
        podbeanPlayerUrl: null,
      },
      include: {
        contentItem: {
          include: {
            blogPost: true,
          },
        },
      },
      take: 5,
    })

    console.log(`[Recovery] Found ${failedPodbeanPodcasts.length} podcasts with audio that failed to publish to Podbean`)

    for (const podcast of failedPodbeanPodcasts) {
      try {
        if (!podcast.contentItem?.blogPost) {
          console.log(`[Recovery] Podcast ${podcast.id} has no associated blog post, skipping`)
          continue
        }

        console.log(`[Recovery] Attempting to re-publish podcast ${podcast.id} to Podbean`)

        // Import and call publishToPodbean
        const { publishToPodbean } = await import('@/lib/integrations/podbean')

        const podbeanResult = await publishToPodbean({
          title: podcast.contentItem.blogPost.title,
          description: podcast.description || podcast.contentItem.blogPost.excerpt || '',
          audioUrl: podcast.audioUrl,
        })

        await prisma.podcast.update({
          where: { id: podcast.id },
          data: {
            podbeanEpisodeId: podbeanResult.episodeId,
            podbeanUrl: podbeanResult.url,
            podbeanPlayerUrl: podbeanResult.playerUrl,
            status: 'PUBLISHED',
          },
        })

        console.log(`[Recovery] Podcast ${podcast.id} published to Podbean successfully`)
        results.failedPodbeanRetries.push(`${podcast.id}: published to Podbean`)

        // Also re-run pipeline to embed podcast in blog
        if (podcast.contentItem.status === 'PUBLISHED' && !podcast.contentItem.podcastAddedToPost) {
          const contentId = podcast.contentItem.id
          await prisma.contentItem.update({
            where: { id: contentId },
            data: {
              status: 'GENERATING',
              pipelineStep: 'schema',
            },
          })
          runContentPipeline(contentId).catch(async (err) => {
            console.error(`[Recovery] Embed retry failed for ${contentId}:`, err)
            // Mark as FAILED so it doesn't stay stuck in GENERATING
            try {
              await prisma.contentItem.updateMany({
                where: { id: contentId, status: 'GENERATING' },
                data: {
                  status: 'FAILED',
                  lastError: `Embed retry failed: ${err instanceof Error ? err.message : String(err)}`,
                },
              })
            } catch (updateErr) {
              console.error(`[Recovery] Failed to update status for ${contentId}:`, updateErr)
            }
          })
        }
      } catch (err) {
        const error = `Error retrying Podbean publish for podcast ${podcast.id}: ${err}`
        console.error(`[Recovery] ${error}`)
        results.errors.push(error)
      }
    }

    // 6. Find published content that says podcast is embedded but missing podbeanPlayerUrl
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
          runContentPipeline(item.id).catch(async (err) => {
            console.error(`[Recovery] Pipeline failed for ${item.id}:`, err)
            // Mark as FAILED so it doesn't stay stuck in GENERATING
            try {
              await prisma.contentItem.updateMany({
                where: { id: item.id, status: 'GENERATING' },
                data: {
                  status: 'FAILED',
                  lastError: `Pipeline failed during podcast recovery: ${err instanceof Error ? err.message : String(err)}`,
                },
              })
            } catch (updateErr) {
              console.error(`[Recovery] Failed to update status for ${item.id}:`, updateErr)
            }
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

    // 7. Find content published more than 1 hour ago that should have podcast but doesn't
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
        // Trigger pipeline in background with proper error handling
        runContentPipeline(item.id).catch(async (err) => {
          console.error(`[Recovery] Pipeline embed retry failed for ${item.id}:`, err)
          // Mark as FAILED so it doesn't stay stuck in GENERATING
          try {
            await prisma.contentItem.updateMany({
              where: { id: item.id, status: 'GENERATING' },
              data: {
                status: 'FAILED',
                lastError: `Podcast embed retry failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            })
          } catch (updateErr) {
            console.error(`[Recovery] Failed to update status for ${item.id}:`, updateErr)
          }
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
        stuckVideosFixed: results.stuckVideos.length,
        failedPodbeanRetried: results.failedPodbeanRetries.length,
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
