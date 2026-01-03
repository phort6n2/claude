import { prisma } from '../db'
import { generateBlogPost, generateSocialCaption, generatePodcastScript, generateWRHQBlogPost, generateWRHQSocialCaption } from '../integrations/claude'
import { generateBothImages } from '../integrations/nano-banana'
import { createPodcast, waitForPodcast } from '../integrations/autocontent'
import { createShortVideo, waitForVideo } from '../integrations/creatify'
import { scheduleSocialPosts } from '../integrations/getlate'
import { createPost, uploadMedia, updatePost, injectSchemaMarkup } from '../integrations/wordpress'
import { uploadFromUrl } from '../integrations/gcs'
import { generateSchemaGraph } from './schema-markup'
import { countWords, retryWithBackoff, withTimeout, TimeoutError } from '../utils'
import { decrypt } from '../encryption'
import { getSetting, getWRHQConfig, getWRHQLateAccountIds } from '../settings'

// Timeout constants (in milliseconds)
const TIMEOUTS = {
  BLOG_GENERATION: 90_000,      // 90 seconds for Claude blog generation
  IMAGE_GENERATION: 120_000,    // 2 minutes for image generation
  WORDPRESS_UPLOAD: 60_000,     // 60 seconds for WP media upload
  WORDPRESS_POST: 60_000,       // 60 seconds for WP post creation
  PODCAST_CREATE: 30_000,       // 30 seconds to start podcast job
  PODCAST_WAIT: 180_000,        // 3 minutes max to wait for podcast
  VIDEO_CREATE: 30_000,         // 30 seconds to start video job
  VIDEO_WAIT: 180_000,          // 3 minutes max to wait for video
  SOCIAL_CAPTION: 30_000,       // 30 seconds for caption generation
  SOCIAL_SCHEDULE: 60_000,      // 60 seconds for scheduling
  GCS_UPLOAD: 60_000,           // 60 seconds for GCS upload
}

type PipelineStep = 'blog' | 'images' | 'wordpress' | 'wrhq' | 'podcast' | 'videos' | 'social'

interface PipelineContext {
  contentItemId: string
  clientId: string
  step: PipelineStep
  clientName: string
}

interface StepResult {
  success: boolean
  error?: string
  skipped?: boolean
}

function log(ctx: PipelineContext, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const prefix = `[Pipeline:${ctx.step}] [${ctx.clientName}]`
  if (data) {
    console.log(`${timestamp} ${prefix} ${message}`, JSON.stringify(data))
  } else {
    console.log(`${timestamp} ${prefix} ${message}`)
  }
}

function logError(ctx: PipelineContext, message: string, error: unknown) {
  const timestamp = new Date().toISOString()
  const prefix = `[Pipeline:${ctx.step}] [${ctx.clientName}]`
  const errorMsg = error instanceof Error ? error.message : String(error)
  const isTimeout = error instanceof TimeoutError
  console.error(`${timestamp} ${prefix} ${message}: ${errorMsg}${isTimeout ? ' (TIMEOUT)' : ''}`)
}

async function logAction(
  ctx: PipelineContext,
  action: string,
  status: 'STARTED' | 'SUCCESS' | 'FAILED',
  details?: { requestPayload?: string; responseData?: string; errorMessage?: string }
) {
  await prisma.publishingLog.create({
    data: {
      contentItemId: ctx.contentItemId,
      clientId: ctx.clientId,
      action,
      status,
      requestPayload: details?.requestPayload,
      responseData: details?.responseData,
      errorMessage: details?.errorMessage,
      startedAt: new Date(),
    },
  })
}

async function updatePipelineStep(contentItemId: string, step: PipelineStep) {
  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { pipelineStep: step },
  })
}

