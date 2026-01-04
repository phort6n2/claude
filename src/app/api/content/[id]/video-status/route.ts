import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { prisma } from '@/lib/db'
import { checkVideoStatus } from '@/lib/integrations/creatify'
import { uploadFromUrl } from '@/lib/integrations/gcs'
import { uploadVideoFromUrl, generateVideoDescription, generateVideoTags, isYouTubeConfigured } from '@/lib/integrations/youtube'
import { postNowAndCheckStatus } from '@/lib/integrations/getlate'
import { getWRHQLateAccountIds } from '@/lib/settings'
import { generateSchemaGraph } from '@/lib/pipeline/schema-markup'
import { updatePost, getPost } from '@/lib/integrations/wordpress'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Generate embeds (matching pipeline functions)
function generatePodcastEmbed(title: string, playerUrl: string): string {
  return `<!-- Podcast Episode -->
<div class="podcast-embed" style="margin: 30px 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
  <h4 style="margin: 0 0 15px 0; color: white; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">🎙️ Listen to This Article</h4>
  <iframe src="${playerUrl}" width="100%" height="150" style="border: none; border-radius: 8px;"></iframe>
</div>`
}

function generateGoogleMapsEmbed(params: {
  businessName: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  googleMapsUrl?: string | null
}): string {
  // Create a search query from the address
  const addressQuery = encodeURIComponent(
    `${params.businessName}, ${params.streetAddress}, ${params.city}, ${params.state} ${params.postalCode}`
  )

  // Use the embedded maps URL format (no API key needed)
  const embedUrl = `https://www.google.com/maps?q=${addressQuery}&output=embed`

  return `<!-- Google Maps Embed -->
<div class="google-maps-embed" style="margin: 30px 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <iframe
      src="${embedUrl}"
      width="100%"
      height="100%"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
      allowfullscreen=""
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
      title="Map showing ${params.businessName} location">
    </iframe>
  </div>
</div>`
}

function generateShortVideoEmbed(youtubeUrl: string): string | null {
  let videoId: string | null = null
  try {
    const url = new URL(youtubeUrl)
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.includes('/shorts/')) {
        videoId = url.pathname.split('/shorts/')[1]?.split('?')[0]
      } else {
        videoId = url.searchParams.get('v')
      }
    } else if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.slice(1).split('?')[0]
    }
  } catch {
    return null
  }

  if (!videoId) return null

  return `<!-- YouTube Short Video -->
<style>
.yt-shorts-embed {
  float: right !important;
  width: 280px;
  margin: 0 0 20px 25px !important;
  shape-outside: margin-box;
}
.yt-shorts-embed .video-wrapper {
  position: relative;
  padding-bottom: 177.78%;
  height: 0;
  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.yt-shorts-embed iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 12px;
}
@media (max-width: 600px) {
  .yt-shorts-embed {
    float: none !important;
    width: 100%;
    max-width: 320px;
    margin: 20px auto !important;
  }
}
</style>
<div class="yt-shorts-embed">
  <div class="video-wrapper">
    <iframe
      src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1"
      title="Watch on YouTube"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen>
    </iframe>
  </div>
</div>`
}

