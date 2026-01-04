import { prisma } from '../db'
import { generateBlogPost, generateSocialCaption, generatePodcastScript, generateWRHQBlogPost, generateWRHQSocialCaption } from '../integrations/claude'
import { generateBothImages } from '../integrations/nano-banana'
import { createPodcast, waitForPodcast } from '../integrations/autocontent'
import { createShortVideo, waitForVideo } from '../integrations/creatify'
import { postNowAndCheckStatus } from '../integrations/getlate'
import { createPost, uploadMedia, updatePost, getPost } from '../integrations/wordpress'
import { uploadFromUrl } from '../integrations/gcs'
import { generateSchemaGraph } from './schema-markup'
import { countWords, retryWithBackoff, withTimeout, TimeoutError } from '../utils'
import { decrypt } from '../encryption'
import { getSetting, getWRHQConfig, getWRHQLateAccountIds } from '../settings'
import { publishToPodbean } from '../integrations/podbean'
import { uploadVideoFromUrl, generateVideoDescription, generateVideoTags, isYouTubeConfigured } from '../integrations/youtube'

// Timeout constants (in milliseconds)
const TIMEOUTS = {
  BLOG_GENERATION: 90_000,      // 90 seconds for Claude blog generation
  IMAGE_GENERATION: 120_000,    // 2 minutes for image generation
  WORDPRESS_UPLOAD: 60_000,     // 60 seconds for WP media upload
  WORDPRESS_POST: 60_000,       // 60 seconds for WP post creation
  PODCAST_CREATE: 30_000,       // 30 seconds to start podcast job
  PODCAST_WAIT: 1_800_000,      // 30 minutes max to wait for podcast (takes a long time)
  PODBEAN_PUBLISH: 120_000,     // 2 minutes for Podbean publishing
  VIDEO_CREATE: 30_000,         // 30 seconds to start video job
  VIDEO_WAIT: 600_000,          // 10 minutes max to wait for video
  YOUTUBE_UPLOAD: 300_000,      // 5 minutes for YouTube upload
  SOCIAL_CAPTION: 30_000,       // 30 seconds for caption generation
  SOCIAL_SCHEDULE: 60_000,      // 60 seconds for scheduling
  GCS_UPLOAD: 60_000,           // 60 seconds for GCS upload
}

// ============ Embed Helper Functions (matching embed-all-media route) ============

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

  // Use the embedded maps URL format
  const embedUrl = `https://www.google.com/maps?q=${addressQuery}&output=embed`

  return `<!-- Google Maps Embed -->
<div class="google-maps-embed" style="margin: 30px 0;">
  <h3 style="margin: 0 0 15px 0; font-size: 1.25rem;">📍 Find ${params.businessName}</h3>
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
  ${params.googleMapsUrl ? `
  <p style="margin: 15px 0 0 0; text-align: center;">
    <a href="${params.googleMapsUrl}" target="_blank" rel="noopener" style="color: #4285f4; text-decoration: none; font-weight: 500;">
      Open in Google Maps →
    </a>
  </p>` : ''}
</div>`
}

