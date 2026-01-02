import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateBlogPost, generatePodcastDescription } from '@/lib/integrations/claude'
import { generateBothImages } from '@/lib/integrations/nano-banana'
import { uploadFromUrl } from '@/lib/integrations/gcs'
import { getSetting, WRHQ_SETTINGS_KEYS } from '@/lib/settings'
import { ImageType } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Generate a Google Maps embed HTML for a business location
 */
function generateGoogleMapsEmbed(params: {
  businessName: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
}): string {
  // Build the full address for the map query
  const fullAddress = `${params.businessName}, ${params.streetAddress}, ${params.city}, ${params.state} ${params.postalCode}`
  const encodedAddress = encodeURIComponent(fullAddress)

  return `
<div class="google-map-embed" style="margin: 30px 0;">
  <h3 style="margin-bottom: 15px;">Find Us</h3>
  <iframe
    src="https://maps.google.com/maps?q=${encodedAddress}&output=embed"
    width="100%"
    height="400"
    style="border:0; border-radius: 8px;"
    allowfullscreen=""
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
    title="Map showing location of ${params.businessName}">
  </iframe>
</div>`
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
      generateImages: genImages = true,
      generateSocial = true,
      generateWrhqBlog = true,
      generateWrhqSocial = true,
    } = body

    // Get content item with client data and service location
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        serviceLocation: true,
        blogPost: true,
        images: true,
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    // Use service location if set, otherwise fall back to client's default location
    const contentCity = contentItem.serviceLocation?.city || contentItem.client.city
    // Always uppercase state abbreviation for consistency (e.g., "OR" not "Or")
    const contentState = (contentItem.serviceLocation?.state || contentItem.client.state).toUpperCase()

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

    const results: Record<string, { success: boolean; error?: string; title?: string; count?: number; status?: string; jobId?: string }> = {}

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
          hasAdas: contentItem.client.hasAdasCalibration,
          ctaText: contentItem.client.ctaText,
          ctaUrl: servicePageUrl || contentItem.client.ctaUrl || '',
          phone: contentItem.client.phone,
          website: contentItem.client.wordpressUrl || servicePageUrl || '',
          servicePageUrl, // Pass the matched service page
        })

        // Generate Google Maps embed for the business location
        const mapEmbed = generateGoogleMapsEmbed({
          businessName: contentItem.client.businessName,
          streetAddress: contentItem.client.streetAddress,
          city: contentCity,
          state: contentState,
          postalCode: contentItem.client.postalCode,
        })

        // Append map embed to blog content (before the closing content)
        const blogContentWithMap = blogResult.content + mapEmbed

        // Create or update blog post
        const blogData = {
          clientId: contentItem.clientId,
          title: blogResult.title,
          slug: blogResult.slug,
          content: blogContentWithMap,
          excerpt: blogResult.excerpt,
          metaTitle: blogResult.metaTitle,
          metaDescription: blogResult.metaDescription,
          focusKeyword: blogResult.focusKeyword,
          wordCount: blogContentWithMap.split(/\s+/).length,
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
        // Use client's main GBP address for the business location on image
        // But use service location in the PAA headline
        const generatedImages = await generateBothImages({
          businessName: contentItem.client.businessName,
          city: contentItem.client.city,
          state: clientState,
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

          // Generate Google Maps embed for WRHQ blog (same business location)
          const wrhqMapEmbed = generateGoogleMapsEmbed({
            businessName: contentItem.client.businessName,
            streetAddress: contentItem.client.streetAddress,
            city: contentCity,
            state: contentState,
            postalCode: contentItem.client.postalCode,
          })

          // Append map embed to WRHQ blog content
          const wrhqBlogContentWithMap = wrhqBlogResult.content + wrhqMapEmbed

          // Save WRHQ blog post
          await prisma.wRHQBlogPost.upsert({
            where: { contentItemId: id },
            update: {
              title: wrhqBlogResult.title,
              slug: wrhqBlogResult.slug,
              content: wrhqBlogContentWithMap,
              excerpt: wrhqBlogResult.excerpt,
              metaTitle: wrhqBlogResult.metaTitle,
              metaDescription: wrhqBlogResult.metaDescription,
              focusKeyword: wrhqBlogResult.focusKeyword,
              wordCount: wrhqBlogContentWithMap.split(/\s+/).length,
              featuredImageUrl: landscapeImage?.gcsUrl || null,
            },
            create: {
              contentItemId: id,
              clientId: contentItem.clientId,
              title: wrhqBlogResult.title,
              slug: wrhqBlogResult.slug,
              content: wrhqBlogContentWithMap,
              excerpt: wrhqBlogResult.excerpt,
              metaTitle: wrhqBlogResult.metaTitle,
              metaDescription: wrhqBlogResult.metaDescription,
              focusKeyword: wrhqBlogResult.focusKeyword,
              wordCount: wrhqBlogContentWithMap.split(/\s+/).length,
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
