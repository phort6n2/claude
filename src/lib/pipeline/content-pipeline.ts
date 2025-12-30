import { prisma } from '../db'
import { generateBlogPost, generateSocialCaption, generatePodcastScript } from '../integrations/claude'
import { generateAllImageSizes } from '../integrations/nano-banana'
import { createPodcast, waitForPodcast } from '../integrations/autocontent'
import { createShortVideo, waitForVideo } from '../integrations/creatify'
import { scheduleSocialPosts } from '../integrations/getlate'
import { createPost, uploadMedia, updatePost, injectSchemaMarkup } from '../integrations/wordpress'
import { uploadFromUrl } from '../integrations/gcs'
import { generateSchemaGraph } from './schema-markup'
import { countWords, retryWithBackoff } from '../utils'
import { decrypt } from '../encryption'

type PipelineStep = 'blog' | 'images' | 'wordpress' | 'podcast' | 'videos' | 'social'

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
        locationPageUrls: contentItem.client.locationPages.map(p => p.url),
        ctaText: contentItem.client.ctaText,
        ctaUrl: contentItem.client.ctaUrl || contentItem.client.wordpressUrl || '',
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

    const images = await retryWithBackoff(async () => {
      return generateAllImageSizes({
        topic: contentItem.topic || contentItem.paaQuestion,
        blogTitle: blogResult.title,
        businessName: contentItem.client.businessName,
        city: contentItem.client.city,
        brandColors: {
          primary: contentItem.client.primaryColor || '#1e40af',
          secondary: contentItem.client.secondaryColor || '#3b82f6',
          accent: contentItem.client.accentColor || '#f59e0b',
        },
      })
    })

    // Upload images to GCS and save to database
    for (const [imageType, imageResult] of Object.entries(images)) {
      const filename = `${contentItem.client.slug}/${blogResult.slug}/${imageType.toLowerCase()}.jpg`
      const gcsResult = await uploadFromUrl(imageResult.url, filename)

      await prisma.image.create({
        data: {
          contentItemId,
          clientId: contentItem.clientId,
          imageType: imageType as 'BLOG_FEATURED' | 'FACEBOOK' | 'INSTAGRAM_FEED' | 'INSTAGRAM_STORY' | 'TWITTER' | 'LINKEDIN' | 'TIKTOK',
          fileName: filename,
          gcsUrl: gcsResult.url,
          width: imageResult.width,
          height: imageResult.height,
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
      length: 'short',
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
        imageUrls: imageUrls.map(i => i.gcsUrl),
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

    // Step 6: Schedule Social Posts
    ctx.step = 'social'
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { pipelineStep: 'social' },
    })
    await logAction(ctx, 'social_schedule', 'STARTED')

    if (contentItem.client.socialPlatforms.length > 0 && contentItem.client.getlateAccountId) {
      const blogPostRecord = await prisma.blogPost.findUnique({ where: { contentItemId } })
      const blogUrl = blogPostRecord?.wordpressUrl || ''

      // Generate captions for each platform
      const captions: Record<string, { caption: string; hashtags: string[]; firstComment: string }> = {}

      for (const platform of contentItem.client.socialPlatforms) {
        const captionResult = await generateSocialCaption({
          platform: platform as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok',
          blogTitle: blogResult.title,
          blogExcerpt: blogResult.excerpt,
          businessName: contentItem.client.businessName,
          blogUrl,
        })
        captions[platform] = captionResult
      }

      // Get appropriate media for social posts
      const socialImages = await prisma.image.findMany({
        where: {
          contentItemId,
          imageType: { in: ['FACEBOOK', 'INSTAGRAM_FEED', 'TWITTER', 'LINKEDIN', 'TIKTOK'] },
        },
      })

      // Calculate social posting time (2-6 hours after blog publish)
      const socialBaseTime = new Date()
      socialBaseTime.setHours(socialBaseTime.getHours() + 2)

      const scheduledPosts = await scheduleSocialPosts({
        accountId: contentItem.client.getlateAccountId,
        platforms: contentItem.client.socialPlatforms as ('facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok')[],
        captions,
        mediaUrls: socialImages.map(i => i.gcsUrl),
        mediaType: 'image',
        baseTime: socialBaseTime,
      })

      // Save social posts to database
      for (const post of scheduledPosts) {
        await prisma.socialPost.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            platform: post.platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP',
            caption: captions[post.platform]?.caption || '',
            hashtags: captions[post.platform]?.hashtags || [],
            firstComment: captions[post.platform]?.firstComment,
            scheduledTime: post.scheduledTime,
            getlatePostId: post.postId,
            status: 'SCHEDULED',
          },
        })
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
