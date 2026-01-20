import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateBlogPost, generatePodcastDescription } from '@/lib/integrations/claude'
import { generateBothImages } from '@/lib/integrations/nano-banana'
import { uploadFromUrl } from '@/lib/integrations/gcs'
import { getSetting, WRHQ_SETTINGS_KEYS } from '@/lib/settings'
import { ImageType, SocialPlatform } from '@prisma/client'
import type { ScriptStyle, VisualStyle, ModelVersion } from '@/lib/integrations/creatify'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface ImageResult {
  imageType: ImageType
  fileName: string
  gcsUrl: string
  width: number
  height: number
  fileSize?: number
  altText?: string
}

/**
 * POST /api/content/[id]/generate - Generate content (blog, images, social)
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const {
      generateBlog = true,
      generatePodcast = true, // Phase 1: Generate podcast WITH blog
      regenPodcastDescription = false, // Regenerate description only (renamed to avoid shadowing imported function)
      generateImages: genImages = true,
      generateSocial = true,
      generateWrhqBlog = true,
      generateWrhqSocial = true,
      generateShortVideo = false, // Generate 9:16 short video
      regenVideoDescription = false, // Regenerate video description only
      generateVideoSocial = false, // Generate video social posts
    } = body

    // Get content item with client data and service location
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        serviceLocation: true,
        blogPost: true,
        podcast: true,
        images: true,
        videos: true,
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    // Debug: Log service location info
    console.log('=== LOCATION DEBUG ===')
    console.log('serviceLocationId:', contentItem.serviceLocationId)
    console.log('serviceLocation:', contentItem.serviceLocation)
    console.log('client.city:', contentItem.client.city)

    // Use service location if set, otherwise fall back to client's default location
    const contentCity = contentItem.serviceLocation?.city || contentItem.client.city
    // Always uppercase state abbreviation for consistency (e.g., "OR" not "Or")
    const contentState = (contentItem.serviceLocation?.state || contentItem.client.state).toUpperCase()

    console.log('Using city:', contentCity, 'state:', contentState)

    // Only set GENERATING status for initial blog+images generation
    const isInitialGeneration = generateBlog && genImages
    if (isInitialGeneration) {
      await prisma.contentItem.update({
        where: { id },
        data: {
          status: 'GENERATING',
          pipelineStep: 'starting',
        },
      })
    }

    const results: Record<string, {
      success: boolean
      error?: string
      title?: string
      count?: number
      status?: string
      jobId?: string
      clientPlatforms?: string[]
      wrhqPlatforms?: string[]
      checkedWrhqSettings?: string[]
    }> = {}

    // Generate client blog post
    if (generateBlog) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'blog' },
        })

        // Find the best service page to link to
        let servicePageUrl = contentItem.client.ctaUrl || ''
        const websiteUrl = contentItem.client.wordpressUrl

        if (websiteUrl) {
          try {
            const { scanAndMatchServicePage } = await import('@/lib/integrations/sitemap')
            console.log(`Scanning sitemap for ${websiteUrl} to find best service page...`)

            const result = await scanAndMatchServicePage({
              websiteUrl,
              topic: contentItem.paaQuestion,
              businessName: contentItem.client.businessName,
            })

            if (result.url) {
              console.log(`Found matching service page: ${result.url}`)
              servicePageUrl = result.url
            } else {
              console.log('No matching service page found, using default CTA URL')
            }
          } catch (error) {
            console.error('Error scanning sitemap:', error)
            // Fall back to CTA URL
          }
        }

        const blogResult = await generateBlogPost({
          paaQuestion: contentItem.paaQuestion,
          businessName: contentItem.client.businessName,
          city: contentCity,
          state: contentState,
          brandVoice: contentItem.client.brandVoice || 'Professional, helpful, and knowledgeable',
          serviceAreas: contentItem.client.serviceAreas || [],
          hasAdas: contentItem.client.offersAdasCalibration,
          ctaText: contentItem.client.ctaText,
          ctaUrl: servicePageUrl || contentItem.client.ctaUrl || '',
          phone: contentItem.client.phone,
          website: contentItem.client.wordpressUrl || servicePageUrl || '',
          servicePageUrl, // Pass the matched service page
        })

        // Create or update blog post (map embed is added during publishing, not here)
        const blogData = {
          clientId: contentItem.clientId,
          title: blogResult.title,
          slug: blogResult.slug,
          content: blogResult.content,
          excerpt: blogResult.excerpt,
          metaTitle: blogResult.metaTitle,
          metaDescription: blogResult.metaDescription,
          focusKeyword: blogResult.focusKeyword,
          wordCount: blogResult.content.split(/\s+/).length,
        }

        if (contentItem.blogPost) {
          await prisma.blogPost.update({
            where: { id: contentItem.blogPost.id },
            data: blogData,
          })
        } else {
          await prisma.blogPost.create({
            data: {
              ...blogData,
              contentItemId: id,
            },
          })
        }

        await prisma.contentItem.update({
          where: { id },
          data: { blogGenerated: true },
        })

        results.blog = { success: true, title: blogResult.title }

        // Phase 1: Start podcast generation (async - don't wait for completion)
        if (generatePodcast) {
          try {
            await prisma.contentItem.update({
              where: { id },
              data: { pipelineStep: 'podcast', podcastStatus: 'generating' },
            })

            // Import the podcast function
            const { createPodcast } = await import('@/lib/integrations/autocontent')

            // Construct the blog post URL (used for both podcast generation and description)
            const blogUrl = contentItem.client.wordpressUrl
              ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${blogResult.slug}`
              : ''

            // Create podcast job (returns immediately with job ID)
            // Use blog URL if available (API fetches content from page), otherwise use script
            const podcastJob = await createPodcast({
              title: blogResult.title,
              script: blogResult.content,
              blogUrl: blogUrl || undefined,
              duration: 'default', // 8-12 minutes
            })

            // Generate podcast description
            let podcastDescription = ''
            try {
              podcastDescription = await generatePodcastDescription({
                businessName: contentItem.client.businessName,
                city: contentCity,
                state: contentState,
                paaQuestion: contentItem.paaQuestion,
                blogPostUrl: blogUrl,
                servicePageUrl: servicePageUrl,
                googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
              })
            } catch (descError) {
              console.error('Error generating podcast description:', descError)
              // Non-fatal - continue without description
            }

            // Save job ID and description - podcast will be polled separately
            await prisma.podcast.upsert({
              where: { contentItemId: id },
              update: {
                script: blogResult.content,
                description: podcastDescription || null,
                autocontentJobId: podcastJob.jobId,
                status: 'PROCESSING',
              },
              create: {
                contentItemId: id,
                clientId: contentItem.clientId,
                audioUrl: '',
                script: blogResult.content,
                description: podcastDescription || null,
                autocontentJobId: podcastJob.jobId,
                status: 'PROCESSING',
              },
            })

            await prisma.contentItem.update({
              where: { id },
              data: {
                podcastGenerated: false,
                podcastStatus: 'processing',
                podcastDescription: podcastDescription || null,
              },
            })

            results.podcast = { success: true, status: 'processing', jobId: podcastJob.jobId }
          } catch (error) {
            console.error('Podcast generation error:', error)
            results.podcast = { success: false, error: String(error) }
            // Don't fail the whole pipeline if podcast fails
          }
        }
      } catch (error) {
        console.error('Blog generation error:', error)
        results.blog = { success: false, error: String(error) }
      }
    }

    // Generate podcast standalone (when blog already exists)
    if (generatePodcast && !generateBlog && contentItem.blogPost) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'podcast', podcastStatus: 'generating' },
        })

        // Import the podcast function
        const { createPodcast } = await import('@/lib/integrations/autocontent')

        // Get blog URL - prefer actual WordPress URL, fall back to constructed URL
        const blogUrl = contentItem.blogPost.wordpressUrl ||
          (contentItem.client.wordpressUrl
            ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${contentItem.blogPost.slug}`
            : '')

        // Create podcast job using blog URL (preferred) or content as fallback
        const podcastJob = await createPodcast({
          title: contentItem.blogPost.title,
          script: contentItem.blogPost.content,
          blogUrl: blogUrl || undefined,
          duration: 'default',
        })

        // Generate podcast description
        let podcastDescription = ''
        try {

          podcastDescription = await generatePodcastDescription({
            businessName: contentItem.client.businessName,
            city: contentCity,
            state: contentState,
            paaQuestion: contentItem.paaQuestion,
            blogPostUrl: blogUrl,
            googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
          })
        } catch (descError) {
          console.error('Error generating podcast description:', descError)
        }

        // Save job ID and description
        await prisma.podcast.upsert({
          where: { contentItemId: id },
          update: {
            script: contentItem.blogPost.content,
            description: podcastDescription || null,
            autocontentJobId: podcastJob.jobId,
            status: 'PROCESSING',
          },
          create: {
            contentItemId: id,
            clientId: contentItem.clientId,
            audioUrl: '',
            script: contentItem.blogPost.content,
            description: podcastDescription || null,
            autocontentJobId: podcastJob.jobId,
            status: 'PROCESSING',
          },
        })

        await prisma.contentItem.update({
          where: { id },
          data: {
            podcastGenerated: false,
            podcastStatus: 'processing',
            podcastDescription: podcastDescription || null,
          },
        })

        results.podcast = { success: true, status: 'processing', jobId: podcastJob.jobId }
      } catch (error) {
        console.error('Podcast generation error:', error)
        results.podcast = { success: false, error: String(error) }
      }
    }

    // Regenerate podcast description only (when user clicks "Regenerate Description")
    if (regenPodcastDescription && contentItem.blogPost) {
      try {
        // Get blog URL - prefer actual WordPress URL, fall back to constructed URL
        const blogUrl = contentItem.blogPost.wordpressUrl ||
          (contentItem.client.wordpressUrl
            ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${contentItem.blogPost.slug}`
            : '')

        const podcastDescription = await generatePodcastDescription({
          businessName: contentItem.client.businessName,
          city: contentCity,
          state: contentState,
          paaQuestion: contentItem.paaQuestion,
          blogPostUrl: blogUrl,
          googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
        })

        // Update both ContentItem and Podcast records
        await prisma.contentItem.update({
          where: { id },
          data: { podcastDescription },
        })

        if (contentItem.podcast) {
          await prisma.podcast.update({
            where: { contentItemId: id },
            data: { description: podcastDescription },
          })
        }

        results.podcastDescription = { success: true }
      } catch (error) {
        console.error('Podcast description generation error:', error)
        results.podcastDescription = { success: false, error: String(error) }
      }
    }

    // Generate images using Google AI Studio (Gemini)
    if (genImages) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'images' },
        })

        // Get image generation API key from database settings
        const imageApiKey = await getSetting('NANO_BANANA_API_KEY')

        // Build address string using client's main GBP address (not service location)
        const clientState = contentItem.client.state.toUpperCase()
        const address = `${contentItem.client.streetAddress}, ${contentItem.client.city}, ${clientState} ${contentItem.client.postalCode}`

        // Replace {location} placeholder in PAA question with service location
        const location = `${contentCity}, ${contentState}`
        const paaQuestionWithLocation = contentItem.paaQuestion.replace(/\{location\}/gi, location)

        // Generate both 16:9 and 1:1 images
        // Use service location for city/state on image
        const generatedImages = await generateBothImages({
          businessName: contentItem.client.businessName,
          city: contentCity,
          state: contentState,
          paaQuestion: paaQuestionWithLocation,
          phone: contentItem.client.phone,
          website: contentItem.client.wordpressUrl || contentItem.client.ctaUrl || '',
          address: address,
          apiKey: imageApiKey || '',
        })

        // Delete existing images and create new ones
        await prisma.image.deleteMany({
          where: { contentItemId: id },
        })

        const imageRecords: ImageResult[] = []

        // Generate a slug from the PAA question for filenames
        const contentSlug = contentItem.paaQuestion
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .substring(0, 50)
          .replace(/-+$/, '')

        // Add landscape image (16:9) - used for blog, Facebook, Twitter, LinkedIn
        if (generatedImages.landscape) {
          const landscapeFilename = `${contentItem.client.slug}/${contentSlug}/landscape.jpg`
          const gcsResult = await uploadFromUrl(generatedImages.landscape.url, landscapeFilename)

          imageRecords.push({
            imageType: 'BLOG_FEATURED' as ImageType,
            fileName: landscapeFilename,
            gcsUrl: gcsResult.url,
            width: generatedImages.landscape.width,
            height: generatedImages.landscape.height,
            altText: paaQuestionWithLocation,
          })
        }

        // Add square image (1:1) - used for Instagram
        if (generatedImages.square) {
          const squareFilename = `${contentItem.client.slug}/${contentSlug}/square.jpg`
          const gcsResult = await uploadFromUrl(generatedImages.square.url, squareFilename)

          imageRecords.push({
            imageType: 'INSTAGRAM_FEED' as ImageType,
            fileName: squareFilename,
            gcsUrl: gcsResult.url,
            width: generatedImages.square.width,
            height: generatedImages.square.height,
            altText: paaQuestionWithLocation,
          })
        }

        if (imageRecords.length > 0) {
          await prisma.image.createMany({
            data: imageRecords.map((img: ImageResult) => ({
              contentItemId: id,
              clientId: contentItem.clientId,
              imageType: img.imageType,
              fileName: img.fileName,
              gcsUrl: img.gcsUrl,
              width: img.width,
              height: img.height,
              fileSize: img.fileSize,
              altText: img.altText,
            })),
          })
        }

        await prisma.contentItem.update({
          where: { id },
          data: {
            imagesGenerated: imageRecords.length > 0,
            imagesTotalCount: imageRecords.length,
          },
        })

        results.images = { success: true, count: imageRecords.length }
      } catch (error) {
        console.error('Image generation error:', error)
        results.images = { success: false, error: String(error) }
      }
    }

    // Generate client social posts
    if (generateSocial) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'social' },
        })

        // Get the blog post for this content item
        const blogPost = await prisma.blogPost.findUnique({
          where: { contentItemId: id },
        })

        // Only generate posts for platforms that are:
        // 1. Selected as active in socialPlatforms
        // 2. Have an account ID configured in socialAccountIds
        // Skip video platforms (TIKTOK, YOUTUBE) until video generation is added
        const VIDEO_PLATFORMS = ['TIKTOK', 'YOUTUBE']
        const activePlatforms = (contentItem.client.socialPlatforms || []) as string[]
        const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
        console.log('Active platforms (socialPlatforms):', activePlatforms)
        console.log('Account IDs (socialAccountIds):', JSON.stringify(socialAccountIds))

        // Filter to only platforms that are active AND have a valid account ID
        const platforms = activePlatforms
          .map(p => p.toUpperCase())
          .filter(platform => {
            const platformLower = platform.toLowerCase()
            const hasAccountId = socialAccountIds &&
              typeof socialAccountIds[platformLower] === 'string' &&
              socialAccountIds[platformLower].trim().length > 0
            return hasAccountId && !VIDEO_PLATFORMS.includes(platform)
          })
        console.log('Final platforms to generate:', platforms)

        // Delete existing social posts
        await prisma.socialPost.deleteMany({
          where: { contentItemId: id },
        })

        // Import the generateSocialCaption function
        const { generateSocialCaption } = await import('@/lib/integrations/claude')

        // Generate social posts for each platform using Claude
        const socialPostsData = await Promise.all(
          platforms.map(async (platform) => {
            const platformUpper = platform.toUpperCase() as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM'
            try {
              const result = await generateSocialCaption({
                platform: platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                blogTitle: blogPost?.title || contentItem.paaQuestion,
                blogExcerpt: blogPost?.excerpt || contentItem.paaQuestion,
                businessName: contentItem.client.businessName,
                blogUrl: blogPost?.wordpressUrl || contentItem.client.wordpressUrl || '',
                location: `${contentCity}, ${contentState}`,
                googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
              })

              return {
                platform: platformUpper,
                caption: result.caption,
                hashtags: result.hashtags,
                firstComment: result.firstComment,
              }
            } catch (error) {
              console.error(`Failed to generate ${platform} post:`, error)
              // Fallback to simple template
              return {
                platform: platformUpper,
                caption: `${contentItem.paaQuestion}\n\nLearn more on our blog!`,
                hashtags: ['AutoGlass', 'WindshieldRepair'],
                firstComment: '',
              }
            }
          })
        )

        await prisma.socialPost.createMany({
          data: socialPostsData.map(post => ({
            contentItemId: id,
            clientId: contentItem.clientId,
            platform: post.platform,
            caption: post.caption,
            hashtags: post.hashtags,
            firstComment: post.firstComment,
            mediaUrls: [],
            scheduledTime: contentItem.scheduledDate,
          })),
        })

        await prisma.contentItem.update({
          where: { id },
          data: {
            socialGenerated: true,
            socialTotalCount: socialPostsData.length,
          },
        })

        results.social = { success: true, count: socialPostsData.length }
      } catch (error) {
        console.error('Social generation error:', error)
        results.social = { success: false, error: String(error) }
      }
    }

    // Generate WRHQ content
    console.log('WRHQ generation check:', { generateWrhqBlog, generateWrhqSocial })
    if (generateWrhqBlog || generateWrhqSocial) {
      try {
        // Generate WRHQ blog when requested (regardless of global setting - user explicitly requested it)
        if (generateWrhqBlog) {
          console.log('Starting WRHQ blog generation...')
          await prisma.contentItem.update({
            where: { id },
            data: { pipelineStep: 'wrhq_blog' },
          })

          // Get the client's blog post for reference
          const blogPost = await prisma.blogPost.findUnique({
            where: { contentItemId: id },
          })
          console.log('Blog post for WRHQ:', blogPost ? { title: blogPost.title, slug: blogPost.slug, wordpressUrl: blogPost.wordpressUrl } : 'not found')

          // Get the landscape image for the WRHQ post
          const landscapeImage = await prisma.image.findFirst({
            where: { contentItemId: id, imageType: 'BLOG_FEATURED' },
          })
          console.log('Landscape image found:', !!landscapeImage)

          // Use the published blog URL if available, otherwise construct from slug
          // The published URL is set after Step 1 completes and the blog is on WordPress
          const clientBlogUrl = blogPost?.wordpressUrl
            ? blogPost.wordpressUrl
            : (contentItem.client.wordpressUrl && blogPost
              ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${blogPost.slug}`
              : '')
          console.log('Client blog URL for WRHQ:', clientBlogUrl)

          // Import and call the WRHQ blog generation function
          const { generateWRHQBlogPost } = await import('@/lib/integrations/claude')

          console.log('Calling generateWRHQBlogPost with params:', {
            clientBlogTitle: blogPost?.title || contentItem.paaQuestion,
            clientBlogUrl: clientBlogUrl,
            clientBusinessName: contentItem.client.businessName,
            wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || '',
            googleMapsUrl: contentItem.client.googleMapsUrl || '',
          })

          const wrhqBlogResult = await generateWRHQBlogPost({
            clientBlogTitle: blogPost?.title || contentItem.paaQuestion,
            clientBlogUrl: clientBlogUrl,
            clientBlogExcerpt: blogPost?.excerpt || '',
            clientBusinessName: contentItem.client.businessName,
            clientCity: contentCity,
            clientState: contentState,
            paaQuestion: contentItem.paaQuestion,
            wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || '',
            googleMapsUrl: contentItem.client.googleMapsUrl || '',
            phone: contentItem.client.phone,
            featuredImageUrl: landscapeImage?.gcsUrl || undefined,
          })

          console.log('WRHQ blog result:', { title: wrhqBlogResult.title, slug: wrhqBlogResult.slug })

          // Save WRHQ blog post (map embed is added during publishing, not here)
          await prisma.wRHQBlogPost.upsert({
            where: { contentItemId: id },
            update: {
              title: wrhqBlogResult.title,
              slug: wrhqBlogResult.slug,
              content: wrhqBlogResult.content,
              excerpt: wrhqBlogResult.excerpt,
              metaTitle: wrhqBlogResult.metaTitle,
              metaDescription: wrhqBlogResult.metaDescription,
              focusKeyword: wrhqBlogResult.focusKeyword,
              wordCount: wrhqBlogResult.content.split(/\s+/).length,
              featuredImageUrl: landscapeImage?.gcsUrl || null,
            },
            create: {
              contentItemId: id,
              clientId: contentItem.clientId,
              title: wrhqBlogResult.title,
              slug: wrhqBlogResult.slug,
              content: wrhqBlogResult.content,
              excerpt: wrhqBlogResult.excerpt,
              metaTitle: wrhqBlogResult.metaTitle,
              metaDescription: wrhqBlogResult.metaDescription,
              focusKeyword: wrhqBlogResult.focusKeyword,
              wordCount: wrhqBlogResult.content.split(/\s+/).length,
              featuredImageUrl: landscapeImage?.gcsUrl || null,
            },
          })

          await prisma.contentItem.update({
            where: { id },
            data: { wrhqBlogGenerated: true },
          })

          results.wrhqBlog = { success: true, title: wrhqBlogResult.title }
          console.log('WRHQ blog generation complete')
        }

        if (generateWrhqSocial) {
          await prisma.contentItem.update({
            where: { id },
            data: { pipelineStep: 'wrhq_social' },
          })

          // Get WRHQ platforms from settings (skip video platforms - TikTok, YouTube)
          const wrhqPlatforms: string[] = []
          const platformKeys = [
            { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_FACEBOOK_ID, platform: 'FACEBOOK' },
            { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_INSTAGRAM_ID, platform: 'INSTAGRAM' },
            { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_LINKEDIN_ID, platform: 'LINKEDIN' },
            { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_TWITTER_ID, platform: 'TWITTER' },
            // TIKTOK and YOUTUBE skipped until video generation is added
          ]

          for (const { key, platform } of platformKeys) {
            const value = await getSetting(key)
            if (value) wrhqPlatforms.push(platform)
          }

          // Delete existing WRHQ social posts
          await prisma.wRHQSocialPost.deleteMany({
            where: { contentItemId: id },
          })

          // Create WRHQ social posts using Claude
          if (wrhqPlatforms.length > 0) {
            const { generateWRHQSocialCaption } = await import('@/lib/integrations/claude')

            // Get WRHQ blog post for URLs
            const wrhqBlogPost = await prisma.wRHQBlogPost.findUnique({
              where: { contentItemId: id },
            })
            const clientBlogPost = await prisma.blogPost.findUnique({
              where: { contentItemId: id },
            })

            const wrhqSocialPostsData = await Promise.all(
              wrhqPlatforms.map(async (platform) => {
                try {
                  const result = await generateWRHQSocialCaption({
                    platform: platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'gbp' | 'bluesky' | 'threads',
                    clientBusinessName: contentItem.client.businessName,
                    clientCity: contentCity,
                    clientState: contentState,
                    paaQuestion: contentItem.paaQuestion,
                    wrhqBlogUrl: wrhqBlogPost?.wordpressUrl || '',
                    clientBlogUrl: clientBlogPost?.wordpressUrl || '',
                    wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || '',
                    googleMapsUrl: contentItem.client.googleMapsUrl || '',
                    clientWebsite: contentItem.client.wordpressUrl || '',
                  })

                  return {
                    platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                    caption: result.caption,
                    hashtags: result.hashtags,
                    firstComment: result.firstComment,
                  }
                } catch (error) {
                  console.error(`Failed to generate WRHQ ${platform} post:`, error)
                  // Fallback to simple template
                  const fallbackFirstComment = clientBlogPost?.wordpressUrl
                    ? `Read the full article: ${clientBlogPost.wordpressUrl}`
                    : 'Read the full article on WindshieldRepairHQ.com'
                  return {
                    platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                    caption: `WRHQ Partner Spotlight: ${contentItem.client.businessName} in ${contentCity}, ${contentState} shares their expertise on ${contentItem.paaQuestion}. Looking for trusted auto glass advice? Read more on WindshieldRepairHQ.com.`,
                    hashtags: ['WRHQ', 'AutoGlass', 'WindshieldRepair'],
                    firstComment: fallbackFirstComment,
                  }
                }
              })
            )

            await prisma.wRHQSocialPost.createMany({
              data: wrhqSocialPostsData.map(post => ({
                contentItemId: id,
                platform: post.platform,
                caption: post.caption,
                hashtags: post.hashtags,
                firstComment: post.firstComment,
                mediaUrls: [],
                scheduledTime: contentItem.scheduledDate,
              })),
            })

            await prisma.contentItem.update({
              where: { id },
              data: {
                wrhqSocialGenerated: true,
                wrhqSocialTotalCount: wrhqSocialPostsData.length,
              },
            })

            results.wrhqSocial = { success: true, count: wrhqSocialPostsData.length }
          }
        }
      } catch (error) {
        console.error('WRHQ content generation error:', error)
        if (generateWrhqBlog) results.wrhqBlog = { success: false, error: String(error) }
        if (generateWrhqSocial) results.wrhqSocial = { success: false, error: String(error) }
      }
    }

    // Generate short video using Creatify
    if (generateShortVideo && contentItem.blogPost) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'video', shortVideoStatus: 'generating' },
        })

        const { createShortVideo } = await import('@/lib/integrations/creatify')
        const { generateVideoDescription } = await import('@/lib/integrations/claude')

        // Get blog URL
        const blogUrl = contentItem.blogPost.wordpressUrl ||
          (contentItem.client.wordpressUrl
            ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${contentItem.blogPost.slug}`
            : '')

        // Get landscape image for b-roll
        const landscapeImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
        const imageUrls = landscapeImage ? [landscapeImage.gcsUrl] : []

        // Create short video using Creatify's URL-to-Video API
        // This API properly supports video_length parameter (15, 30, 45, 60 seconds)
        // Costs 4 credits per 30s video
        //
        // Flow:
        // 1. Create link from blog URL (scrapes content)
        // 2. Update link with logo/images AND rich description for better script generation
        // 3. Create video with video_length: 30
        //
        // Fallback to lipsync if no blog URL available (script limited to ~500 chars)
        const cleanScript = contentItem.blogPost.content
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/\s+/g, ' ')    // Normalize whitespace
          .trim()
          .substring(0, 500)       // Limit to ~30 seconds of speech (fallback only)

        // CTA instruction for Creatify - tell it to use "Call Now" with phone number
        const creatifyDescription = [
          `CALL TO ACTION: Use "Call Now" - NOT "Buy Now" or "Shop Now"`,
          `Phone: ${contentItem.client.phone}`,
          `End the video with: "Call ${contentItem.client.businessName} at ${contentItem.client.phone} for a free quote!"`,
        ].join('\n')

        // Use client-specific Creatify settings if configured, otherwise use defaults
        const client = contentItem.client
        const videoJob = await createShortVideo({
          blogUrl: blogUrl || undefined,
          script: cleanScript, // Fallback if blogUrl fails
          title: contentItem.blogPost.title,
          imageUrls,
          logoUrl: client.logoUrl || undefined,
          // Rich description to enhance video script generation
          description: creatifyDescription,
          // DISABLED: Custom templates don't support video_length parameter
          // Using URL-to-Video API instead which properly supports video_length: 30
          templateId: client.creatifyTemplateId || undefined,
          autoPopulateFromBlog: false,
          aspectRatio: '9:16',
          duration: client.creatifyVideoLength || 30, // 15, 30, 45, or 60 seconds
          targetPlatform: 'tiktok',
          targetAudience: `car owners in ${contentCity}, ${contentState} looking for auto glass services`,
          // Client-configurable Creatify settings
          scriptStyle: (client.creatifyScriptStyle as ScriptStyle) || 'DiscoveryWriter',
          visualStyle: (client.creatifyVisualStyle as VisualStyle) || 'AvatarBubbleTemplate',
          modelVersion: (client.creatifyModelVersion as ModelVersion) || 'standard',
          // Note: avatarId and voiceId intentionally not passed - let Creatify choose for variety
          // Note: noCta not passed - testing if description instruction alone changes CTA to "Call Now"
        })

        // Generate video description
        let videoDescription = ''
        try {
          videoDescription = await generateVideoDescription({
            businessName: contentItem.client.businessName,
            city: contentCity,
            state: contentState,
            paaQuestion: contentItem.paaQuestion,
            blogPostUrl: blogUrl,
            servicePageUrl: contentItem.client.ctaUrl || undefined,
            googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
          })
        } catch (descError) {
          console.error('Error generating video description:', descError)
        }

        // Save or update video record
        const existingVideo = contentItem.videos.find(v => v.videoType === 'SHORT')
        if (existingVideo) {
          await prisma.video.update({
            where: { id: existingVideo.id },
            data: {
              providerJobId: videoJob.jobId,
              status: 'PROCESSING',
            },
          })
        } else {
          await prisma.video.create({
            data: {
              contentItemId: id,
              clientId: contentItem.clientId,
              videoType: 'SHORT',
              videoUrl: '', // Will be filled when job completes
              provider: 'CREATIFY',
              providerJobId: videoJob.jobId,
              aspectRatio: '9:16',
              status: 'PROCESSING',
            },
          })
        }

        await prisma.contentItem.update({
          where: { id },
          data: {
            shortVideoGenerated: false,
            shortVideoStatus: 'processing',
            shortVideoDescription: videoDescription || null,
          },
        })

        results.video = { success: true, status: 'processing', jobId: videoJob.jobId }
      } catch (error) {
        console.error('Video generation error:', error)
        results.video = { success: false, error: String(error) }
        await prisma.contentItem.update({
          where: { id },
          data: { shortVideoStatus: 'failed' },
        })
      }
    }

    // Regenerate video description only
    if (regenVideoDescription && contentItem.blogPost) {
      try {
        const { generateVideoDescription } = await import('@/lib/integrations/claude')

        const blogUrl = contentItem.blogPost.wordpressUrl ||
          (contentItem.client.wordpressUrl
            ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${contentItem.blogPost.slug}`
            : '')

        const videoDescription = await generateVideoDescription({
          businessName: contentItem.client.businessName,
          city: contentCity,
          state: contentState,
          paaQuestion: contentItem.paaQuestion,
          blogPostUrl: blogUrl,
          servicePageUrl: contentItem.client.ctaUrl || undefined,
          googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
        })

        await prisma.contentItem.update({
          where: { id },
          data: { shortVideoDescription: videoDescription },
        })

        results.videoDescription = { success: true }
      } catch (error) {
        console.error('Video description generation error:', error)
        results.videoDescription = { success: false, error: String(error) }
      }
    }

    // Generate video social posts for TikTok, YouTube, Instagram, Facebook
    if (generateVideoSocial && contentItem.blogPost) {
      try {
        const { generateVideoSocialCaption } = await import('@/lib/integrations/claude')

        // Video platforms that support short-form video
        const VIDEO_PLATFORMS = ['TIKTOK', 'YOUTUBE', 'INSTAGRAM', 'FACEBOOK']

        // Get active video platforms for client
        const activePlatforms = (contentItem.client.socialPlatforms || []) as string[]
        const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null

        const clientVideoPlatforms = activePlatforms
          .map(p => p.toUpperCase())
          .filter(platform => {
            const platformLower = platform.toLowerCase()
            const hasAccountId = socialAccountIds &&
              typeof socialAccountIds[platformLower] === 'string' &&
              socialAccountIds[platformLower].trim().length > 0
            return hasAccountId && VIDEO_PLATFORMS.includes(platform)
          })

        // Get WRHQ video platforms from settings
        const wrhqVideoPlatformKeys = [
          { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_TIKTOK_ID, platform: 'TIKTOK' },
          { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_YOUTUBE_ID, platform: 'YOUTUBE' },
          { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_INSTAGRAM_ID, platform: 'INSTAGRAM' },
          { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_FACEBOOK_ID, platform: 'FACEBOOK' },
        ]

        const wrhqVideoPlatforms: string[] = []
        for (const { key, platform } of wrhqVideoPlatformKeys) {
          const value = await getSetting(key)
          console.log(`WRHQ video platform check: ${platform} (${key}) = ${value ? 'configured' : 'not configured'}`)
          if (value) wrhqVideoPlatforms.push(platform)
        }

        console.log('Client video platforms:', clientVideoPlatforms)
        console.log('WRHQ video platforms:', wrhqVideoPlatforms)

        // Get the short video URL
        const shortVideo = contentItem.videos.find(v => v.videoType === 'SHORT')

        const hasAnyVideoPlatforms = clientVideoPlatforms.length > 0 || wrhqVideoPlatforms.length > 0

        if (hasAnyVideoPlatforms && shortVideo?.videoUrl) {
          const blogUrl = contentItem.blogPost.wordpressUrl ||
            (contentItem.client.wordpressUrl
              ? `${contentItem.client.wordpressUrl.replace(/\/$/, '')}/${contentItem.blogPost.slug}`
              : '')

          let totalPostsCreated = 0

          // Generate client video social posts
          if (clientVideoPlatforms.length > 0) {
            // Delete existing client video social posts, but preserve published ones
            await prisma.socialPost.deleteMany({
              where: {
                contentItemId: id,
                mediaType: 'video',
                status: { notIn: ['PUBLISHED', 'PROCESSING'] },
              },
            })

            // Get existing published platforms to avoid duplicates
            const existingPublishedPlatforms = await prisma.socialPost.findMany({
              where: {
                contentItemId: id,
                mediaType: 'video',
                status: { in: ['PUBLISHED', 'PROCESSING'] },
              },
              select: { platform: true },
            })
            const publishedPlatformSet = new Set(existingPublishedPlatforms.map(p => p.platform))

            // Filter out platforms that already have published posts
            const platformsToGenerate = clientVideoPlatforms.filter(p => !publishedPlatformSet.has(p as SocialPlatform))

            const videoSocialPostsData = await Promise.all(
              platformsToGenerate.map(async (platform) => {
                const platformLower = platform.toLowerCase() as 'tiktok' | 'youtube' | 'instagram' | 'facebook'
                try {
                  const result = await generateVideoSocialCaption({
                    platform: platformLower,
                    blogTitle: contentItem.blogPost!.title,
                    blogExcerpt: contentItem.blogPost!.excerpt || contentItem.paaQuestion,
                    businessName: contentItem.client.businessName,
                    blogUrl,
                    location: `${contentCity}, ${contentState}`,
                    googleMapsUrl: contentItem.client.googleMapsUrl || undefined,
                  })

                  return {
                    platform: platform as 'TIKTOK' | 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK',
                    caption: result.caption,
                    hashtags: result.hashtags,
                    firstComment: result.firstComment,
                    mediaUrls: [shortVideo.videoUrl],
                    mediaType: 'video',
                  }
                } catch (error) {
                  console.error(`Failed to generate ${platform} video post:`, error)
                  return {
                    platform: platform as 'TIKTOK' | 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK',
                    caption: `${contentItem.blogPost!.title}\n\nLearn more from ${contentItem.client.businessName}!`,
                    hashtags: ['AutoGlass', 'WindshieldRepair', 'Shorts'],
                    firstComment: `Read more: ${blogUrl}`,
                    mediaUrls: [shortVideo.videoUrl],
                    mediaType: 'video',
                  }
                }
              })
            )

            await prisma.socialPost.createMany({
              data: videoSocialPostsData.map(post => ({
                contentItemId: id,
                clientId: contentItem.clientId,
                platform: post.platform,
                caption: post.caption,
                hashtags: post.hashtags,
                firstComment: post.firstComment,
                mediaUrls: post.mediaUrls,
                mediaType: post.mediaType,
                scheduledTime: contentItem.scheduledDate,
              })),
            })

            totalPostsCreated += videoSocialPostsData.length
          }

          // Generate WRHQ video social posts
          if (wrhqVideoPlatforms.length > 0) {
            const { generateWRHQVideoSocialCaption } = await import('@/lib/integrations/claude')

            // Get WRHQ blog post for URLs
            const wrhqBlogPost = await prisma.wRHQBlogPost.findUnique({
              where: { contentItemId: id },
            })

            // Delete existing WRHQ video social posts, but preserve published ones
            await prisma.wRHQSocialPost.deleteMany({
              where: {
                contentItemId: id,
                mediaType: 'video',
                status: { notIn: ['PUBLISHED', 'PROCESSING'] },
              },
            })

            // Get existing published platforms to avoid duplicates
            const existingWrhqPublishedPlatforms = await prisma.wRHQSocialPost.findMany({
              where: {
                contentItemId: id,
                mediaType: 'video',
                status: { in: ['PUBLISHED', 'PROCESSING'] },
              },
              select: { platform: true },
            })
            const wrhqPublishedPlatformSet = new Set(existingWrhqPublishedPlatforms.map(p => p.platform))

            // Filter out platforms that already have published posts
            const wrhqPlatformsToGenerate = wrhqVideoPlatforms.filter(p => !wrhqPublishedPlatformSet.has(p as SocialPlatform))
            console.log('WRHQ published platforms (skipping):', Array.from(wrhqPublishedPlatformSet))
            console.log('WRHQ platforms to generate:', wrhqPlatformsToGenerate)

            const wrhqVideoPostsData = await Promise.all(
              wrhqPlatformsToGenerate.map(async (platform) => {
                const platformLower = platform.toLowerCase() as 'tiktok' | 'youtube' | 'instagram' | 'facebook'
                try {
                  const result = await generateWRHQVideoSocialCaption({
                    platform: platformLower,
                    clientBusinessName: contentItem.client.businessName,
                    clientCity: contentCity,
                    clientState: contentState,
                    paaQuestion: contentItem.paaQuestion,
                    wrhqBlogUrl: wrhqBlogPost?.wordpressUrl || '',
                    clientBlogUrl: blogUrl,
                    wrhqDirectoryUrl: contentItem.client.wrhqDirectoryUrl || '',
                    googleMapsUrl: contentItem.client.googleMapsUrl || '',
                  })

                  return {
                    platform: platform as 'TIKTOK' | 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK',
                    caption: result.caption,
                    hashtags: result.hashtags,
                    firstComment: result.firstComment,
                    mediaUrls: [shortVideo.videoUrl],
                    mediaType: 'video' as const,
                  }
                } catch (error) {
                  console.error(`Failed to generate WRHQ ${platform} video post:`, error)
                  return {
                    platform: platform as 'TIKTOK' | 'YOUTUBE' | 'INSTAGRAM' | 'FACEBOOK',
                    caption: `Check out ${contentItem.client.businessName} in ${contentCity}, ${contentState}! 🚗\n\n${contentItem.paaQuestion}`,
                    hashtags: ['AutoGlass', 'WindshieldRepair', 'WRHQ'],
                    firstComment: wrhqBlogPost?.wordpressUrl || blogUrl,
                    mediaUrls: [shortVideo.videoUrl],
                    mediaType: 'video' as const,
                  }
                }
              })
            )

            await prisma.wRHQSocialPost.createMany({
              data: wrhqVideoPostsData.map(post => ({
                contentItemId: id,
                platform: post.platform,
                caption: post.caption,
                hashtags: post.hashtags,
                firstComment: post.firstComment,
                mediaUrls: post.mediaUrls,
                mediaType: post.mediaType,
                scheduledTime: contentItem.scheduledDate,
              })),
            })

            totalPostsCreated += wrhqVideoPostsData.length
          }

          results.videoSocial = {
            success: true,
            count: totalPostsCreated,
            clientPlatforms: clientVideoPlatforms,
            wrhqPlatforms: wrhqVideoPlatforms,
          }
        } else {
          // Provide detailed feedback about what's missing
          const missingInfo: string[] = []
          if (!shortVideo?.videoUrl) {
            missingInfo.push('Video not ready yet (no videoUrl)')
          }
          if (clientVideoPlatforms.length === 0 && wrhqVideoPlatforms.length === 0) {
            missingInfo.push('No video platforms configured. Check Settings > WRHQ for YouTube, TikTok, Instagram, and Facebook Late account IDs.')
          }
          results.videoSocial = {
            success: false,
            error: missingInfo.join('. '),
            clientPlatforms: clientVideoPlatforms,
            wrhqPlatforms: wrhqVideoPlatforms,
            checkedWrhqSettings: ['WRHQ_LATE_YOUTUBE_ID', 'WRHQ_LATE_TIKTOK_ID', 'WRHQ_LATE_INSTAGRAM_ID', 'WRHQ_LATE_FACEBOOK_ID'],
          }
        }
      } catch (error) {
        console.error('Video social generation error:', error)
        results.videoSocial = { success: false, error: String(error) }
      }
    }

    // Update final status - only update overall status if generating initial content (blog + images)
    const allSuccessful = Object.values(results).every(r => r.success)

    if (isInitialGeneration) {
      // Full initial generation - set to REVIEW
      await prisma.contentItem.update({
        where: { id },
        data: {
          status: allSuccessful ? 'REVIEW' : 'FAILED',
          pipelineStep: allSuccessful ? 'complete' : 'failed',
          lastError: allSuccessful ? null : JSON.stringify(results),
        },
      })
    } else if (!allSuccessful) {
      // Partial generation failed - just update error
      await prisma.contentItem.update({
        where: { id },
        data: {
          lastError: JSON.stringify(results),
        },
      })
    }

    return NextResponse.json({
      success: allSuccessful,
      results,
    })
  } catch (error) {
    console.error('Content generation error:', error)

    // Update status to failed
    await prisma.contentItem.update({
      where: { id },
      data: {
        status: 'FAILED',
        pipelineStep: 'failed',
        lastError: String(error),
      },
    })

    return NextResponse.json({ error: 'Failed to generate content' }, { status: 500 })
  }
}
