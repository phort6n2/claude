import { prisma } from '../db'
import { generateBlogPost, generateSocialCaption, generatePodcastScript, generatePodcastDescription, generateWRHQBlogPost, generateWRHQSocialCaption } from '../integrations/claude'
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

  return `
<!-- Google Maps Embed -->
<div class="google-maps-embed" style="margin: 30px 0;">
  <h3>📍 Find ${params.businessName}</h3>
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
      blogPost: true,
      images: true,
      podcast: true,
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

    // Check if blog already exists (for retry scenarios)
    if (contentItem.blogPost) {
      log(ctx, '⏭️ Blog already exists, skipping generation')
      blogPost = contentItem.blogPost
      blogResult = {
        title: blogPost.title,
        slug: blogPost.slug,
        content: blogPost.content,
        excerpt: blogPost.excerpt || '',
        metaTitle: blogPost.metaTitle || blogPost.title,
        metaDescription: blogPost.metaDescription || '',
        focusKeyword: blogPost.focusKeyword || '',
      }
      results.blog = { success: true }
    } else {
      log(ctx, '📝 Starting blog generation...')
      await logAction(ctx, 'blog_generate', 'STARTED')

      try {
        blogResult = await withTimeout(
          retryWithBackoff(async () => {
            return generateBlogPost({
              businessName: contentItem.client.businessName,
              city: contentItem.client.city,
              state: contentItem.client.state,
              hasAdas: contentItem.client.offersAdasCalibration,
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
    }

    // ============ STEP 2: Generate Images ============
    ctx.step = 'images'
    await updatePipelineStep(contentItemId, 'images')

    // Check if images already exist (for retry scenarios)
    const existingFeaturedImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
    const existingSquareImage = contentItem.images.find(img => img.imageType === 'INSTAGRAM_FEED')

    if (existingFeaturedImage && existingSquareImage) {
      log(ctx, '⏭️ Images already exist, skipping generation')
      results.images = { success: true }
    } else {
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
        if (images.landscape && !existingFeaturedImage) {
          const filename = `${contentItem.client.slug}/${blogResult!.slug}/landscape.png`
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
              altText: `${blogResult!.title} - ${contentItem.client.businessName}`,
            },
          })
        }

        if (images.square && !existingSquareImage) {
          const filename = `${contentItem.client.slug}/${blogResult!.slug}/square.png`
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
              altText: `${blogResult!.title} - ${contentItem.client.businessName}`,
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
    }

    // ============ STEP 3: Publish to WordPress ============
    ctx.step = 'wordpress'
    await updatePipelineStep(contentItemId, 'wordpress')

    // Check if already published to WordPress (for retry scenarios)
    if (contentItem.blogPost?.wordpressPostId) {
      log(ctx, '⏭️ Already published to WordPress, skipping', { postId: contentItem.blogPost.wordpressPostId })
      results.wordpress = { success: true }
      results.wordpress.skipped = false
    } else if (contentItem.client.wordpressUrl && contentItem.client.wordpressUsername && contentItem.client.wordpressAppPassword) {
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

    // ============ STEP 4-6: Social Posts, Podcast AND Video IN PARALLEL ============
    // Running all three in parallel saves significant time
    ctx.step = 'social'
    await updatePipelineStep(contentItemId, 'social')
    log(ctx, '📱🎙️🎬 Starting social posts, podcast AND video in parallel...')

    // Fetch shared data needed by social posts upfront
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

    // Start log action for social posts (podcast/video log their own start inside Promise.allSettled)
    await logAction(ctx, 'social_post', 'STARTED')

    // Run all three operations in parallel using Promise.allSettled
    const [socialSettled, podcastSettled, videoSettled] = await Promise.allSettled([
      // ========== SOCIAL POSTS ==========
      (async () => {
        const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
        let clientPostedCount = 0
        let wrhqPostedCount = 0

        // Client Social Posts
        if (contentItem.client.socialPlatforms.length > 0 && socialAccountIds && Object.keys(socialAccountIds).length > 0) {
          results.social.skipped = false
          log(ctx, 'Posting client social posts...', { platforms: contentItem.client.socialPlatforms })

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
            // Check if it's a rate limit error
            const errorMsg = platformError instanceof Error ? platformError.message : String(platformError)
            const isRateLimit = errorMsg.toLowerCase().includes('rate') || errorMsg.toLowerCase().includes('limit') || errorMsg.toLowerCase().includes('too many') || errorMsg.toLowerCase().includes('quota')

            if (isRateLimit) {
              log(ctx, `⚠️ ${platform} rate limit reached - skipping`, { error: errorMsg })
            } else {
              logError(ctx, `Failed to post to ${platform}`, platformError)
            }

            // Save failed post to database so user can see it in the UI
            try {
              await prisma.socialPost.create({
                data: {
                  contentItemId,
                  clientId: contentItem.clientId,
                  platform: platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                  caption: captionResult.caption,
                  hashtags: captionResult.hashtags || [],
                  firstComment: captionResult.firstComment,
                  scheduledTime: new Date(),
                  status: 'FAILED',
                  errorMessage: isRateLimit ? 'Rate limit reached' : errorMsg.substring(0, 500),
                },
              })
            } catch (dbError) {
              logError(ctx, `Failed to save failed post record for ${platform}`, dbError)
            }
            // Continue with other platforms
          }
        }

          clientPostedCount = clientPostedPosts.length
          results.social = { success: clientPostedPosts.length > 0 }
          log(ctx, '✅ Client social posts published', { count: clientPostedPosts.length })

          // Mark social as generated
          await prisma.contentItem.update({
            where: { id: contentItemId },
            data: { socialGenerated: true },
          })
        } else {
          log(ctx, '⏭️ Client social not configured - skipping')
        }

        // WRHQ Social Posts
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
                // Check if it's a rate limit error
                const errorMsg = platformError instanceof Error ? platformError.message : String(platformError)
                const isRateLimit = errorMsg.toLowerCase().includes('rate') || errorMsg.toLowerCase().includes('limit') || errorMsg.toLowerCase().includes('too many') || errorMsg.toLowerCase().includes('quota')

                if (isRateLimit) {
                  log(ctx, `⚠️ WRHQ ${platform} rate limit reached - skipping`, { error: errorMsg })
                } else {
                  logError(ctx, `Failed to post WRHQ to ${platform}`, platformError)
                }

                // Save failed post to database so user can see it in the UI
                try {
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
                      status: 'FAILED',
                      errorMessage: isRateLimit ? 'Rate limit reached' : errorMsg.substring(0, 500),
                    },
                  })
                } catch (dbError) {
                  logError(ctx, `Failed to save failed WRHQ post record for ${platform}`, dbError)
                }
                // Continue with other platforms
              }
            }

            wrhqPostedCount = wrhqPostedPosts.length
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

        return { success: true, clientPostedCount, wrhqPostedCount }
      })(),

      // ========== PODCAST GENERATION ==========
      (async () => {
        // Check if podcast already exists and is complete (for retry scenarios)
        if (contentItem.podcast?.status === 'PUBLISHED' && contentItem.podcast?.podbeanPlayerUrl) {
          log(ctx, '⏭️ Podcast already exists and is published, skipping')
          return { success: true, duration: contentItem.podcast.duration, skipped: true }
        }

        // Check if podcast exists but needs Podbean publishing
        if (contentItem.podcast?.audioUrl && contentItem.podcast?.status === 'READY' && !contentItem.podcast?.podbeanPlayerUrl) {
          log(ctx, '🔄 Podcast exists but needs Podbean publishing...')
          try {
            const podbeanResult = await retryWithBackoff(
              async () => {
                return await withTimeout(
                  publishToPodbean({
                    title: blogResult!.title,
                    description: contentItem.podcast!.description || blogResult!.excerpt || '',
                    audioUrl: contentItem.podcast!.audioUrl,
                  }),
                  TIMEOUTS.PODBEAN_PUBLISH,
                  'Podbean publishing'
                )
              },
              3,
              3000
            )

            await prisma.podcast.update({
              where: { id: contentItem.podcast.id },
              data: {
                podbeanEpisodeId: podbeanResult.episodeId,
                podbeanUrl: podbeanResult.url,
                podbeanPlayerUrl: podbeanResult.playerUrl,
                status: 'PUBLISHED',
              },
            })

            log(ctx, '✅ Podcast published to Podbean (retry)', { playerUrl: podbeanResult.playerUrl })
            return { success: true, duration: contentItem.podcast.duration }
          } catch (podbeanError) {
            logError(ctx, 'Failed to publish podcast to Podbean on retry', podbeanError)
            return { success: false, error: String(podbeanError) }
          }
        }

        // Check if podcast is still processing (don't recreate)
        if (contentItem.podcast?.status === 'PROCESSING' && contentItem.podcast?.autocontentJobId) {
          log(ctx, '🔄 Podcast is still processing, checking status...')
          try {
            const podcastResult = await withTimeout(
              waitForPodcast(contentItem.podcast.autocontentJobId),
              TIMEOUTS.PODCAST_WAIT,
              'Podcast rendering (retry)'
            )

            if (podcastResult.audioUrl) {
              // Upload to GCS
              const podcastFilename = `${contentItem.client.slug}/${blogResult!.slug}/podcast.mp3`
              const gcsResult = await withTimeout(
                uploadFromUrl(podcastResult.audioUrl, podcastFilename),
                TIMEOUTS.GCS_UPLOAD,
                'Podcast GCS upload'
              )

              await prisma.podcast.update({
                where: { id: contentItem.podcast.id },
                data: {
                  audioUrl: gcsResult.url,
                  duration: podcastResult.duration,
                  status: 'READY',
                },
              })

              // Publish to Podbean
              log(ctx, 'Publishing podcast to Podbean...')
              const podbeanResult = await retryWithBackoff(
                async () => {
                  return await withTimeout(
                    publishToPodbean({
                      title: blogResult!.title,
                      description: contentItem.podcast!.description || blogResult!.excerpt || '',
                      audioUrl: gcsResult.url,
                    }),
                    TIMEOUTS.PODBEAN_PUBLISH,
                    'Podbean publishing'
                  )
                },
                3,
                3000
              )

              await prisma.podcast.update({
                where: { id: contentItem.podcast.id },
                data: {
                  podbeanEpisodeId: podbeanResult.episodeId,
                  podbeanUrl: podbeanResult.url,
                  podbeanPlayerUrl: podbeanResult.playerUrl,
                  status: 'PUBLISHED',
                },
              })

              log(ctx, '✅ Podcast published to Podbean (from processing)', { playerUrl: podbeanResult.playerUrl })
              return { success: true, duration: podcastResult.duration }
            }
          } catch (processingError) {
            logError(ctx, 'Failed to complete processing podcast', processingError)
            // Fall through to create new podcast
          }
        }

        log(ctx, '🎙️ Starting podcast generation...')
        await logAction(ctx, 'podcast_generate', 'STARTED')

        // Generate podcast script
        const script = await withTimeout(
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
            script,
            title: blogResult!.title,
            duration: 'short', // Use SHORT duration for faster generation (under 10 min)
          }),
          TIMEOUTS.PODCAST_CREATE,
          'Podcast job creation'
        )

        // Generate podcast description
        let descriptionHtml = ''
        try {
          const servicePageUrl = contentItem.client.servicePages?.[0]?.url || undefined
          descriptionHtml = await withTimeout(
            generatePodcastDescription({
              businessName: contentItem.client.businessName,
              city: contentItem.client.city,
              state: contentItem.client.state,
              paaQuestion: contentItem.paaQuestion,
              blogPostUrl: clientBlogUrl || contentItem.client.wordpressUrl || '',
              servicePageUrl,
              googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
            }),
            TIMEOUTS.SOCIAL_CAPTION,
            'Podcast description generation'
          )
        } catch (descError) {
          logError(ctx, 'Failed to generate podcast description, using fallback', descError)
          descriptionHtml = `<p>${blogResult!.excerpt || contentItem.paaQuestion}</p>`
        }

        // Delete old failed podcast record if exists
        if (contentItem.podcast?.status === 'FAILED') {
          await prisma.podcast.delete({ where: { id: contentItem.podcast.id } })
        }

        // Create podcast record with PROCESSING status
        const podcastRecord = await prisma.podcast.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            audioUrl: '',
            script,
            description: descriptionHtml,
            autocontentJobId: podcastJob.jobId,
            status: 'PROCESSING',
          },
        })

        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { podcastDescription: descriptionHtml },
        })

        log(ctx, '📝 Podcast job started, waiting for render...', { jobId: podcastJob.jobId })

        // Wait for podcast to render
        const podcastResult = await withTimeout(
          waitForPodcast(podcastJob.jobId),
          TIMEOUTS.PODCAST_WAIT,
          'Podcast rendering'
        )

        if (!podcastResult.audioUrl) {
          throw new Error('No audio URL returned')
        }

        // Upload to GCS
        const podcastFilename = `${contentItem.client.slug}/${blogResult!.slug}/podcast.mp3`
        const gcsResult = await withTimeout(
          uploadFromUrl(podcastResult.audioUrl, podcastFilename),
          TIMEOUTS.GCS_UPLOAD,
          'Podcast GCS upload'
        )

        await prisma.podcast.update({
          where: { id: podcastRecord.id },
          data: {
            audioUrl: gcsResult.url,
            duration: podcastResult.duration,
            status: 'READY',
          },
        })

        // Wait a few seconds for GCS to fully propagate before Podbean fetches it
        log(ctx, 'Waiting for GCS propagation...')
        await new Promise(resolve => setTimeout(resolve, 5000))

        // Publish to Podbean with retry logic
        log(ctx, 'Publishing podcast to Podbean...')
        try {
          const podbeanResult = await retryWithBackoff(
            async () => {
              return await withTimeout(
                publishToPodbean({
                  title: blogResult!.title,
                  description: descriptionHtml,
                  audioUrl: gcsResult.url,
                }),
                TIMEOUTS.PODBEAN_PUBLISH,
                'Podbean publishing'
              )
            },
            3,  // 3 attempts
            3000 // 3 second base delay (3s, 6s, 12s backoff)
          )

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
          logError(ctx, 'Failed to publish podcast to Podbean after 3 attempts', podbeanError)
        }

        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { podcastGenerated: true },
        })

        return { success: true, duration: podcastResult.duration }
      })(),

      // ========== VIDEO GENERATION ==========
      (async () => {
        log(ctx, '🎬 Starting video generation...')
        await logAction(ctx, 'video_generate', 'STARTED')

        const imageUrls = await prisma.image.findMany({
          where: { contentItemId },
          select: { gcsUrl: true },
        })

        const blogPostForVideo = await prisma.blogPost.findUnique({ where: { contentItemId } })
        const blogUrlForVideo = blogPostForVideo?.wordpressUrl || null

        log(ctx, 'Creating short video job...', { blogUrl: blogUrlForVideo })
        const videoJob = await withTimeout(
          createShortVideo({
            title: blogResult!.title,
            blogUrl: blogUrlForVideo || undefined,
            imageUrls: imageUrls.map((i: { gcsUrl: string }) => i.gcsUrl),
            aspectRatio: '9:16',
            duration: 30,
            scriptStyle: 'HowToV2',
          }),
          TIMEOUTS.VIDEO_CREATE,
          'Video job creation'
        )

        const videoRecord = await prisma.video.create({
          data: {
            contentItemId,
            clientId: contentItem.clientId,
            videoType: 'SHORT',
            videoUrl: '',
            aspectRatio: '9:16',
            provider: 'CREATIFY',
            providerJobId: videoJob.jobId,
            status: 'PROCESSING',
          },
        })

        log(ctx, '📝 Video job started, waiting for render...', { jobId: videoJob.jobId })

        // Wait for video to render
        const videoResult = await withTimeout(
          waitForVideo(videoJob.jobId),
          TIMEOUTS.VIDEO_WAIT,
          'Video rendering'
        )

        return { success: true, videoResult, videoRecord }
      })(),
    ])

    // Process social result
    if (socialSettled.status === 'fulfilled') {
      log(ctx, '✅ Social posts completed', {
        clientPosts: socialSettled.value.clientPostedCount,
        wrhqPosts: socialSettled.value.wrhqPostedCount
      })
      await logAction(ctx, 'social_post', 'SUCCESS')
    } else {
      const errorMessage = socialSettled.reason instanceof Error ? socialSettled.reason.message : 'Unknown error'
      logError(ctx, 'Social posting failed', socialSettled.reason)
      await logAction(ctx, 'social_post', 'FAILED', { errorMessage })
    }

    // Process podcast result
    if (podcastSettled.status === 'fulfilled') {
      results.podcast = { success: true }
      log(ctx, '✅ Podcast completed', { duration: podcastSettled.value.duration })
      await logAction(ctx, 'podcast_generate', 'SUCCESS')
    } else {
      const errorMessage = podcastSettled.reason instanceof Error ? podcastSettled.reason.message : 'Unknown error'
      logError(ctx, 'Podcast generation failed', podcastSettled.reason)
      await logAction(ctx, 'podcast_generate', 'FAILED', { errorMessage })
      results.podcast = { success: false, error: errorMessage }
    }

    // Process video result - if successful, continue with post-processing
    ctx.step = 'videos'
    await updatePipelineStep(contentItemId, 'videos')

    if (videoSettled.status === 'fulfilled' && videoSettled.value.videoResult && videoSettled.value.videoRecord) {
      const { videoResult, videoRecord: vRecord } = videoSettled.value
      log(ctx, '✅ Video rendering completed, starting post-processing...')

      if (!videoResult.videoUrl) {
        log(ctx, '❌ Video result missing videoUrl, skipping post-processing')
      } else {
        try {
          // Upload to GCS
          const videoFilename = `videos/${contentItem.clientId}/short-${contentItemId}-${Date.now()}.mp4`
          const gcsResult = await withTimeout(
            uploadFromUrl(videoResult.videoUrl, videoFilename),
            TIMEOUTS.GCS_UPLOAD,
            'Video GCS upload'
          )

        await prisma.video.update({
          where: { id: vRecord.id },
          data: {
            videoUrl: gcsResult.url,
            thumbnailUrl: videoResult.thumbnailUrl,
            duration: videoResult.duration,
            status: 'READY',
          },
        })
        log(ctx, '✅ Video uploaded to GCS')

        // Upload to YouTube
        const youtubeConfigured = await isYouTubeConfigured()
        if (youtubeConfigured) {
          log(ctx, 'Uploading video to YouTube...', {
            playlistId: contentItem.client.wrhqYoutubePlaylistId || 'none',
          })
          try {
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
                playlistId: contentItem.client.wrhqYoutubePlaylistId || undefined,
                privacyStatus: 'public',
              }),
              TIMEOUTS.YOUTUBE_UPLOAD,
              'YouTube upload'
            )

            await prisma.video.update({
              where: { id: vRecord.id },
              data: { status: 'PUBLISHED' },
            })

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

            log(ctx, '✅ Video uploaded to YouTube', {
              url: youtubeResult.videoUrl,
              addedToPlaylist: !!contentItem.client.wrhqYoutubePlaylistId,
            })
          } catch (youtubeError) {
            logError(ctx, 'Failed to upload video to YouTube', youtubeError)
          }
        }

        // Post to WRHQ TikTok and Instagram via Late
        const wrhqVideoAccountIds = await getWRHQLateAccountIds()
        const VIDEO_SOCIAL_PLATFORMS = ['tiktok', 'instagram'] as const

        for (const platform of VIDEO_SOCIAL_PLATFORMS) {
          const accountId = wrhqVideoAccountIds[platform]
          if (!accountId) continue

          const videoCaption = `${blogResult!.title}\n\n${contentItem.client.businessName} in ${contentItem.client.city}, ${contentItem.client.state} answers: "${contentItem.paaQuestion}"\n\n#AutoGlass #WindshieldRepair #${contentItem.client.city.replace(/\s+/g, '')} #CarCare`

          try {
            log(ctx, `📤 Posting video to WRHQ ${platform}...`)
            const postResult = await withTimeout(
              postNowAndCheckStatus({
                accountId,
                platform: platform as 'tiktok' | 'instagram',
                caption: videoCaption,
                mediaUrls: [gcsResult.url],
                mediaType: 'video',
              }),
              TIMEOUTS.SOCIAL_SCHEDULE,
              `WRHQ ${platform} video posting`
            )

            await prisma.wRHQSocialPost.create({
              data: {
                contentItemId,
                platform: platform.toUpperCase() as 'TIKTOK' | 'INSTAGRAM',
                caption: videoCaption,
                hashtags: ['AutoGlass', 'WindshieldRepair', contentItem.client.city.replace(/\s+/g, ''), 'CarCare'],
                mediaType: 'video',
                mediaUrls: [gcsResult.url],
                scheduledTime: new Date(),
                getlatePostId: postResult.postId,
                publishedUrl: postResult.platformPostUrl,
                status: postResult.status === 'published' ? 'PUBLISHED' : postResult.status === 'failed' ? 'FAILED' : 'PROCESSING',
                publishedAt: postResult.status === 'published' ? new Date() : undefined,
              },
            })
            log(ctx, `✅ Video posted to WRHQ ${platform}`)
          } catch (videoPostError) {
            const errorMsg = videoPostError instanceof Error ? videoPostError.message : String(videoPostError)
            const isRateLimit = errorMsg.toLowerCase().includes('rate') || errorMsg.toLowerCase().includes('limit')
            logError(ctx, `Failed to post video to WRHQ ${platform}`, videoPostError)
            try {
              await prisma.wRHQSocialPost.create({
                data: {
                  contentItemId,
                  platform: platform.toUpperCase() as 'TIKTOK' | 'INSTAGRAM',
                  caption: videoCaption,
                  hashtags: [],
                  mediaType: 'video',
                  mediaUrls: [gcsResult.url],
                  scheduledTime: new Date(),
                  status: 'FAILED',
                  errorMessage: isRateLimit ? 'Rate limit reached' : errorMsg.substring(0, 500),
                },
              })
            } catch (dbError) {
              logError(ctx, 'Failed to save failed post record', dbError)
            }
          }
        }

        results.videos = { success: true }
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { shortVideoGenerated: true },
        })
        log(ctx, '✅ Video processing complete')
        await logAction(ctx, 'video_generate', 'SUCCESS')
      } catch (videoPostError) {
        logError(ctx, 'Video post-processing failed', videoPostError)
        const errorMessage = videoPostError instanceof Error ? videoPostError.message : 'Unknown error'
        await logAction(ctx, 'video_generate', 'FAILED', { errorMessage })
        results.videos = { success: false, error: errorMessage }
        }
      }
    } else {
      // Video rendering failed or didn't complete
      const errorMessage = videoSettled.status === 'rejected'
        ? (videoSettled.reason instanceof Error ? videoSettled.reason.message : 'Unknown error')
        : 'Video job not started'
      logError(ctx, 'Video generation failed', videoSettled.status === 'rejected' ? videoSettled.reason : new Error(errorMessage))
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
      const featuredImageForSchema = await prisma.image.findFirst({ where: { contentItemId, imageType: 'BLOG_FEATURED' } })

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
            googleMapsUrl: contentItem.client.googleMapsUrl,
            serviceAreas: contentItem.client.serviceAreas,
            gbpRating: contentItem.client.gbpRating,
            gbpReviewCount: contentItem.client.gbpReviewCount,
            offersWindshieldRepair: contentItem.client.offersWindshieldRepair,
            offersWindshieldReplacement: contentItem.client.offersWindshieldReplacement,
            offersSideWindowRepair: contentItem.client.offersSideWindowRepair,
            offersBackWindowRepair: contentItem.client.offersBackWindowRepair,
            offersSunroofRepair: contentItem.client.offersSunroofRepair,
            offersRockChipRepair: contentItem.client.offersRockChipRepair,
            offersAdasCalibration: contentItem.client.offersAdasCalibration,
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
            imageUrl: featuredImageForSchema?.gcsUrl || null,
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

        // Check if podcast was generated but not published to Podbean - if so, try to publish it now
        if (podcast && podcast.audioUrl && podcast.status === 'READY' && !podcast.podbeanPlayerUrl) {
          log(ctx, '🎙️ Podcast was generated but not published to Podbean - attempting to publish now...')
          try {
            const podbeanResult = await retryWithBackoff(
              async () => {
                return await withTimeout(
                  publishToPodbean({
                    title: blogPostForEmbed.title,
                    description: podcast.description || blogPostForEmbed.excerpt || '',
                    audioUrl: podcast.audioUrl,
                  }),
                  TIMEOUTS.PODBEAN_PUBLISH,
                  'Podbean publishing (retry during embed)'
                )
              },
              3,  // 3 attempts
              3000 // 3 second base delay
            )

            // Update podcast record with Podbean info
            await prisma.podcast.update({
              where: { id: podcast.id },
              data: {
                podbeanEpisodeId: podbeanResult.episodeId,
                podbeanUrl: podbeanResult.url,
                podbeanPlayerUrl: podbeanResult.playerUrl,
                status: 'PUBLISHED',
              },
            })

            // Update the local podcast object so embed works
            podcast.podbeanPlayerUrl = podbeanResult.playerUrl
            podcast.podbeanUrl = podbeanResult.url
            podcast.podbeanEpisodeId = podbeanResult.episodeId
            podcast.status = 'PUBLISHED'

            log(ctx, '✅ Podcast published to Podbean during embed step', { playerUrl: podbeanResult.playerUrl })
          } catch (podbeanError) {
            logError(ctx, 'Failed to publish podcast to Podbean during embed step', podbeanError)
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

        // Mark schema as generated (inside the if block where work was done)
        await prisma.contentItem.update({
          where: { id: contentItemId },
          data: { schemaGenerated: true },
        })

        results.schema = { success: true }
        log(ctx, '✅ Schema and embedding complete')
      } else {
        // Log why schema/embed was skipped
        log(ctx, '⚠️ Schema/embed skipped - missing requirements:', {
          hasBlogPost: !!blogPostForEmbed,
          hasWordpressPostId: !!blogPostForEmbed?.wordpressPostId,
          hasClientWordpressUrl: !!contentItem.client.wordpressUrl,
        })
        results.schema = { success: false, error: 'Missing blog post or WordPress configuration' }
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

      await logAction(ctx, 'schema_embed', results.schema.success ? 'SUCCESS' : 'FAILED')
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