// Complete remaining pipeline steps after video is ready (or failed)
// videoUrl can be null if video generation failed - we'll still run schema/embed
async function completeRemainingPipeline(contentItemId: string, videoUrl: string | null, thumbnailUrl: string | null, duration: number | null) {
  console.log(`[VideoStatus] Starting post-video pipeline completion for ${contentItemId}`, { hasVideo: !!videoUrl })

  try {
    // Get content item with client data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id: contentItemId },
      include: {
        client: true,
        blogPost: true,
        podcast: true,
      },
    })

    if (!contentItem) {
      console.error('[VideoStatus] Content item not found')
      return
    }

    // Get video record (may not exist or may have failed)
    const video = await prisma.video.findFirst({
      where: { contentItemId, videoType: 'SHORT' },
    })

    // Track YouTube URL for embedding (may come from existing post or new upload)
    let youtubeVideoUrl: string | null = null
    let gcsUrl: string | null = video?.videoUrl || null

    // Only run video-related steps if we have a video URL
    if (videoUrl) {
      // Step 1: Upload to GCS if not already done
      if (!gcsUrl?.includes('storage.googleapis.com')) {
        console.log('[VideoStatus] Uploading video to GCS...')
        try {
          const videoFilename = `videos/${contentItem.clientId}/short-${contentItemId}-${Date.now()}.mp4`
          const gcsResult = await uploadFromUrl(videoUrl, videoFilename)
          gcsUrl = gcsResult.url

          if (video) {
            await prisma.video.update({
              where: { id: video.id },
              data: {
                videoUrl: gcsUrl,
                thumbnailUrl: thumbnailUrl,
                duration: duration,
                status: 'READY',
              },
            })
          }
          console.log('[VideoStatus] Video uploaded to GCS:', gcsUrl)
        } catch (gcsError) {
          console.error('[VideoStatus] GCS upload failed:', gcsError)
          // Continue with Creatify URL
          gcsUrl = videoUrl
        }
      }

      // Step 2: Upload to YouTube if configured and not already done
      const existingYoutubePost = await prisma.wRHQSocialPost.findFirst({
        where: {
          contentItemId,
          platform: 'YOUTUBE',
          mediaType: 'video',
        },
      })

      if (!existingYoutubePost) {
        const youtubeConfigured = await isYouTubeConfigured()
        if (youtubeConfigured) {
          console.log('[VideoStatus] Uploading video to YouTube...')
          try {
            const youtubeResult = await uploadVideoFromUrl(gcsUrl || videoUrl, {
              title: contentItem.blogPost?.title || contentItem.paaQuestion,
              description: generateVideoDescription({
                paaQuestion: contentItem.paaQuestion,
                clientBlogUrl: contentItem.blogPost?.wordpressUrl || '',
                wrhqBlogUrl: '',
                googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
                wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || undefined,
                podbeanUrl: contentItem.podcast?.podbeanUrl || undefined,
                businessName: contentItem.client.businessName,
                city: contentItem.client.city,
                state: contentItem.client.state,
              }),
              tags: generateVideoTags({
                businessName: contentItem.client.businessName,
                city: contentItem.client.city,
                state: contentItem.client.state,
                paaQuestion: contentItem.paaQuestion,
              }),
              playlistId: contentItem.client.wrhqYoutubePlaylistId || undefined,
              privacyStatus: 'public',
            })

            youtubeVideoUrl = youtubeResult.videoUrl

            // Update video status
            if (video) {
              await prisma.video.update({
                where: { id: video.id },
                data: { status: 'PUBLISHED' },
              })
            }

            // Create WRHQ social post record
            await prisma.wRHQSocialPost.create({
              data: {
                contentItemId,
                platform: 'YOUTUBE',
                caption: contentItem.blogPost?.title || contentItem.paaQuestion,
                hashtags: [],
                mediaType: 'video',
                mediaUrls: [gcsUrl || videoUrl],
                scheduledTime: new Date(),
                publishedUrl: youtubeResult.videoUrl,
                status: 'PUBLISHED',
                publishedAt: new Date(),
              },
            })

            console.log('[VideoStatus] Video uploaded to YouTube:', youtubeResult.videoUrl)
          } catch (youtubeError) {
            console.error('[VideoStatus] YouTube upload failed:', youtubeError)
          }
        }
      } else {
        youtubeVideoUrl = existingYoutubePost.publishedUrl
      }

      // Step 3: Post to WRHQ TikTok and Instagram via Late
      const wrhqVideoAccountIds = await getWRHQLateAccountIds()
      const VIDEO_PLATFORMS = ['tiktok', 'instagram'] as const

      for (const platform of VIDEO_PLATFORMS) {
        const platformUpper = platform.toUpperCase() as 'TIKTOK' | 'INSTAGRAM'
        const existingPost = await prisma.wRHQSocialPost.findFirst({
          where: {
            contentItemId,
            platform: platformUpper,
            mediaType: 'video',
          },
        })

        if (existingPost) continue // Already posted

        const accountId = wrhqVideoAccountIds[platform]
        if (!accountId) {
          console.log(`[VideoStatus] WRHQ ${platform} not configured - skipping`)
          continue
        }

        const videoCaption = `${contentItem.blogPost?.title || contentItem.paaQuestion}\n\n${contentItem.client.businessName} in ${contentItem.client.city}, ${contentItem.client.state} answers: "${contentItem.paaQuestion}"\n\n#AutoGlass #WindshieldRepair #${contentItem.client.city.replace(/\s+/g, '')} #CarCare`

        try {
          console.log(`[VideoStatus] Posting video to WRHQ ${platform}...`)
          const postResult = await postNowAndCheckStatus({
            accountId,
            platform: platform as 'tiktok' | 'instagram',
            caption: videoCaption,
            mediaUrls: [gcsUrl || videoUrl],
            mediaType: 'video',
          })

          await prisma.wRHQSocialPost.create({
            data: {
              contentItemId,
              platform: platform.toUpperCase() as 'TIKTOK' | 'INSTAGRAM',
              caption: videoCaption,
              hashtags: ['AutoGlass', 'WindshieldRepair', contentItem.client.city.replace(/\s+/g, ''), 'CarCare'],
              mediaType: 'video',
              mediaUrls: [gcsUrl || videoUrl],
              scheduledTime: new Date(),
              getlatePostId: postResult.postId,
              publishedUrl: postResult.platformPostUrl,
              status: postResult.status === 'published' ? 'PUBLISHED' : postResult.status === 'failed' ? 'FAILED' : 'PROCESSING',
              publishedAt: postResult.status === 'published' ? new Date() : undefined,
            },
          })

          console.log(`[VideoStatus] Video posted to WRHQ ${platform}:`, postResult.status)
        } catch (postError) {
          const errorMsg = postError instanceof Error ? postError.message : String(postError)
          console.error(`[VideoStatus] Failed to post to ${platform}:`, errorMsg)

          // Save failed post record
          try {
            await prisma.wRHQSocialPost.create({
              data: {
                contentItemId,
                platform: platform.toUpperCase() as 'TIKTOK' | 'INSTAGRAM',
                caption: videoCaption,
                hashtags: ['AutoGlass', 'WindshieldRepair', contentItem.client.city.replace(/\s+/g, ''), 'CarCare'],
                mediaType: 'video',
                mediaUrls: [gcsUrl || videoUrl],
                scheduledTime: new Date(),
                status: 'FAILED',
                errorMessage: errorMsg.substring(0, 500),
              },
            })
          } catch (dbError) {
            console.error('[VideoStatus] Failed to save failed post record:', dbError)
          }
        }
      }
    } else {
      console.log('[VideoStatus] No video URL - skipping video upload steps, proceeding to schema')
      // Check if there's an existing YouTube post we should use for embedding
      const existingYoutubePost = await prisma.wRHQSocialPost.findFirst({
        where: {
          contentItemId,
          platform: 'YOUTUBE',
          mediaType: 'video',
        },
      })
      if (existingYoutubePost?.publishedUrl) {
        youtubeVideoUrl = existingYoutubePost.publishedUrl
      }
    }

    // Step 4: Run schema generation and embedding (runs regardless of video status)
    const blogPost = contentItem.blogPost
    if (blogPost && blogPost.wordpressPostId && contentItem.client.wordpressUrl) {
      console.log('[VideoStatus] Starting schema generation and embedding...')
      try {
        // Generate schema
        const schemaJson = generateSchemaGraph({
          client: {
            businessName: contentItem.client.businessName,
            streetAddress: contentItem.client.streetAddress,
            city: contentItem.client.city,
            state: contentItem.client.state,
            postalCode: contentItem.client.postalCode,
            country: contentItem.client.country || 'US',
            phone: contentItem.client.phone,
            email: contentItem.client.email || '',
            logoUrl: contentItem.client.logoUrl,
            wordpressUrl: contentItem.client.wordpressUrl,
            serviceAreas: contentItem.client.serviceAreas,
            gbpRating: contentItem.client.gbpRating,
            gbpReviewCount: contentItem.client.gbpReviewCount,
            hasAdasCalibration: contentItem.client.hasAdasCalibration,
            offersMobileService: contentItem.client.offersMobileService,
          },
          blogPost: {
            title: blogPost.title,
            slug: blogPost.slug,
            content: blogPost.content,
            excerpt: blogPost.excerpt,
            metaDescription: blogPost.metaDescription,
            wordpressUrl: blogPost.wordpressUrl,
            publishedAt: blogPost.publishedAt,
          },
          contentItem: {
            paaQuestion: contentItem.paaQuestion,
          },
          podcast: contentItem.podcast ? { audioUrl: contentItem.podcast.audioUrl, duration: contentItem.podcast.duration } : undefined,
          video: (gcsUrl || videoUrl) ? { videoUrl: gcsUrl || videoUrl!, thumbnailUrl, duration } : undefined,
        })

        // Save schema to blog post
        await prisma.blogPost.update({
          where: { id: blogPost.id },
          data: { schemaJson },
        })
        console.log('[VideoStatus] Schema generated and saved')

        // Fetch WordPress content and embed all media
        const wpCredentials = {
          url: contentItem.client.wordpressUrl,
          username: contentItem.client.wordpressUsername || '',
          password: contentItem.client.wordpressAppPassword || '',
        }

        const currentPost = await getPost(wpCredentials, blogPost.wordpressPostId)
        let fullContent = currentPost.content

        // Remove existing embeds to prevent duplicates
        fullContent = fullContent.replace(/<!-- JSON-LD Schema \d+ -->[\s\S]*?<\/script>/g, '')
        fullContent = fullContent.replace(/<!-- JSON-LD Schema Markup -->[\s\S]*?<\/script>/g, '')
        fullContent = fullContent.replace(/<!-- YouTube Short Video -->[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="yt-shorts-embed">[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<!-- Podcast Episode -->[\s\S]*?<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="podcast-embed"[\s\S]*?<\/div>/g, '')
        fullContent = fullContent.replace(/<!-- Google Maps Embed -->[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="google-maps-embed"[\s\S]*?<\/div>\s*<\/div>/g, '')

        const embedded: string[] = []

        // Add schema at the beginning
        const schemaEmbed = `<!-- JSON-LD Schema Markup -->
<script type="application/ld+json">
${schemaJson}
</script>
`
        fullContent = schemaEmbed + fullContent
        embedded.push('schema')

        // Add video embed near the start if we have YouTube URL
        if (youtubeVideoUrl) {
          const videoEmbed = generateShortVideoEmbed(youtubeVideoUrl)
          if (videoEmbed) {
            const firstH2 = fullContent.indexOf('<h2')
            if (firstH2 > 0) {
              fullContent = fullContent.slice(0, firstH2) + videoEmbed + fullContent.slice(firstH2)
            } else {
              fullContent = videoEmbed + fullContent
            }
            embedded.push('short-video')
          }
        }

        // Add podcast embed at the end if published to Podbean
        if (contentItem.podcast?.podbeanPlayerUrl) {
          const podcastEmbed = generatePodcastEmbed(blogPost.title, contentItem.podcast.podbeanPlayerUrl)
          fullContent = fullContent + podcastEmbed
          embedded.push('podcast')
        }

        // Add Google Maps embed at the very end
        if (contentItem.client.streetAddress && contentItem.client.city && contentItem.client.state) {
          const mapsEmbed = generateGoogleMapsEmbed({
            businessName: contentItem.client.businessName,
            streetAddress: contentItem.client.streetAddress,
            city: contentItem.client.city,
            state: contentItem.client.state,
            postalCode: contentItem.client.postalCode,
            googleMapsUrl: contentItem.client.googleMapsUrl,
          })
          fullContent = fullContent + mapsEmbed
          embedded.push('google-maps')
        }

        // Update WordPress with all embeds
        await updatePost(wpCredentials, blogPost.wordpressPostId, { content: fullContent })
        console.log('[VideoStatus] All media embedded in WordPress:', embedded)

        // Update tracking flags
        if (embedded.includes('podcast')) {
          await prisma.contentItem.update({
            where: { id: contentItemId },
            data: { podcastAddedToPost: true, podcastAddedAt: new Date() },
          })
        }
        if (embedded.includes('short-video')) {
          await prisma.contentItem.update({
            where: { id: contentItemId },
            data: { shortVideoAddedToPost: true, shortVideoAddedAt: new Date() },
          })
        }

        // Mark schema as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { schemaGenerated: true },
        })

        console.log('[VideoStatus] Schema and embedding complete')
      } catch (schemaError) {
        console.error('[VideoStatus] Schema/embedding failed:', schemaError)
      }
    } else {
      console.log('[VideoStatus] Schema/embed skipped - missing requirements:', {
        hasBlogPost: !!blogPost,
        hasWordpressPostId: !!blogPost?.wordpressPostId,
        hasClientWordpressUrl: !!contentItem.client.wordpressUrl,
      })
    }

    // Mark content item as complete
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        status: 'PUBLISHED',
        pipelineStep: null,
      },
    })

    console.log(`[VideoStatus] Pipeline completion finished for ${contentItemId}`)
  } catch (error) {
    console.error('[VideoStatus] Pipeline completion failed:', error)
  }
}

