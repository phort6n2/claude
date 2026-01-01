import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateBlogPost } from '@/lib/integrations/claude'
import { generateBothImages } from '@/lib/integrations/nano-banana'
import { getSetting, WRHQ_SETTINGS_KEYS } from '@/lib/settings'
import { ImageType } from '@prisma/client'

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
      generateImages: genImages = true,
      generateSocial = true,
      generateWrhqBlog = true,
      generateWrhqSocial = true,
    } = body

    // Get content item with client data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        images: true,
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    // Update status to GENERATING
    await prisma.contentItem.update({
      where: { id },
      data: {
        status: 'GENERATING',
        pipelineStep: 'starting',
      },
    })

    const results: Record<string, { success: boolean; error?: string; title?: string; count?: number; status?: string; jobId?: string }> = {}

    // Generate client blog post
    if (generateBlog) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'blog' },
        })

        const blogResult = await generateBlogPost({
          paaQuestion: contentItem.paaQuestion,
          businessName: contentItem.client.businessName,
          city: contentItem.client.city,
          state: contentItem.client.state,
          brandVoice: contentItem.client.brandVoice || 'Professional, helpful, and knowledgeable',
          serviceAreas: contentItem.client.serviceAreas || [],
          hasAdas: contentItem.client.hasAdasCalibration,
          ctaText: contentItem.client.ctaText,
          ctaUrl: contentItem.client.ctaUrl || '',
          phone: contentItem.client.phone,
          website: contentItem.client.ctaUrl || contentItem.client.wordpressUrl || '',
        })

        // Create or update blog post
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

            // Create podcast job (returns immediately with job ID)
            const podcastJob = await createPodcast({
              title: blogResult.title,
              script: blogResult.content,
              duration: 'default', // 8-12 minutes
            })

            // Save job ID - podcast will be polled separately
            await prisma.podcast.upsert({
              where: { contentItemId: id },
              update: {
                script: blogResult.content,
                autocontentJobId: podcastJob.jobId,
                status: 'PROCESSING',
              },
              create: {
                contentItemId: id,
                clientId: contentItem.clientId,
                audioUrl: '',
                script: blogResult.content,
                autocontentJobId: podcastJob.jobId,
                status: 'PROCESSING',
              },
            })

            await prisma.contentItem.update({
              where: { id },
              data: {
                podcastGenerated: false,
                podcastStatus: 'processing',
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

    // Generate images using Google AI Studio (Gemini)
    if (genImages) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'images' },
        })

        // Get image generation API key from database settings
        const imageApiKey = await getSetting('NANO_BANANA_API_KEY')

        // Build address string
        const address = `${contentItem.client.streetAddress}, ${contentItem.client.city}, ${contentItem.client.state} ${contentItem.client.postalCode}`

        // Generate both 16:9 and 1:1 images
        const generatedImages = await generateBothImages({
          businessName: contentItem.client.businessName,
          city: contentItem.client.city,
          state: contentItem.client.state,
          paaQuestion: contentItem.paaQuestion,
          phone: contentItem.client.phone,
          website: contentItem.client.ctaUrl || contentItem.client.wordpressUrl || '',
          address: address,
          apiKey: imageApiKey || '',
        })

        // Delete existing images and create new ones
        await prisma.image.deleteMany({
          where: { contentItemId: id },
        })

        const imageRecords: ImageResult[] = []

        // Add landscape image (16:9) - used for blog, Facebook, Twitter, LinkedIn
        if (generatedImages.landscape) {
          imageRecords.push({
            imageType: 'BLOG_FEATURED' as ImageType,
            fileName: `${contentItem.paaQuestion.substring(0, 30).replace(/\s+/g, '-')}-landscape.png`,
            gcsUrl: generatedImages.landscape.url, // Data URL with base64
            width: generatedImages.landscape.width,
            height: generatedImages.landscape.height,
            altText: contentItem.paaQuestion,
          })
        }

        // Add square image (1:1) - used for Instagram
        if (generatedImages.square) {
          imageRecords.push({
            imageType: 'INSTAGRAM_FEED' as ImageType,
            fileName: `${contentItem.paaQuestion.substring(0, 30).replace(/\s+/g, '-')}-square.png`,
            gcsUrl: generatedImages.square.url, // Data URL with base64
            width: generatedImages.square.width,
            height: generatedImages.square.height,
            altText: contentItem.paaQuestion,
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

        // Use client's configured platforms or default to common ones
        const configuredPlatforms = (contentItem.client.socialPlatforms || []) as string[]
        const platforms = configuredPlatforms.length > 0
          ? configuredPlatforms
          : ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER', 'GBP'] // Default platforms

        // Delete existing social posts
        await prisma.socialPost.deleteMany({
          where: { contentItemId: id },
        })

        // Import the generateSocialCaption function
        const { generateSocialCaption } = await import('@/lib/integrations/claude')

        // Generate social posts for each platform using Claude
        const socialPostsData = await Promise.all(
          platforms.map(async (platform) => {
            try {
              const result = await generateSocialCaption({
                platform: platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                blogTitle: blogPost?.title || contentItem.paaQuestion,
                blogExcerpt: blogPost?.excerpt || contentItem.paaQuestion,
                businessName: contentItem.client.businessName,
                blogUrl: contentItem.client.wordpressUrl || '',
              })

              return {
                platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                caption: result.caption,
                hashtags: result.hashtags,
                firstComment: result.firstComment,
              }
            } catch (error) {
              console.error(`Failed to generate ${platform} post:`, error)
              // Fallback to simple template
              return {
                platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
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

    // Generate WRHQ content (if enabled)
    if (generateWrhqBlog || generateWrhqSocial) {
      try {
        const wrhqEnabled = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_ENABLED)

        if (wrhqEnabled === 'true') {
          if (generateWrhqBlog) {
            await prisma.contentItem.update({
              where: { id },
              data: {
                pipelineStep: 'wrhq_blog',
                wrhqBlogGenerated: true,
              },
            })
            results.wrhqBlog = { success: true }
          }

          if (generateWrhqSocial) {
            await prisma.contentItem.update({
              where: { id },
              data: { pipelineStep: 'wrhq_social' },
            })

            // Get WRHQ platforms from settings
            const wrhqPlatforms: string[] = []
            const platformKeys = [
              { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_FACEBOOK_ID, platform: 'FACEBOOK' },
              { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_INSTAGRAM_ID, platform: 'INSTAGRAM' },
              { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_LINKEDIN_ID, platform: 'LINKEDIN' },
              { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_TWITTER_ID, platform: 'TWITTER' },
              { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_TIKTOK_ID, platform: 'TIKTOK' },
            ]

            for (const { key, platform } of platformKeys) {
              const value = await getSetting(key)
              if (value) wrhqPlatforms.push(platform)
            }

            // Delete existing WRHQ social posts
            await prisma.wRHQSocialPost.deleteMany({
              where: { contentItemId: id },
            })

            // Create WRHQ social posts
            if (wrhqPlatforms.length > 0) {
              await prisma.wRHQSocialPost.createMany({
                data: wrhqPlatforms.map(platform => ({
                  contentItemId: id,
                  platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
                  caption: `WRHQ Partner Spotlight: ${contentItem.client.businessName} on ${contentItem.paaQuestion}\n\n#WRHQ #AutoGlassPartner`,
                  hashtags: ['WRHQ', 'AutoGlassPartner', 'IndustryExpert'],
                  firstComment: 'Check out the full article!',
                  mediaUrls: [],
                  scheduledTime: contentItem.scheduledDate,
                })),
              })

              await prisma.contentItem.update({
                where: { id },
                data: {
                  wrhqSocialGenerated: true,
                  wrhqSocialTotalCount: wrhqPlatforms.length,
                },
              })

              results.wrhqSocial = { success: true, count: wrhqPlatforms.length }
            }
          }
        }
      } catch (error) {
        console.error('WRHQ content generation error:', error)
        if (generateWrhqBlog) results.wrhqBlog = { success: false, error: String(error) }
        if (generateWrhqSocial) results.wrhqSocial = { success: false, error: String(error) }
      }
    }

    // Update final status
    const allSuccessful = Object.values(results).every(r => r.success)

    await prisma.contentItem.update({
      where: { id },
      data: {
        status: allSuccessful ? 'REVIEW' : 'FAILED',
        pipelineStep: allSuccessful ? 'complete' : 'failed',
        lastError: allSuccessful ? null : JSON.stringify(results),
      },
    })

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