function generateSchemaEmbed(schemaJson: string): string {
  try {
    const schema = JSON.parse(schemaJson)
    return `<!-- JSON-LD Schema Markup -->
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`
  } catch {
    return `<!-- JSON-LD Schema Markup -->
<script type="application/ld+json">
${schemaJson}
</script>`
  }
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

function generatePodcastEmbed(title: string, playerUrl: string): string {
  return `
<!-- Podcast Episode -->
<div class="podcast-embed" style="margin: 30px 0;">
  <h3>🎧 Listen to This Episode</h3>
  <iframe
    title="${title}"
    allowtransparency="true"
    height="150"
    width="100%"
    style="border: none; min-width: min(100%, 430px);height:150px;"
    scrolling="no"
    data-name="pb-iframe-player"
    src="${playerUrl}&from=pb6admin&share=1&download=1&rtl=0&fonts=Arial&skin=1&font-color=&logo_link=episode_page&btn-skin=7"
    loading="lazy"
  ></iframe>
</div>`
}

// Insert featured image after the 3rd H2 heading in the blog content
function insertImageAfterThirdH2(content: string, imageUrl: string, altText: string): string {
  // Find all H2 headings
  const h2Regex = /<h2[^>]*>.*?<\/h2>/gi
  const matches = [...content.matchAll(h2Regex)]

  if (matches.length >= 3) {
    // Get the position right after the 3rd H2
    const thirdH2 = matches[2]
    const insertPosition = thirdH2.index! + thirdH2[0].length

    const imageHtml = `
<!-- Featured Image -->
<figure class="featured-image-inline" style="margin: 30px 0;">
  <img src="${imageUrl}" alt="${altText}" style="width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" loading="lazy" />
</figure>`

    return content.slice(0, insertPosition) + imageHtml + content.slice(insertPosition)
  }

  // If fewer than 3 H2s, just return original content
  return content
}

type PipelineStep = 'blog' | 'images' | 'wordpress' | 'wrhq' | 'podcast' | 'videos' | 'social' | 'schema'

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
    schema: { success: false },
  }

  let blogResult: { title: string; slug: string; content: string; excerpt: string; metaTitle: string; metaDescription: string; focusKeyword: string } | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let blogPost: any = null
  let podcastScript: string = ''
  let wrhqBlogUrl: string | null = null
  let wrhqWordpressPostId: number | null = null

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

        // Prepare blog content with inline image and Google Maps embed
        let blogContent = blogResult.content

        // Insert the 16:9 featured image after the 3rd H2 heading
        if (featuredImage) {
          blogContent = insertImageAfterThirdH2(
            blogContent,
            featuredImage.gcsUrl,
            `${blogResult.title} - ${contentItem.client.businessName}`
          )
          log(ctx, '📸 Inserted featured image after 3rd H2')
        }

        // Add Google Maps embed at the end
        if (contentItem.client.streetAddress && contentItem.client.city && contentItem.client.state) {
          const mapsEmbed = generateGoogleMapsEmbed({
            businessName: contentItem.client.businessName,
            streetAddress: contentItem.client.streetAddress,
            city: contentItem.client.city,
            state: contentItem.client.state,
            postalCode: contentItem.client.postalCode,
            googleMapsUrl: contentItem.client.googleMapsUrl,
          })
          blogContent = blogContent + mapsEmbed
          log(ctx, '📍 Added Google Maps embed to blog')
        }

        // Create WordPress post (schema will be added later after all content is created)
        log(ctx, 'Creating WordPress post...')
        const wpPost = await withTimeout(
          createPost(wpCredentials, {
            title: blogResult.title,
            slug: blogResult.slug,
            content: blogContent,
            excerpt: blogResult.excerpt || undefined,
            status: 'publish',
            featuredMediaId: featuredImageId,
          }),
          TIMEOUTS.WORDPRESS_POST,
          'WordPress post creation'
        )

        // Update blog post with WordPress info
        await prisma.blogPost.update({
          where: { id: blogPost!.id },
          data: {
            wordpressPostId: wpPost.id,
            wordpressUrl: wpPost.link,
            featuredImageId: featuredImageId,
            publishedAt: new Date(),
          },
        })

        results.wordpress = { success: true }
        log(ctx, '✅ WordPress publishing successful', { postId: wpPost.id, url: wpPost.link })
        await logAction(ctx, 'wordpress_publish', 'SUCCESS')

        // Mark client blog as published
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: {
            clientBlogPublished: true,
            clientBlogUrl: wpPost.link,
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

        // Add Google Maps embed to WRHQ blog content
        let wrhqBlogContent = wrhqBlogResult.content
        if (contentItem.client.streetAddress && contentItem.client.city && contentItem.client.state) {
          const wrhqMapsEmbed = generateGoogleMapsEmbed({
            businessName: contentItem.client.businessName,
            streetAddress: contentItem.client.streetAddress,
            city: contentItem.client.city,
            state: contentItem.client.state,
            postalCode: contentItem.client.postalCode,
            googleMapsUrl: contentItem.client.googleMapsUrl,
          })
          wrhqBlogContent = wrhqBlogContent + wrhqMapsEmbed
          log(ctx, '📍 Added Google Maps embed to WRHQ blog')
        }

        // Create WRHQ post
        const wrhqPost = await withTimeout(
          createPost(wrhqCredentials, {
            title: wrhqBlogResult.title,
            slug: `${contentItem.client.slug}-${wrhqBlogResult.slug}`,
            content: wrhqBlogContent,
            excerpt: wrhqBlogResult.excerpt || undefined,
            status: 'publish',
            featuredMediaId: wrhqFeaturedImageId,
          }),
          TIMEOUTS.WORDPRESS_POST,
          'WRHQ post creation'
        )

        wrhqBlogUrl = wrhqPost.link
        wrhqWordpressPostId = wrhqPost.id

        // Save WRHQ blog post to database
        await prisma.wRHQBlogPost.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            title: wrhqBlogResult.title,
            slug: `${contentItem.client.slug}-${wrhqBlogResult.slug}`,
            content: wrhqBlogContent,
            excerpt: wrhqBlogResult.excerpt || null,
            wordpressPostId: wrhqPost.id,
            wordpressUrl: wrhqPost.link,
            featuredImageUrl: featuredImage?.gcsUrl || null,
            publishedAt: new Date(),
          },
        })

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

    // ============ STEP 4: Schedule Social Posts ============
    // (Moved BEFORE podcast/video to match manual flow)
    ctx.step = 'social'
    await updatePipelineStep(contentItemId, 'social')
    log(ctx, '📱 Starting social posting...')
    await logAction(ctx, 'social_post', 'STARTED')

    const blogPostRecord = await prisma.blogPost.findUnique({ where: { contentItemId } })
    const clientBlogUrl = blogPostRecord?.wordpressUrl || ''

    // Get both image types for platform-specific selection
    const landscapeImage = await prisma.image.findFirst({
      where: { contentItemId, imageType: 'BLOG_FEATURED' },
    })
    const squareImage = await prisma.image.findFirst({
      where: { contentItemId, imageType: 'INSTAGRAM_FEED' },
    })

    // Helper to get the right image for each platform
    const getMediaUrlsForPlatform = (platform: string): string[] => {
      // Instagram uses 1:1 square image only
      if (platform === 'instagram') {
        return squareImage ? [squareImage.gcsUrl] : (landscapeImage ? [landscapeImage.gcsUrl] : [])
      }
      // All other platforms (Facebook, LinkedIn, Twitter, GBP, etc.) use 16:9 landscape only
      return landscapeImage ? [landscapeImage.gcsUrl] : (squareImage ? [squareImage.gcsUrl] : [])
    }

    // Client Social Posts
    const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
    if (contentItem.client.socialPlatforms.length > 0 && socialAccountIds && Object.keys(socialAccountIds).length > 0) {
      results.social.skipped = false
      log(ctx, 'Posting client social posts...', { platforms: contentItem.client.socialPlatforms })

      try {
        const clientPostedPosts: Array<{ platform: string; postId: string; status: string; publishedUrl?: string }> = []

        // Post to each platform immediately (not scheduled)
        for (const platform of contentItem.client.socialPlatforms) {
          const accountId = socialAccountIds[platform]
          if (!accountId) continue

          // Get platform-specific image
          const platformMediaUrls = getMediaUrlsForPlatform(platform)

          // Generate caption for this platform
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

          // Format caption with hashtags
          let fullCaption = captionResult.caption
          if (captionResult.hashtags && captionResult.hashtags.length > 0) {
            fullCaption = `${captionResult.caption}\n\n${captionResult.hashtags.map(h => `#${h}`).join(' ')}`
          }

          // Add Google Maps link for GBP posts
          if (platform === 'gbp' && contentItem.client.googleMapsUrl) {
            fullCaption = `${fullCaption}\n\n📍 Find us on Google Maps: ${contentItem.client.googleMapsUrl}`
          }

          // Post immediately
          log(ctx, `📤 Posting to ${platform}...`, { imageType: platform === 'instagram' ? '1:1' : '16:9' })
          try {
            const postResult = await withTimeout(
              postNowAndCheckStatus({
                accountId,
                platform: platform as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                caption: fullCaption,
                mediaUrls: platformMediaUrls,
                mediaType: 'image',
                firstComment: captionResult.firstComment,
                ctaUrl: platform === 'gbp' ? clientBlogUrl : undefined,
              }),
              TIMEOUTS.SOCIAL_SCHEDULE,
              `${platform} posting`
            )

            clientPostedPosts.push({
              platform,
              postId: postResult.postId,
              status: postResult.status,
              publishedUrl: postResult.platformPostUrl,
            })

            // Save to database
            await prisma.socialPost.create({
              data: {
                contentItemId,
                clientId: contentItem.clientId,
                platform: platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                caption: captionResult.caption,
                hashtags: captionResult.hashtags || [],
                firstComment: captionResult.firstComment,
                scheduledTime: new Date(),
                getlatePostId: postResult.postId,
                publishedUrl: postResult.platformPostUrl,
                status: postResult.status === 'published' ? 'PUBLISHED' : postResult.status === 'failed' ? 'FAILED' : 'PROCESSING',
                publishedAt: postResult.status === 'published' ? new Date() : undefined,
              },
            })

            log(ctx, `✅ Posted to ${platform}`, { status: postResult.status, url: postResult.platformPostUrl })
          } catch (platformError) {
            logError(ctx, `Failed to post to ${platform}`, platformError)
            // Continue with other platforms
          }
        }

        results.social = { success: clientPostedPosts.length > 0 }
        log(ctx, '✅ Client social posts published', { count: clientPostedPosts.length })

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

    // WRHQ Social Posts (post immediately after client posts complete)
    const wrhqLateAccountIds = await getWRHQLateAccountIds()
    if (Object.keys(wrhqLateAccountIds).length > 0 && wrhqBlogUrl) {
      log(ctx, 'Posting WRHQ social posts...')
      await logAction(ctx, 'wrhq_social_post', 'STARTED')

      try {
        const wrhqPlatforms = wrhqConfig.socialMedia.enabledPlatforms.filter(
          p => wrhqLateAccountIds[p]
        ) as ('facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram')[]

        // Skip video platforms (TikTok, YouTube) for image posts
        const VIDEO_PLATFORMS = ['tiktok', 'youtube']
        const filteredPlatforms = wrhqPlatforms.filter(p => !VIDEO_PLATFORMS.includes(p))

        const wrhqPostedPosts: Array<{ platform: string; postId: string; status: string; publishedUrl?: string }> = []

        // Post to each WRHQ platform immediately
        for (const platform of filteredPlatforms) {
          const accountId = wrhqLateAccountIds[platform]
          if (!accountId) continue

          // Get platform-specific image (same logic as client posts)
          const platformMediaUrls = getMediaUrlsForPlatform(platform)

          // Generate WRHQ caption for this platform
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

          // Format caption with hashtags
          let fullCaption = captionResult.caption
          if (captionResult.hashtags && captionResult.hashtags.length > 0) {
            fullCaption = `${captionResult.caption}\n\n${captionResult.hashtags.map(h => `#${h}`).join(' ')}`
          }

          // Add Google Maps link for GBP posts
          if (platform === 'gbp' && contentItem.client.googleMapsUrl) {
            fullCaption = `${fullCaption}\n\n📍 Find us on Google Maps: ${contentItem.client.googleMapsUrl}`
          }

          // Post immediately
          log(ctx, `📤 Posting WRHQ to ${platform}...`, { imageType: platform === 'instagram' ? '1:1' : '16:9' })
          try {
            const postResult = await withTimeout(
              postNowAndCheckStatus({
                accountId,
                platform,
                caption: fullCaption,
                mediaUrls: platformMediaUrls,
                mediaType: 'image',
                firstComment: captionResult.firstComment,
                ctaUrl: platform === 'gbp' ? wrhqBlogUrl : undefined,
              }),
              TIMEOUTS.SOCIAL_SCHEDULE,
              `WRHQ ${platform} posting`
            )

            wrhqPostedPosts.push({
              platform,
              postId: postResult.postId,
              status: postResult.status,
              publishedUrl: postResult.platformPostUrl,
            })

            // Save WRHQ social post to database
            await prisma.wRHQSocialPost.create({
              data: {
                contentItemId,
                platform: platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                caption: captionResult.caption,
                hashtags: captionResult.hashtags || [],
                firstComment: captionResult.firstComment,
                mediaUrls: platformMediaUrls,
                mediaType: 'image',
                scheduledTime: new Date(),
                getlatePostId: postResult.postId,
                publishedUrl: postResult.platformPostUrl,
                status: postResult.status === 'published' ? 'PUBLISHED' : postResult.status === 'failed' ? 'FAILED' : 'PROCESSING',
                publishedAt: postResult.status === 'published' ? new Date() : undefined,
              },
            })

            log(ctx, `✅ WRHQ posted to ${platform}`, { status: postResult.status, url: postResult.platformPostUrl })
          } catch (platformError) {
            logError(ctx, `Failed to post WRHQ to ${platform}`, platformError)
            // Continue with other platforms
          }
        }

        log(ctx, '✅ WRHQ social posts published', { count: wrhqPostedPosts.length })
        await logAction(ctx, 'wrhq_social_post', 'SUCCESS', {
          responseData: JSON.stringify({
            postedPosts: wrhqPostedPosts.length,
            platforms: filteredPlatforms,
          }),
        })

        // Mark WRHQ social as generated
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { wrhqSocialGenerated: true },
        })
      } catch (error) {
        logError(ctx, 'WRHQ social posting failed', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        await logAction(ctx, 'wrhq_social_post', 'FAILED', { errorMessage })
      }
    } else {
      log(ctx, '⏭️ WRHQ social not configured or no WRHQ blog URL - skipping')
    }

    await logAction(ctx, 'social_post', 'SUCCESS')

    // ============ STEP 5: Generate Podcast ============
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

      // Create podcast record immediately with PROCESSING status so review page can show it
      const podcastRecord = await prisma.podcast.create({
        data: {
          contentItemId,
          clientId: contentItem.clientId,
          audioUrl: '', // Will be updated when ready
          script: podcastScript,
          description: blogResult!.excerpt || blogResult!.title,
          autocontentJobId: podcastJob.jobId,
          status: 'PROCESSING',
        },
      })
      log(ctx, '📝 Podcast record created with PROCESSING status', { podcastId: podcastRecord.id })

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

        // Update podcast record with final audio URL and duration
        await prisma.podcast.update({
          where: { id: podcastRecord.id },
          data: {
            audioUrl: gcsResult.url,
            duration: podcastResult.duration,
            status: 'READY',
          },
        })

        // Publish to Podbean (like manual flow)
        log(ctx, 'Publishing podcast to Podbean...')
        try {
          const podbeanResult = await withTimeout(
            publishToPodbean({
              title: blogResult!.title,
              description: blogResult!.excerpt || contentItem.paaQuestion,
              audioUrl: gcsResult.url,
            }),
            TIMEOUTS.PODBEAN_PUBLISH,
            'Podbean publishing'
          )

          // Update podcast record with Podbean info
          await prisma.podcast.update({
            where: { id: podcastRecord.id },
            data: {
              podbeanEpisodeId: podbeanResult.episodeId,
              podbeanUrl: podbeanResult.url,
              podbeanPlayerUrl: podbeanResult.playerUrl,
              status: 'PUBLISHED',
            },
          })

          log(ctx, '✅ Podcast published to Podbean', { playerUrl: podbeanResult.playerUrl })
        } catch (podbeanError) {
          logError(ctx, 'Failed to publish podcast to Podbean', podbeanError)
          // Non-critical, podcast is still in GCS
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

    // ============ STEP 6: Generate Videos ============
    ctx.step = 'videos'
    await updatePipelineStep(contentItemId, 'videos')
    log(ctx, '🎬 Starting video generation...')
    await logAction(ctx, 'video_generate', 'STARTED')

    try {
      const imageUrls = await prisma.image.findMany({
        where: { contentItemId },
        select: { gcsUrl: true },
      })

      // Get the published blog URL for better video generation (URL-to-Video API)
      const blogPostForVideo = await prisma.blogPost.findUnique({ where: { contentItemId } })
      const blogUrlForVideo = blogPostForVideo?.wordpressUrl || null

      const scriptForVideo = podcastScript || blogResult!.excerpt || blogResult!.title

      log(ctx, 'Creating short video job...', { blogUrl: blogUrlForVideo })
      const videoJob = await withTimeout(
        createShortVideo({
          script: scriptForVideo.substring(0, 500),
          title: blogResult!.title,
          blogUrl: blogUrlForVideo || undefined, // Use URL-to-Video API if blog is published
          imageUrls: imageUrls.map((i: { gcsUrl: string }) => i.gcsUrl),
          aspectRatio: '9:16',
          duration: 30, // 30 seconds for short-form video
          scriptStyle: 'ProblemSolutionV2', // Problem/solution format for auto glass content
        }),
        TIMEOUTS.VIDEO_CREATE,
        'Video job creation'
      )

      // Create video record immediately with PROCESSING status so review page can show it
      const videoRecord = await prisma.video.create({
        data: {
          contentItemId,
          clientId: contentItem.clientId,
          videoType: 'SHORT',
          videoUrl: '', // Will be updated when ready
          aspectRatio: '9:16',
          provider: 'CREATIFY',
          providerJobId: videoJob.jobId,
          status: 'PROCESSING',
        },
      })
      log(ctx, '📝 Video record created with PROCESSING status', { videoId: videoRecord.id })

      // Also mark short video as being generated
      await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { shortVideoGenerated: false, shortVideoStatus: 'PROCESSING' },
      })

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

        // Update video record with final URL and duration
        await prisma.video.update({
          where: { id: videoRecord.id },
          data: {
            videoUrl: gcsResult.url,
            thumbnailUrl: videoResult.thumbnailUrl,
            duration: videoResult.duration,
            status: 'READY',
          },
        })

        // Upload to YouTube (like manual flow)
        const youtubeConfigured = await isYouTubeConfigured()
        if (youtubeConfigured) {
          log(ctx, 'Uploading video to YouTube...')
          try {
            // Get required URLs for description
            const clientBlogPost = await prisma.blogPost.findUnique({ where: { contentItemId } })
            const podcast = await prisma.podcast.findFirst({ where: { contentItemId } })

            const youtubeResult = await withTimeout(
              uploadVideoFromUrl(gcsResult.url, {
                title: blogResult!.title,
                description: generateVideoDescription({
                  paaQuestion: contentItem.paaQuestion,
                  clientBlogUrl: clientBlogPost?.wordpressUrl || '',
                  wrhqBlogUrl: wrhqBlogUrl || '',
                  googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
                  wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || undefined,
                  podbeanUrl: podcast?.podbeanUrl || undefined,
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
                privacyStatus: 'public',
              }),
              TIMEOUTS.YOUTUBE_UPLOAD,
              'YouTube upload'
            )

            // Update video record status
            await prisma.video.update({
              where: { id: videoRecord.id },
              data: {
                status: 'PUBLISHED',
              },
            })

            // Create a WRHQ social post record for the YouTube upload (for embed-all-media to find)
            // This goes to WRHQ's YouTube channel, not the client's
            await prisma.wRHQSocialPost.create({
              data: {
                contentItemId,
                platform: 'YOUTUBE',
                caption: blogResult!.title,
                hashtags: [],
                mediaType: 'video',
                mediaUrls: [gcsResult.url],
                scheduledTime: new Date(),
                publishedUrl: youtubeResult.videoUrl,
                status: 'PUBLISHED',
                publishedAt: new Date(),
              },
            })

            log(ctx, '✅ Video uploaded to YouTube', { url: youtubeResult.videoUrl })
          } catch (youtubeError) {
            logError(ctx, 'Failed to upload video to YouTube', youtubeError)
            // Non-critical, video is still in GCS
          }
        } else {
          log(ctx, '⏭️ YouTube not configured - skipping upload')
        }

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

    // ============ STEP 7: Generate Schema & Embed All Media ============
    // This matches the manual flow's "Embed All Media" step
    ctx.step = 'schema'
    await updatePipelineStep(contentItemId, 'schema')
    log(ctx, '📋 Starting schema generation and media embedding...')
    await logAction(ctx, 'schema_embed', 'STARTED')

    try {
      // Get all the content we need
      const blogPostForEmbed = await prisma.blogPost.findUnique({ where: { contentItemId } })
      const podcast = await prisma.podcast.findFirst({ where: { contentItemId } })
      const video = await prisma.video.findFirst({ where: { contentItemId, videoType: 'SHORT' } })
      const wrhqSocialPosts = await prisma.wRHQSocialPost.findMany({ where: { contentItemId } })

      if (blogPostForEmbed && blogPostForEmbed.wordpressPostId && contentItem.client.wordpressUrl) {
        // 1. Generate schema with all content references
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
            title: blogPostForEmbed.title,
            slug: blogPostForEmbed.slug,
            content: blogPostForEmbed.content,
            excerpt: blogPostForEmbed.excerpt,
            metaDescription: blogPostForEmbed.metaDescription,
            wordpressUrl: blogPostForEmbed.wordpressUrl,
            publishedAt: blogPostForEmbed.publishedAt,
          },
          contentItem: {
            paaQuestion: contentItem.paaQuestion,
          },
          podcast: podcast ? { audioUrl: podcast.audioUrl, duration: podcast.duration } : undefined,
          video: video ? { videoUrl: video.videoUrl, thumbnailUrl: video.thumbnailUrl, duration: video.duration } : undefined,
        })

        // Save schema to blog post
        await prisma.blogPost.update({
          where: { id: blogPostForEmbed.id },
          data: { schemaJson },
        })
        log(ctx, '✅ Schema generated and saved')

        // 2. Fetch current WordPress content and embed all media (like manual embed-all-media)
        const wpCredentials = {
          url: contentItem.client.wordpressUrl,
          username: contentItem.client.wordpressUsername || '',
          password: contentItem.client.wordpressAppPassword || '',
        }

        const currentPost = await getPost(wpCredentials, blogPostForEmbed.wordpressPostId)
        let fullContent = currentPost.content

        // Remove any existing embeds to prevent duplicates
        fullContent = fullContent.replace(/<!-- JSON-LD Schema \d+ -->[\s\S]*?<\/script>/g, '')
        fullContent = fullContent.replace(/<!-- JSON-LD Schema Markup -->[\s\S]*?<\/script>/g, '')
        fullContent = fullContent.replace(/<!-- YouTube Short Video -->[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="yt-shorts-embed">[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="video-container"[\s\S]*?<\/div>/g, '')
        fullContent = fullContent.replace(/<!-- Podcast Episode -->[\s\S]*?<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="podcast-embed"[\s\S]*?<\/div>/g, '')
        fullContent = fullContent.replace(/<!-- Google Maps Embed -->[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="google-maps-embed"[\s\S]*?<\/div>\s*<\/div>/g, '')
        fullContent = fullContent.replace(/<div class="google-maps-link"[\s\S]*?<\/div>/g, '') // Remove old link-only version

        const embedded: string[] = []

        // Add JSON-LD schema at the beginning
        const schemaEmbed = generateSchemaEmbed(schemaJson)
        fullContent = schemaEmbed + '\n\n' + fullContent
        embedded.push('schema')

        // Add short video embed if YouTube URL exists (from WRHQ YouTube channel)
        const youtubePost = wrhqSocialPosts.find(p => p.platform === 'YOUTUBE' && p.publishedUrl)
        if (youtubePost?.publishedUrl) {
          const shortVideoEmbed = generateShortVideoEmbed(youtubePost.publishedUrl)
          if (shortVideoEmbed) {
            fullContent = shortVideoEmbed + '\n' + fullContent
            embedded.push('short-video')
          }
        }

        // Add podcast embed at the end if published to Podbean
        if (podcast?.podbeanPlayerUrl) {
          const podcastEmbed = generatePodcastEmbed(blogPostForEmbed.title, podcast.podbeanPlayerUrl)
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
        await updatePost(wpCredentials, blogPostForEmbed.wordpressPostId, { content: fullContent })
        log(ctx, '✅ All media embedded in WordPress', { embedded })

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
      }

      // Also add Google Maps embed to WRHQ blog post if it exists
      const wrhqBlogPost = await prisma.wRHQBlogPost.findUnique({ where: { contentItemId } })
      if (wrhqBlogPost && wrhqBlogPost.wordpressPostId && wrhqConfig.wordpress.isConfigured) {
        try {
          const wrhqWpCredentials = {
            url: wrhqConfig.wordpress.url!,
            username: wrhqConfig.wordpress.username!,
            password: wrhqConfig.wordpress.appPassword!,
            isDecrypted: true,
          }

          const wrhqCurrentPost = await getPost(wrhqWpCredentials, wrhqBlogPost.wordpressPostId)
          let wrhqFullContent = wrhqCurrentPost.content

          // Remove existing Google Maps embeds
          wrhqFullContent = wrhqFullContent.replace(/<!-- Google Maps Embed -->[\s\S]*?<\/div>\s*<\/div>/g, '')
          wrhqFullContent = wrhqFullContent.replace(/<div class="google-maps-embed"[\s\S]*?<\/div>\s*<\/div>/g, '')

          // Add Google Maps embed to WRHQ blog post
          if (contentItem.client.streetAddress && contentItem.client.city && contentItem.client.state) {
            const wrhqMapsEmbed = generateGoogleMapsEmbed({
              businessName: contentItem.client.businessName,
              streetAddress: contentItem.client.streetAddress,
              city: contentItem.client.city,
              state: contentItem.client.state,
              postalCode: contentItem.client.postalCode,
              googleMapsUrl: contentItem.client.googleMapsUrl,
            })
            wrhqFullContent = wrhqFullContent + wrhqMapsEmbed

            await updatePost(wrhqWpCredentials, wrhqBlogPost.wordpressPostId, { content: wrhqFullContent })
            log(ctx, '✅ Google Maps embed added to WRHQ blog')
          }
        } catch (wrhqEmbedError) {
          logError(ctx, 'Failed to add Google Maps embed to WRHQ blog', wrhqEmbedError)
          // Non-critical, continue
        }
      }

      // Mark schema as generated
      await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { schemaGenerated: true },
      })

      results.schema = { success: true }
      log(ctx, '✅ Schema and embedding complete')
      await logAction(ctx, 'schema_embed', 'SUCCESS')
    } catch (error) {
      logError(ctx, 'Schema/embedding failed', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await logAction(ctx, 'schema_embed', 'FAILED', { errorMessage })
      results.schema = { success: false, error: errorMessage }
      log(ctx, '⚠️ Continuing without schema/embeds...')
    }

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
        schema: results.schema.skipped ? '⏭️' : (results.schema.success ? '✅' : '❌'),
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