// Check and update short video status
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Find the SHORT video for this content item
    const video = await prisma.video.findFirst({
      where: {
        contentItemId: id,
        videoType: 'SHORT',
      },
    })

    if (!video) {
      return NextResponse.json({ status: 'not_found' })
    }

    // If already PUBLISHED (fully processed), just return
    if (video.status === 'PUBLISHED' && video.videoUrl) {
      return NextResponse.json({
        status: 'published',
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
      })
    }

    // If READY (video done but not fully processed), check if pipeline needs completion
    if (video.status === 'READY' && video.videoUrl) {
      // Check if pipeline completion is needed - must wait for BOTH video AND podcast
      const contentItem = await prisma.contentItem.findUnique({
        where: { id },
        select: { schemaGenerated: true, podcastGenerated: true },
      })

      // If schema not generated AND podcast is done (or not configured), trigger pipeline completion
      // Podcast being done means podcastGenerated is true OR there's a failed/ready podcast record
      if (contentItem && !contentItem.schemaGenerated) {
        // Check if podcast is still processing
        const podcast = await prisma.podcast.findFirst({
          where: { contentItemId: id },
        })

        const podcastDone = !podcast || podcast.status === 'READY' || podcast.status === 'PUBLISHED' || podcast.status === 'FAILED' || contentItem.podcastGenerated

        if (!podcastDone) {
          console.log('[VideoStatus] Video READY but podcast still processing - waiting for podcast')
          return NextResponse.json({
            status: 'ready',
            videoUrl: video.videoUrl,
            thumbnailUrl: video.thumbnailUrl,
            duration: video.duration,
            message: 'Waiting for podcast to complete before running schema...',
          })
        }

        console.log('[VideoStatus] Video READY and podcast done - triggering pipeline completion')
        after(async () => {
          await completeRemainingPipeline(id, video.videoUrl!, video.thumbnailUrl || null, video.duration || null)
        })

        return NextResponse.json({
          status: 'ready',
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          duration: video.duration,
          message: 'Completing remaining pipeline steps...',
        })
      }

      return NextResponse.json({
        status: 'ready',
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
      })
    }

    // If FAILED, check if schema still needs to run (but wait for podcast too)
    if (video.status === 'FAILED') {
      const contentItem = await prisma.contentItem.findUnique({
        where: { id },
        select: { schemaGenerated: true, podcastGenerated: true },
      })

      if (contentItem && !contentItem.schemaGenerated) {
        // Check if podcast is still processing
        const podcast = await prisma.podcast.findFirst({
          where: { contentItemId: id },
        })

        const podcastDone = !podcast || podcast.status === 'READY' || podcast.status === 'PUBLISHED' || podcast.status === 'FAILED' || contentItem.podcastGenerated

        if (!podcastDone) {
          console.log('[VideoStatus] Video FAILED but podcast still processing - waiting for podcast')
          return NextResponse.json({
            status: 'failed',
            message: 'Waiting for podcast to complete before running schema...',
          })
        }

        console.log('[VideoStatus] Video FAILED and podcast done - triggering schema generation')
        after(async () => {
          await completeRemainingPipeline(id, null, null, null)
        })

        return NextResponse.json({
          status: 'failed',
          message: 'Video failed, running schema generation...',
        })
      }

      return NextResponse.json({ status: 'failed' })
    }

    // If processing, check with Creatify API
    if (video.status === 'PROCESSING' && video.providerJobId) {
      try {
        const result = await checkVideoStatus(video.providerJobId)

        if (result.status === 'completed' && result.videoUrl) {
          // Update video record with completed data
          await prisma.video.update({
            where: { id: video.id },
            data: {
              videoUrl: result.videoUrl,
              thumbnailUrl: result.thumbnailUrl || null,
              duration: result.duration || null,
              status: 'READY',
            },
          })

          // Update content item
          await prisma.contentItem.update({
            where: { id },
            data: {
              shortVideoGenerated: true,
              shortVideoStatus: 'ready',
            },
          })

          // Check if podcast is done before triggering schema (schema needs podcast URLs)
          const contentItemForPodcast = await prisma.contentItem.findUnique({
            where: { id },
            select: { podcastGenerated: true },
          })
          const podcast = await prisma.podcast.findFirst({
            where: { contentItemId: id },
          })
          const podcastDone = !podcast || podcast.status === 'READY' || podcast.status === 'PUBLISHED' || podcast.status === 'FAILED' || contentItemForPodcast?.podcastGenerated

          if (podcastDone) {
            // Use after() to complete the remaining pipeline steps in the background
            // This runs YouTube upload, social posting, and schema generation
            after(async () => {
              await completeRemainingPipeline(id, result.videoUrl!, result.thumbnailUrl || null, result.duration || null)
            })

            return NextResponse.json({
              status: 'ready',
              videoUrl: result.videoUrl,
              thumbnailUrl: result.thumbnailUrl,
              duration: result.duration,
              message: 'Video ready, completing remaining pipeline steps...',
            })
          } else {
            console.log('[VideoStatus] Video completed but podcast still processing - waiting for podcast')
            return NextResponse.json({
              status: 'ready',
              videoUrl: result.videoUrl,
              thumbnailUrl: result.thumbnailUrl,
              duration: result.duration,
              message: 'Video ready, waiting for podcast before schema...',
            })
          }
        }

        if (result.status === 'failed') {
          await prisma.video.update({
            where: { id: video.id },
            data: { status: 'FAILED' },
          })

          await prisma.contentItem.update({
            where: { id },
            data: { shortVideoStatus: 'failed' },
          })

          // Still run schema generation even if video failed, but wait for podcast
          const contentItemForSchema = await prisma.contentItem.findUnique({
            where: { id },
            select: { schemaGenerated: true, podcastGenerated: true },
          })

          if (contentItemForSchema && !contentItemForSchema.schemaGenerated) {
            // Check if podcast is done
            const podcast = await prisma.podcast.findFirst({
              where: { contentItemId: id },
            })
            const podcastDone = !podcast || podcast.status === 'READY' || podcast.status === 'PUBLISHED' || podcast.status === 'FAILED' || contentItemForSchema.podcastGenerated

            if (podcastDone) {
              console.log('[VideoStatus] Video failed and podcast done - running schema generation')
              after(async () => {
                await completeRemainingPipeline(id, null, null, null)
              })
              return NextResponse.json({ status: 'failed', message: 'Video failed, running schema generation...' })
            } else {
              console.log('[VideoStatus] Video failed but podcast still processing - waiting for podcast')
              return NextResponse.json({ status: 'failed', message: 'Video failed, waiting for podcast before schema...' })
            }
          }

          return NextResponse.json({ status: 'failed' })
        }

        // Still processing
        return NextResponse.json({ status: 'processing' })
      } catch (error) {
        console.error('Error checking video status:', error)
        return NextResponse.json({ status: 'processing', error: String(error) })
      }
    }

    return NextResponse.json({ status: video.status?.toLowerCase() || 'unknown' })
  } catch (error) {
    console.error('Failed to check video status:', error)
    return NextResponse.json(
      { error: 'Failed to check video status' },
      { status: 500 }
    )
  }
}
