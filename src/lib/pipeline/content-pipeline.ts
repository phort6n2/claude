import { prisma } from '../db'
import { generateBlogPost, generateSocialCaption, generatePodcastScript, generateWRHQBlogPost, generateWRHQSocialCaption } from '../integrations/claude'
import { generateBothImages } from '../integrations/nano-banana'
import { createPodcast, waitForPodcast } from '../integrations/autocontent'
import { createShortVideo, waitForVideo } from '../integrations/creatify'
import { scheduleSocialPosts } from '../integrations/getlate'
import { createPost, uploadMedia, updatePost, injectSchemaMarkup } from '../integrations/wordpress'
import { uploadFromUrl } from '../integrations/gcs'
import { generateSchemaGraph } from './schema-markup'
import { countWords, retryWithBackoff } from '../utils'
import { decrypt } from '../encryption'
import { getSetting, getWRHQConfig, getWRHQLateAccountIds } from '../settings'

type PipelineStep = 'blog' | 'images' | 'wordpress' | 'wrhq' | 'podcast' | 'videos' | 'social'

interface PipelineContext {
  contentItemId: string
  clientId: string
  step: PipelineStep
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
  }

  try {
    // Update status to generating
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: 'GENERATING', pipelineStep: 'blog' },
    })

    // Step 1: Generate Blog Post
    await logAction(ctx, 'blog_generate', 'STARTED')
    const blogResult = await retryWithBackoff(async () => {
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
      })
    })

    const blogPost = await prisma.blogPost.create({
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
    await logAction(ctx, 'blog_generate', 'SUCCESS')

    // Step 2: Generate Images
    ctx.step = 'images'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'images' },
    })
    await logAction(ctx, 'images_generate', 'STARTED')

    // Build address string
    const address = `${contentItem.client.streetAddress}, ${contentItem.client.city}, ${contentItem.client.state} ${contentItem.client.postalCode}`

    // Get image generation API key from database settings
    const imageApiKey = await getSetting('NANO_BANANA_API_KEY')

    const images = await retryWithBackoff(async () => {
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
    })

    // Upload images to GCS and save to database
    if (images.landscape) {
      const filename = `${contentItem.client.slug}/${blogResult.slug}/landscape.png`
      const gcsResult = await uploadFromUrl(images.landscape.url, filename)

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
      const gcsResult = await uploadFromUrl(images.square.url, filename)

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
    await logAction(ctx, 'images_generate', 'SUCCESS')

    // Step 3: Publish to WordPress
    ctx.step = 'wordpress'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'wordpress' },
    })

    if (contentItem.client.wordpressUrl && contentItem.client.wordpressUsername && contentItem.client.wordpressAppPassword) {
      await logAction(ctx, 'wordpress_publish', 'STARTED')

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
        const wpMedia = await uploadMedia(
          wpCredentials,
          featuredImage.gcsUrl,
          `${blogResult.slug}-featured.jpg`,
          featuredImage.altText || undefined
        )
        featuredImageId = wpMedia.id
      }

      // Generate schema markup
      const schemaJson = generateSchemaGraph({
        client: contentItem.client,
        blogPost: blogPost,
        contentItem,
      })

      // Create WordPress post
      const wpPost = await createPost(wpCredentials, {
        title: blogResult.title,
        slug: blogResult.slug,
        content: blogResult.content,
        excerpt: blogResult.excerpt || undefined,
        status: 'publish',
        featuredMediaId: featuredImageId,
      })

      // Inject schema markup
      await injectSchemaMarkup(wpCredentials, wpPost.id, schemaJson)

      // Update blog post with WordPress info
      await prisma.blogPost.update({
        where: { id: blogPost.id },
        data: {
          wordpressPostId: wpPost.id,
          wordpressUrl: wpPost.link,
          featuredImageId: featuredImageId,
          schemaJson,
          publishedAt: new Date(),
        },
      })

      await logAction(ctx, 'wordpress_publish', 'SUCCESS')
    }

    // Step 3.5: Publish to WRHQ (Dual Publishing)
    ctx.step = 'wrhq'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'wrhq' },
    })

    const wrhqConfig = await getWRHQConfig()
    let wrhqBlogUrl: string | null = null

    if (wrhqConfig.wordpress.isConfigured) {
      await logAction(ctx, 'wrhq_publish', 'STARTED')

      try {
        // Get the client's blog URL
        const clientBlogPost = await prisma.blogPost.findUnique({ where: { contentItemId } })
        const clientBlogUrl = clientBlogPost?.wordpressUrl || ''

        // Get the landscape image for the WRHQ post
        const featuredImageForWrhq = await prisma.image.findFirst({
          where: { contentItemId, imageType: 'BLOG_FEATURED' },
        })

        // Generate WRHQ directory-style blog post
        const wrhqBlogResult = await retryWithBackoff(async () => {
          return generateWRHQBlogPost({
            clientBlogTitle: blogResult.title,
            clientBlogUrl,
            clientBlogExcerpt: blogResult.excerpt,
            clientBusinessName: contentItem.client.businessName,
            clientCity: contentItem.client.city,
            clientState: contentItem.client.state,
            paaQuestion: contentItem.paaQuestion,
            wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || '',
            googleMapsUrl: contentItem.client.googleMapsUrl || '',
            phone: contentItem.client.phone,
            featuredImageUrl: featuredImageForWrhq?.gcsUrl || undefined,
          })
        })

        const wrhqCredentials = {
          url: wrhqConfig.wordpress.url!,
          username: wrhqConfig.wordpress.username!,
          password: wrhqConfig.wordpress.appPassword!,
        }

        // Upload featured image to WRHQ
        const featuredImage = await prisma.image.findFirst({
          where: { contentItemId, imageType: 'BLOG_FEATURED' },
        })

        let wrhqFeaturedImageId: number | undefined
        if (featuredImage) {
          const wrhqMedia = await uploadMedia(
            wrhqCredentials,
            featuredImage.gcsUrl,
            `${contentItem.client.slug}-${blogResult.slug}-featured.jpg`,
            `${blogResult.title} - ${contentItem.client.businessName}`
          )
          wrhqFeaturedImageId = wrhqMedia.id
        }

        // Create WRHQ post
        const wrhqPost = await createPost(wrhqCredentials, {
          title: wrhqBlogResult.title,
          slug: `${contentItem.client.slug}-${wrhqBlogResult.slug}`,
          content: wrhqBlogResult.content,
          excerpt: wrhqBlogResult.excerpt || undefined,
          status: 'publish',
          featuredMediaId: wrhqFeaturedImageId,
        })

        wrhqBlogUrl = wrhqPost.link

        await logAction(ctx, 'wrhq_publish', 'SUCCESS', {
          responseData: JSON.stringify({ wrhqPostId: wrhqPost.id, wrhqUrl: wrhqPost.link }),
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await logAction(ctx, 'wrhq_publish', 'FAILED', { errorMessage })
        console.error('WRHQ publishing failed:', error)
        // Continue with pipeline - WRHQ is optional
      }
    }

    // Step 4: Generate Podcast
    ctx.step = 'podcast'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'podcast' },
    })
    await logAction(ctx, 'podcast_generate', 'STARTED')

    const podcastScript = await generatePodcastScript({
      businessName: contentItem.client.businessName,
      city: contentItem.client.city,
      paaQuestion: contentItem.paaQuestion,
      blogContent: blogResult.content,
      phone: contentItem.client.phone,
      website: contentItem.client.wordpressUrl || '',
    })

    const podcastJob = await createPodcast({
      script: podcastScript,
      title: blogResult.title,
      duration: 'long', // 3-5 min podcasts
    })

    const podcastResult = await waitForPodcast(podcastJob.jobId)

    if (podcastResult.audioUrl) {
      // Upload to GCS
      const podcastFilename = `${contentItem.client.slug}/${blogResult.slug}/podcast.mp3`
      const gcsResult = await uploadFromUrl(podcastResult.audioUrl, podcastFilename)

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

      // Embed podcast in WordPress post
      if (contentItem.client.wordpressUrl && contentItem.client.wordpressUsername && contentItem.client.wordpressAppPassword) {
        const wpCredentials = {
          url: contentItem.client.wordpressUrl,
          username: contentItem.client.wordpressUsername,
          password: contentItem.client.wordpressAppPassword,
        }
        const wpPost = await prisma.blogPost.findUnique({ where: { contentItemId } })
        if (wpPost?.wordpressPostId) {
          const audioEmbed = `\n\n<h2>Listen to This Article</h2>\n<audio controls src="${gcsResult.url}"></audio>\n`
          await updatePost(wpCredentials, wpPost.wordpressPostId, {
            content: blogResult.content + audioEmbed,
          })
        }
      }
    }
    await logAction(ctx, 'podcast_generate', 'SUCCESS')

    // Step 5: Generate Videos
    ctx.step = 'videos'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'videos' },
    })
    await logAction(ctx, 'video_generate', 'STARTED')

    const imageUrls = await prisma.image.findMany({
      where: { contentItemId },
      select: { gcsUrl: true },
    })

    // Generate short video (9:16 for social)
    try {
      const videoJob = await createShortVideo({
        script: podcastScript.substring(0, 500),
        title: blogResult.title,
        imageUrls: imageUrls.map((i: { gcsUrl: string }) => i.gcsUrl),
        aspectRatio: '9:16',
        duration: 60,
      })

      const videoResult = await waitForVideo(videoJob.jobId)

      if (videoResult.videoUrl) {
        const videoFilename = `${contentItem.client.slug}/${blogResult.slug}/video-short.mp4`
        const gcsResult = await uploadFromUrl(videoResult.videoUrl, videoFilename)

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
      }
    } catch (error) {
      console.error('Video generation failed:', error)
      // Continue with pipeline - video is optional
    }
    await logAction(ctx, 'video_generate', 'SUCCESS')

    // Step 6: Schedule Social Posts (Client + WRHQ)
    ctx.step = 'social'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'social' },
    })
    await logAction(ctx, 'social_schedule', 'STARTED')

    const blogPostRecord = await prisma.blogPost.findUnique({ where: { contentItemId } })
    const clientBlogUrl = blogPostRecord?.wordpressUrl || ''

    // Get social images for posts
    const socialImages = await prisma.image.findMany({
      where: {
        contentItemId,
        imageType: { in: ['FACEBOOK', 'INSTAGRAM_FEED', 'TWITTER', 'LINKEDIN', 'TIKTOK'] },
      },
    })
    const mediaUrls = socialImages.map(i => i.gcsUrl)

    // Client Social Posts (if configured)
    const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
    if (contentItem.client.socialPlatforms.length > 0 && socialAccountIds && Object.keys(socialAccountIds).length > 0) {
      // Generate captions for each platform
      const clientCaptions: Record<string, { caption: string; hashtags: string[]; firstComment: string }> = {}

      for (const platform of contentItem.client.socialPlatforms) {
        const captionResult = await generateSocialCaption({
          platform: platform as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
          blogTitle: blogResult.title,
          blogExcerpt: blogResult.excerpt,
          businessName: contentItem.client.businessName,
          blogUrl: clientBlogUrl,
        })
        clientCaptions[platform] = captionResult
      }

      // Calculate social posting time (2-6 hours after blog publish)
      const clientSocialBaseTime = new Date()
      clientSocialBaseTime.setHours(clientSocialBaseTime.getHours() + 2)

      const clientScheduledPosts = await scheduleSocialPosts({
        accountIds: socialAccountIds,
        platforms: contentItem.client.socialPlatforms as ('facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram')[],
        captions: clientCaptions,
        mediaUrls,
        mediaType: 'image',
        baseTime: clientSocialBaseTime,
      })

      // Save client social posts to database
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
    }

    // WRHQ Social Posts (always schedule if configured)
    const wrhqLateAccountIds = await getWRHQLateAccountIds()
    if (Object.keys(wrhqLateAccountIds).length > 0 && wrhqBlogUrl) {
      await logAction(ctx, 'wrhq_social_schedule', 'STARTED')

      try {
        const wrhqPlatforms = wrhqConfig.socialMedia.enabledPlatforms.filter(
          p => wrhqLateAccountIds[p]
        ) as ('facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram')[]

        // Generate WRHQ captions for each platform
        const wrhqCaptions: Record<string, { caption: string; hashtags: string[]; firstComment: string }> = {}

        // Skip video platforms until video generation is added
        const VIDEO_PLATFORMS = ['tiktok', 'youtube']
        const filteredPlatforms = wrhqPlatforms.filter(p => !VIDEO_PLATFORMS.includes(p))

        for (const platform of filteredPlatforms) {
          const captionResult = await generateWRHQSocialCaption({
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
          })
          wrhqCaptions[platform] = captionResult
        }

        // WRHQ posts scheduled 4-8 hours after client posts
        const wrhqSocialBaseTime = new Date()
        wrhqSocialBaseTime.setHours(wrhqSocialBaseTime.getHours() + 6)

        const wrhqScheduledPosts = await scheduleSocialPosts({
          accountIds: wrhqLateAccountIds,
          platforms: wrhqPlatforms,
          captions: wrhqCaptions,
          mediaUrls,
          mediaType: 'image',
          baseTime: wrhqSocialBaseTime,
        })

        // Log WRHQ social posts (not saved to client's database, just logged)
        await logAction(ctx, 'wrhq_social_schedule', 'SUCCESS', {
          responseData: JSON.stringify({
            scheduledPosts: wrhqScheduledPosts.length,
            platforms: wrhqPlatforms,
          }),
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await logAction(ctx, 'wrhq_social_schedule', 'FAILED', { errorMessage })
        console.error('WRHQ social scheduling failed:', error)
        // Continue - WRHQ social is optional
      }
    }

    await logAction(ctx, 'social_schedule', 'SUCCESS')

    // Mark as published
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: {
        status: 'PUBLISHED',
        pipelineStep: null,
        publishedAt: new Date(),
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

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