export async function runContentPipeline(contentItemId: string): Promise<void> {
  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      client: {
        include: {
          servicePages: true,
          locationPages: true,
        },
      },
    },
  })

  if (!contentItem) {
    throw new Error(`Content item ${contentItemId} not found`)
  }

  const ctx: PipelineContext = {
    contentItemId,
    clientId: contentItem.clientId,
    step: 'blog',
    clientName: contentItem.client.businessName,
  }

  log(ctx, '🚀 Starting content pipeline', { paaQuestion: contentItem.paaQuestion })

  // Track what succeeded for final status
  const results: Record<PipelineStep, StepResult> = {
    blog: { success: false },
    images: { success: false },
    wordpress: { success: false, skipped: true },
    wrhq: { success: false, skipped: true },
    podcast: { success: false },
    videos: { success: false },
    social: { success: false, skipped: true },
  }

  let blogResult: { title: string; slug: string; content: string; excerpt: string; metaTitle: string; metaDescription: string; focusKeyword: string } | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let blogPost: any = null
  let podcastScript: string = ''
  let wrhqBlogUrl: string | null = null

  try {
    // Update status to generating
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: 'GENERATING', pipelineStep: 'blog' },
    })

    // ============ STEP 1: Generate Blog Post ============
    ctx.step = 'blog'
    log(ctx, '📝 Starting blog generation...')
    await logAction(ctx, 'blog_generate', 'STARTED')

    try {
      blogResult = await withTimeout(
        retryWithBackoff(async () => {
          return generateBlogPost({
            businessName: contentItem.client.businessName,
            city: contentItem.client.city,
            state: contentItem.client.state,
            hasAdas: contentItem.client.hasAdasCalibration,
            serviceAreas: contentItem.client.serviceAreas,
            brandVoice: contentItem.client.brandVoice || 'Professional and helpful',
            paaQuestion: contentItem.paaQuestion,
            servicePageUrl: contentItem.client.servicePages[0]?.url,
            locationPageUrls: contentItem.client.locationPages.map((p: { url: string }) => p.url),
            ctaText: contentItem.client.ctaText,
            ctaUrl: contentItem.client.ctaUrl || contentItem.client.wordpressUrl || '',
            phone: contentItem.client.phone,
            website: contentItem.client.ctaUrl || contentItem.client.wordpressUrl || '',
            googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
          })
        }),
        TIMEOUTS.BLOG_GENERATION,
        'Blog generation'
      )

      blogPost = await prisma.blogPost.create({
        data: {
          contentItemId,
          clientId: contentItem.clientId,
          title: blogResult.title,
          slug: blogResult.slug,
          content: blogResult.content,
          excerpt: blogResult.excerpt,
          metaTitle: blogResult.metaTitle,
          metaDescription: blogResult.metaDescription,
          focusKeyword: blogResult.focusKeyword,
          wordCount: countWords(blogResult.content),
        },
      })

      results.blog = { success: true }
      log(ctx, '✅ Blog generated successfully', { title: blogResult.title, wordCount: countWords(blogResult.content) })
      await logAction(ctx, 'blog_generate', 'SUCCESS')

      // Mark blog as generated
      await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { blogGenerated: true },
      })
    } catch (error) {
      logError(ctx, 'Blog generation failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logAction(ctx, 'blog_generate', 'FAILED', { errorMessage })
      results.blog = { success: false, error: errorMessage }
      // Blog is critical - throw to stop pipeline
      throw error
    }

    // ============ STEP 2: Generate Images ============
    ctx.step = 'images'
    await updatePipelineStep(contentItemId, 'images')
    log(ctx, '🖼️ Starting image generation...')
    await logAction(ctx, 'images_generate', 'STARTED')

    try {
      const address = `${contentItem.client.streetAddress}, ${contentItem.client.city}, ${contentItem.client.state} ${contentItem.client.postalCode}`
      const imageApiKey = await getSetting('NANO_BANANA_API_KEY')

      const images = await withTimeout(
        retryWithBackoff(async () => {
          return generateBothImages({
            businessName: contentItem.client.businessName,
            city: contentItem.client.city,
            state: contentItem.client.state,
            paaQuestion: contentItem.paaQuestion,
            phone: contentItem.client.phone,
            website: contentItem.client.ctaUrl || contentItem.client.wordpressUrl || '',
            address: address,
            apiKey: imageApiKey || '',
          })
        }),
        TIMEOUTS.IMAGE_GENERATION,
        'Image generation'
      )

      // Upload images to GCS
      if (images.landscape) {
        const filename = `${contentItem.client.slug}/${blogResult.slug}/landscape.png`
        const gcsResult = await withTimeout(
          uploadFromUrl(images.landscape.url, filename),
          TIMEOUTS.GCS_UPLOAD,
          'GCS landscape upload'
        )

        await prisma.image.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            imageType: 'BLOG_FEATURED',
            fileName: filename,
            gcsUrl: gcsResult.url,
            width: images.landscape.width,
            height: images.landscape.height,
            altText: `${blogResult.title} - ${contentItem.client.businessName}`,
          },
        })
      }

      if (images.square) {
        const filename = `${contentItem.client.slug}/${blogResult.slug}/square.png`
        const gcsResult = await withTimeout(
          uploadFromUrl(images.square.url, filename),
          TIMEOUTS.GCS_UPLOAD,
          'GCS square upload'
        )

        await prisma.image.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            imageType: 'INSTAGRAM_FEED',
            fileName: filename,
            gcsUrl: gcsResult.url,
            width: images.square.width,
            height: images.square.height,
            altText: `${blogResult.title} - ${contentItem.client.businessName}`,
          },
        })
      }

      results.images = { success: true }
      log(ctx, '✅ Images generated and uploaded successfully')
      await logAction(ctx, 'images_generate', 'SUCCESS')

      // Mark images as generated
      await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { imagesGenerated: true },
      })
    } catch (error) {
      logError(ctx, 'Image generation failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logAction(ctx, 'images_generate', 'FAILED', { errorMessage })
      results.images = { success: false, error: errorMessage }
      // Images are critical - throw to stop pipeline
      throw error
    }

    // ============ STEP 3: Publish to WordPress ============
    ctx.step = 'wordpress'
    await updatePipelineStep(contentItemId, 'wordpress')

    if (contentItem.client.wordpressUrl && contentItem.client.wordpressUsername && contentItem.client.wordpressAppPassword) {
      results.wordpress.skipped = false
      log(ctx, '📤 Starting WordPress publishing...')
      await logAction(ctx, 'wordpress_publish', 'STARTED')

      try {
        const wpCredentials = {
          url: contentItem.client.wordpressUrl,
          username: contentItem.client.wordpressUsername,
          password: contentItem.client.wordpressAppPassword,
        }

        // Upload featured image
        const featuredImage = await prisma.image.findFirst({
          where: { contentItemId, imageType: 'BLOG_FEATURED' },
        })

        let featuredImageId: number | undefined
        if (featuredImage) {
          log(ctx, 'Uploading featured image to WordPress...', {
            gcsUrl: featuredImage.gcsUrl,
            fileName: `${blogResult.slug}-featured.jpg`
          })
          try {
            const wpMedia = await withTimeout(
              uploadMedia(
                wpCredentials,
                featuredImage.gcsUrl,
                `${blogResult.slug}-featured.jpg`,
                featuredImage.altText || undefined
              ),
              TIMEOUTS.WORDPRESS_UPLOAD,
              'WordPress media upload'
            )
            featuredImageId = wpMedia.id
            log(ctx, '✅ Featured image uploaded', { wpMediaId: featuredImageId })
          } catch (imageError) {
            logError(ctx, 'Featured image upload failed', imageError)
            // Continue without featured image
          }
        } else {
          log(ctx, '⚠️ No BLOG_FEATURED image found in database')
        }

        // Generate schema markup
        const schemaJson = generateSchemaGraph({
          client: contentItem.client,
          blogPost: blogPost!,
          contentItem,
        })

        // Create WordPress post
        log(ctx, 'Creating WordPress post...')
        const wpPost = await withTimeout(
          createPost(wpCredentials, {
            title: blogResult.title,
            slug: blogResult.slug,
            content: blogResult.content,
            excerpt: blogResult.excerpt || undefined,
            status: 'publish',
            featuredMediaId: featuredImageId,
          }),
          TIMEOUTS.WORDPRESS_POST,
          'WordPress post creation'
        )

        // Inject schema markup
        await withTimeout(
          injectSchemaMarkup(wpCredentials, wpPost.id, schemaJson),
          TIMEOUTS.WORDPRESS_POST,
          'WordPress schema injection'
        )

        // Update blog post with WordPress info
        await prisma.blogPost.update({
          where: { id: blogPost!.id },
          data: {
            wordpressPostId: wpPost.id,
            wordpressUrl: wpPost.link,
            featuredImageId: featuredImageId,
            schemaJson,
            publishedAt: new Date(),
          },
        })

        results.wordpress = { success: true }
        log(ctx, '✅ WordPress publishing successful', { postId: wpPost.id, url: wpPost.link })
        await logAction(ctx, 'wordpress_publish', 'SUCCESS')

        // Mark client blog as published and schema as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: {
            clientBlogPublished: true,
            clientBlogUrl: wpPost.link,
            schemaGenerated: true,
          },
        })
      } catch (error) {
        logError(ctx, 'WordPress publishing failed', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await logAction(ctx, 'wordpress_publish', 'FAILED', { errorMessage })
        results.wordpress = { success: false, error: errorMessage }
        // WordPress is important but not critical - continue
        log(ctx, '⚠️ Continuing without WordPress...')
      }
    } else {
      log(ctx, '⏭️ WordPress not configured - skipping')
    }

    // Critical checkpoint - if this doesn't appear in logs, pipeline exited early
    console.log(`🔴🔴🔴 CHECKPOINT: WordPress step complete, proceeding to WRHQ for ${contentItemId}`)

    // ============ STEP 3.5: Publish to WRHQ ============
    ctx.step = 'wrhq'
    await updatePipelineStep(contentItemId, 'wrhq')

    const wrhqConfig = await getWRHQConfig()

    log(ctx, '🔍 Checking WRHQ config...', {
      isConfigured: wrhqConfig.wordpress.isConfigured,
      hasUrl: !!wrhqConfig.wordpress.url,
      hasUsername: !!wrhqConfig.wordpress.username,
      hasPassword: !!wrhqConfig.wordpress.appPassword,
    })

    if (wrhqConfig.wordpress.isConfigured) {
      results.wrhq.skipped = false
      log(ctx, '📤 Starting WRHQ publishing...')
      await logAction(ctx, 'wrhq_publish', 'STARTED')

      try {
        const clientBlogPost = await prisma.blogPost.findUnique({ where: { contentItemId } })
        const clientBlogUrl = clientBlogPost?.wordpressUrl || ''
        log(ctx, 'Client blog URL for WRHQ:', { clientBlogUrl })

        const featuredImageForWrhq = await prisma.image.findFirst({
          where: { contentItemId, imageType: 'BLOG_FEATURED' },
        })

        // Generate WRHQ blog post
        log(ctx, '🤖 Generating WRHQ blog content with Claude...')
        const wrhqBlogResult = await withTimeout(
          retryWithBackoff(async () => {
            return generateWRHQBlogPost({
              clientBlogTitle: blogResult!.title,
              clientBlogUrl,
              clientBlogExcerpt: blogResult!.excerpt,
              clientBusinessName: contentItem.client.businessName,
              clientCity: contentItem.client.city,
              clientState: contentItem.client.state,
              paaQuestion: contentItem.paaQuestion,
              wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || '',
              googleMapsUrl: contentItem.client.googleMapsUrl || '',
              phone: contentItem.client.phone,
              featuredImageUrl: featuredImageForWrhq?.gcsUrl || undefined,
            })
          }),
          TIMEOUTS.BLOG_GENERATION,
          'WRHQ blog generation'
        )
        log(ctx, '✅ WRHQ blog content generated', { title: wrhqBlogResult.title })

        const wrhqCredentials = {
          url: wrhqConfig.wordpress.url!,
          username: wrhqConfig.wordpress.username!,
          password: wrhqConfig.wordpress.appPassword!,
          isDecrypted: true, // Password from settings is already decrypted
        }

        // Upload featured image to WRHQ
        const featuredImage = await prisma.image.findFirst({
          where: { contentItemId, imageType: 'BLOG_FEATURED' },
        })

        let wrhqFeaturedImageId: number | undefined
        if (featuredImage) {
          const wrhqMedia = await withTimeout(
            uploadMedia(
              wrhqCredentials,
              featuredImage.gcsUrl,
              `${contentItem.client.slug}-${blogResult!.slug}-featured.jpg`,
              `${blogResult!.title} - ${contentItem.client.businessName}`
            ),
            TIMEOUTS.WORDPRESS_UPLOAD,
            'WRHQ media upload'
          )
          wrhqFeaturedImageId = wrhqMedia.id
        }

        // Create WRHQ post
        const wrhqPost = await withTimeout(
          createPost(wrhqCredentials, {
            title: wrhqBlogResult.title,
            slug: `${contentItem.client.slug}-${wrhqBlogResult.slug}`,
            content: wrhqBlogResult.content,
            excerpt: wrhqBlogResult.excerpt || undefined,
            status: 'publish',
            featuredMediaId: wrhqFeaturedImageId,
          }),
          TIMEOUTS.WORDPRESS_POST,
          'WRHQ post creation'
        )

        wrhqBlogUrl = wrhqPost.link

        results.wrhq = { success: true }
        log(ctx, '✅ WRHQ publishing successful', { url: wrhqPost.link })
        await logAction(ctx, 'wrhq_publish', 'SUCCESS', {
          responseData: JSON.stringify({ wrhqPostId: wrhqPost.id, wrhqUrl: wrhqPost.link }),
        })

        // Mark WRHQ blog as generated and published
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: {
            wrhqBlogGenerated: true,
            wrhqBlogPublished: true,
            wrhqBlogUrl: wrhqPost.link,
          },
        })
      } catch (error) {
        logError(ctx, 'WRHQ publishing failed', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await logAction(ctx, 'wrhq_publish', 'FAILED', { errorMessage })
        results.wrhq = { success: false, error: errorMessage }
        log(ctx, '⚠️ Continuing without WRHQ...')
      }
    } else {
      log(ctx, '⏭️ WRHQ not configured - skipping')
    }

    // ============ STEP 4: Generate Podcast ============
    ctx.step = 'podcast'
    await updatePipelineStep(contentItemId, 'podcast')
    log(ctx, '🎙️ Starting podcast generation...')
    await logAction(ctx, 'podcast_generate', 'STARTED')

    try {
      podcastScript = await withTimeout(
        generatePodcastScript({
          businessName: contentItem.client.businessName,
          city: contentItem.client.city,
          paaQuestion: contentItem.paaQuestion,
          blogContent: blogResult!.content,
          phone: contentItem.client.phone,
          website: contentItem.client.wordpressUrl || '',
        }),
        TIMEOUTS.BLOG_GENERATION,
        'Podcast script generation'
      )

      log(ctx, 'Creating podcast job...')
      const podcastJob = await withTimeout(
        createPodcast({
          script: podcastScript,
          title: blogResult!.title,
          duration: 'long',
        }),
        TIMEOUTS.PODCAST_CREATE,
        'Podcast job creation'
      )

      log(ctx, 'Waiting for podcast to render...', { jobId: podcastJob.jobId })
      const podcastResult = await withTimeout(
        waitForPodcast(podcastJob.jobId),
        TIMEOUTS.PODCAST_WAIT,
        'Podcast rendering'
      )

      if (podcastResult.audioUrl) {
        const podcastFilename = `${contentItem.client.slug}/${blogResult!.slug}/podcast.mp3`
        const gcsResult = await withTimeout(
          uploadFromUrl(podcastResult.audioUrl, podcastFilename),
          TIMEOUTS.GCS_UPLOAD,
          'Podcast GCS upload'
        )

        await prisma.podcast.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            audioUrl: gcsResult.url,
            duration: podcastResult.duration,
            script: podcastScript,
            autocontentJobId: podcastJob.jobId,
            status: 'READY',
          },
        })

        // Embed podcast in WordPress post if published
        if (contentItem.client.wordpressUrl && contentItem.client.wordpressUsername && contentItem.client.wordpressAppPassword && results.wordpress.success) {
          try {
            const wpCredentials = {
              url: contentItem.client.wordpressUrl,
              username: contentItem.client.wordpressUsername,
              password: contentItem.client.wordpressAppPassword,
            }
            const wpPost = await prisma.blogPost.findUnique({ where: { contentItemId } })
            if (wpPost?.wordpressPostId) {
              const audioEmbed = `\n\n<h2>Listen to This Article</h2>\n<audio controls src="${gcsResult.url}"></audio>\n`
              await withTimeout(
                updatePost(wpCredentials, wpPost.wordpressPostId, {
                  content: blogResult!.content + audioEmbed,
                }),
                TIMEOUTS.WORDPRESS_POST,
                'WordPress podcast embed'
              )
              log(ctx, 'Podcast embedded in WordPress post')
            }
          } catch (embedError) {
            logError(ctx, 'Failed to embed podcast in WordPress', embedError)
            // Non-critical, continue
          }
        }

        results.podcast = { success: true }
        log(ctx, '✅ Podcast generated successfully', { duration: podcastResult.duration })

        // Mark podcast as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { podcastGenerated: true },
        })
      }
      await logAction(ctx, 'podcast_generate', 'SUCCESS')
    } catch (error) {
      logError(ctx, 'Podcast generation failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logAction(ctx, 'podcast_generate', 'FAILED', { errorMessage })
      results.podcast = { success: false, error: errorMessage }
      log(ctx, '⚠️ Continuing without podcast...')
    }

    // ============ STEP 5: Generate Videos ============
    ctx.step = 'videos'
    await updatePipelineStep(contentItemId, 'videos')
    log(ctx, '🎬 Starting video generation...')
    await logAction(ctx, 'video_generate', 'STARTED')

    try {
      const imageUrls = await prisma.image.findMany({
        where: { contentItemId },
        select: { gcsUrl: true },
      })

      const scriptForVideo = podcastScript || blogResult!.excerpt || blogResult!.title

      log(ctx, 'Creating short video job...')
      const videoJob = await withTimeout(
        createShortVideo({
          script: scriptForVideo.substring(0, 500),
          title: blogResult!.title,
          imageUrls: imageUrls.map((i: { gcsUrl: string }) => i.gcsUrl),
          aspectRatio: '9:16',
          duration: 60,
        }),
        TIMEOUTS.VIDEO_CREATE,
        'Video job creation'
      )

      log(ctx, 'Waiting for video to render...', { jobId: videoJob.jobId })
      const videoResult = await withTimeout(
        waitForVideo(videoJob.jobId),
        TIMEOUTS.VIDEO_WAIT,
        'Video rendering'
      )

      if (videoResult.videoUrl) {
        const videoFilename = `${contentItem.client.slug}/${blogResult!.slug}/video-short.mp4`
        const gcsResult = await withTimeout(
          uploadFromUrl(videoResult.videoUrl, videoFilename),
          TIMEOUTS.GCS_UPLOAD,
          'Video GCS upload'
        )

        await prisma.video.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            videoType: 'SHORT',
            videoUrl: gcsResult.url,
            thumbnailUrl: videoResult.thumbnailUrl,
            duration: videoResult.duration,
            aspectRatio: '9:16',
            provider: 'CREATIFY',
            providerJobId: videoJob.jobId,
            status: 'READY',
          },
        })

        results.videos = { success: true }
        log(ctx, '✅ Video generated successfully', { duration: videoResult.duration })

        // Mark short video as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { shortVideoGenerated: true },
        })
      }
      await logAction(ctx, 'video_generate', 'SUCCESS')
    } catch (error) {
      logError(ctx, 'Video generation failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logAction(ctx, 'video_generate', 'FAILED', { errorMessage })
      results.videos = { success: false, error: errorMessage }
      log(ctx, '⚠️ Continuing without video...')
    }

    // ============ STEP 6: Schedule Social Posts ============
    ctx.step = 'social'
    await updatePipelineStep(contentItemId, 'social')
    log(ctx, '📱 Starting social scheduling...')
    await logAction(ctx, 'social_schedule', 'STARTED')

    const blogPostRecord = await prisma.blogPost.findUnique({ where: { contentItemId } })
    const clientBlogUrl = blogPostRecord?.wordpressUrl || ''

    const socialImages = await prisma.image.findMany({
      where: {
        contentItemId,
        imageType: { in: ['FACEBOOK', 'INSTAGRAM_FEED', 'TWITTER', 'LINKEDIN', 'TIKTOK'] },
      },
    })
    const mediaUrls = socialImages.map(i => i.gcsUrl)

    // Client Social Posts
    const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
    if (contentItem.client.socialPlatforms.length > 0 && socialAccountIds && Object.keys(socialAccountIds).length > 0) {
      results.social.skipped = false
      log(ctx, 'Scheduling client social posts...', { platforms: contentItem.client.socialPlatforms })

      try {
        const clientCaptions: Record<string, { caption: string; hashtags: string[]; firstComment: string }> = {}

        for (const platform of contentItem.client.socialPlatforms) {
          const captionResult = await withTimeout(
            generateSocialCaption({
              platform: platform as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
              blogTitle: blogResult!.title,
              blogExcerpt: blogResult!.excerpt,
              businessName: contentItem.client.businessName,
              blogUrl: clientBlogUrl,
            }),
            TIMEOUTS.SOCIAL_CAPTION,
            `${platform} caption generation`
          )
          clientCaptions[platform] = captionResult
        }

        const clientSocialBaseTime = new Date()
        clientSocialBaseTime.setHours(clientSocialBaseTime.getHours() + 2)

        const clientScheduledPosts = await withTimeout(
          scheduleSocialPosts({
            accountIds: socialAccountIds,
            platforms: contentItem.client.socialPlatforms as ('facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram')[],
            captions: clientCaptions,
            mediaUrls,
            mediaType: 'image',
            baseTime: clientSocialBaseTime,
          }),
          TIMEOUTS.SOCIAL_SCHEDULE,
          'Client social scheduling'
        )

        for (const post of clientScheduledPosts) {
          await prisma.socialPost.create({
            data: {
              contentItemId,
              clientId: contentItem.clientId,
              platform: post.platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
              caption: clientCaptions[post.platform]?.caption || '',
              hashtags: clientCaptions[post.platform]?.hashtags || [],
              firstComment: clientCaptions[post.platform]?.firstComment,
              scheduledTime: post.scheduledTime,
              getlatePostId: post.postId,
              status: 'SCHEDULED',
            },
          })
        }

        results.social = { success: true }
        log(ctx, '✅ Client social posts scheduled', { count: clientScheduledPosts.length })

        // Mark social as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { socialGenerated: true },
        })
      } catch (error) {
        logError(ctx, 'Client social scheduling failed', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.social = { success: false, error: errorMessage }
      }
    } else {
      log(ctx, '⏭️ Client social not configured - skipping')
    }

    // WRHQ Social Posts
    const wrhqLateAccountIds = await getWRHQLateAccountIds()
    if (Object.keys(wrhqLateAccountIds).length > 0 && wrhqBlogUrl) {
      log(ctx, 'Scheduling WRHQ social posts...')
      await logAction(ctx, 'wrhq_social_schedule', 'STARTED')

      try {
        const wrhqPlatforms = wrhqConfig.socialMedia.enabledPlatforms.filter(
          p => wrhqLateAccountIds[p]
        ) as ('facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram')[]

        const wrhqCaptions: Record<string, { caption: string; hashtags: string[]; firstComment: string }> = {}
        const VIDEO_PLATFORMS = ['tiktok', 'youtube']
        const filteredPlatforms = wrhqPlatforms.filter(p => !VIDEO_PLATFORMS.includes(p))

        for (const platform of filteredPlatforms) {
          const captionResult = await withTimeout(
            generateWRHQSocialCaption({
              platform,
              clientBusinessName: contentItem.client.businessName,
              clientCity: contentItem.client.city,
              clientState: contentItem.client.state,
              paaQuestion: contentItem.paaQuestion,
              wrhqBlogUrl: wrhqBlogUrl,
              clientBlogUrl,
              wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || undefined,
              googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
              clientWebsite: contentItem.client.wordpressUrl || undefined,
            }),
            TIMEOUTS.SOCIAL_CAPTION,
            `WRHQ ${platform} caption generation`
          )
          wrhqCaptions[platform] = captionResult
        }

        const wrhqSocialBaseTime = new Date()
        wrhqSocialBaseTime.setHours(wrhqSocialBaseTime.getHours() + 6)

        const wrhqScheduledPosts = await withTimeout(
          scheduleSocialPosts({
            accountIds: wrhqLateAccountIds,
            platforms: wrhqPlatforms,
            captions: wrhqCaptions,
            mediaUrls,
            mediaType: 'image',
            baseTime: wrhqSocialBaseTime,
          }),
          TIMEOUTS.SOCIAL_SCHEDULE,
          'WRHQ social scheduling'
        )

        log(ctx, '✅ WRHQ social posts scheduled', { count: wrhqScheduledPosts.length })
        await logAction(ctx, 'wrhq_social_schedule', 'SUCCESS', {
          responseData: JSON.stringify({
            scheduledPosts: wrhqScheduledPosts.length,
            platforms: wrhqPlatforms,
          }),
        })

        // Mark WRHQ social as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { wrhqSocialGenerated: true },
        })
      } catch (error) {
        logError(ctx, 'WRHQ social scheduling failed', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await logAction(ctx, 'wrhq_social_schedule', 'FAILED', { errorMessage })
      }
    }

    await logAction(ctx, 'social_schedule', 'SUCCESS')

    // ============ FINALIZE ============
    const criticalSuccess = results.blog.success && results.images.success
    const hasWordPress = results.wordpress.success || results.wordpress.skipped

    // Determine final status
    let finalStatus: 'PUBLISHED' | 'REVIEW' = 'PUBLISHED'
    if (!hasWordPress) {
      finalStatus = 'REVIEW' // Needs manual WordPress publishing
    }

    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        status: finalStatus,
        pipelineStep: null,
        publishedAt: finalStatus === 'PUBLISHED' ? new Date() : undefined,
      },
    })

    // Log final summary
    log(ctx, '🏁 Pipeline complete!', {
      status: finalStatus,
      results: {
        blog: results.blog.success ? '✅' : '❌',
        images: results.images.success ? '✅' : '❌',
        wordpress: results.wordpress.skipped ? '⏭️' : (results.wordpress.success ? '✅' : '❌'),
        wrhq: results.wrhq.skipped ? '⏭️' : (results.wrhq.success ? '✅' : '❌'),
        podcast: results.podcast.success ? '✅' : '❌',
        videos: results.videos.success ? '✅' : '❌',
        social: results.social.skipped ? '⏭️' : (results.social.success ? '✅' : '❌'),
      },
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logError(ctx, '💥 Pipeline failed critically', error)
    await logAction(ctx, `${ctx.step}_error`, 'FAILED', { errorMessage })

    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        status: 'FAILED',
        lastError: errorMessage,
        retryCount: { increment: 1 },
      },
    })

    throw error
  }
}

export async function retryFailedContent(contentItemId: string): Promise<void> {
  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
  })

  if (!contentItem || contentItem.status !== 'FAILED') {
    throw new Error('Content item not found or not in failed state')
  }

  if (contentItem.retryCount >= 3) {
    throw new Error('Maximum retry attempts exceeded')
  }

  await runContentPipeline(contentItemId)
}
