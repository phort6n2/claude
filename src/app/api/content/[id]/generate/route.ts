import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateBlogPost } from '@/lib/integrations/claude'
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

    const results: Record<string, { success: boolean; error?: string; title?: string; count?: number }> = {}

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

        // Phase 1: Generate podcast immediately after blog (using blog content as script)
        if (generatePodcast) {
          try {
            await prisma.contentItem.update({
              where: { id },
              data: { pipelineStep: 'podcast' },
            })

            // Import the createPodcast function dynamically to avoid circular deps
            const { createPodcast } = await import('@/lib/integrations/autocontent')

            const podcastResult = await createPodcast({
              title: blogResult.title,
              script: blogResult.content, // Use blog content as script
              duration: 'medium',
            })

            // Create or update podcast record
            await prisma.podcast.upsert({
              where: { contentItemId: id },
              update: {
                audioUrl: podcastResult.audioUrl || '',
                duration: podcastResult.duration,
                script: blogResult.content,
                autocontentJobId: podcastResult.jobId,
                status: 'READY',
              },
              create: {
                contentItemId: id,
                clientId: contentItem.clientId,
                audioUrl: podcastResult.audioUrl || '',
                duration: podcastResult.duration,
                script: blogResult.content,
                autocontentJobId: podcastResult.jobId,
                status: 'READY',
              },
            })

            await prisma.contentItem.update({
              where: { id },
              data: {
                podcastGenerated: true,
                podcastStatus: 'ready',
                podcastUrl: podcastResult.audioUrl,
              },
            })

            results.podcast = { success: true }
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

    // Generate images (placeholder - would call Google AI Studio)
    if (genImages) {
      try {
        await prisma.contentItem.update({
          where: { id },
          data: { pipelineStep: 'images' },
        })

        // For now, create placeholder image records
        const imageTypes: ImageType[] = [
          'BLOG_FEATURED',
          'FACEBOOK',
          'INSTAGRAM_FEED',
          'INSTAGRAM_STORY',
          'TWITTER',
          'LINKEDIN',
        ]

        // Delete existing images and create new ones
        await prisma.image.deleteMany({
          where: { contentItemId: id },
        })

        const imageResults: ImageResult[] = imageTypes.map(imageType => ({
          imageType,
          fileName: `${contentItem.paaQuestion.substring(0, 30).replace(/\s+/g, '-')}-${imageType.toLowerCase()}.jpg`,
          gcsUrl: `https://storage.googleapis.com/placeholder/${id}/${imageType.toLowerCase()}.jpg`,
          width: imageType.includes('STORY') ? 1080 : 1200,
          height: imageType.includes('STORY') ? 1920 : imageType === 'INSTAGRAM_FEED' ? 1080 : 675,
          altText: contentItem.paaQuestion,
        }))

        await prisma.image.createMany({
          data: imageResults.map((img: ImageResult) => ({
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

        await prisma.contentItem.update({
          where: { id },
          data: {
            imagesGenerated: true,
            imagesTotalCount: imageResults.length,
          },
        })

        results.images = { success: true, count: imageResults.length }
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

        const platforms = (contentItem.client.socialPlatforms || []) as string[]

        // Delete existing social posts
        await prisma.socialPost.deleteMany({
          where: { contentItemId: id },
        })

        // Generate social posts for each platform
        const socialPosts = platforms.map(platform => ({
          platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'TWITTER' | 'TIKTOK' | 'GBP' | 'YOUTUBE' | 'BLUESKY' | 'THREADS' | 'REDDIT' | 'PINTEREST' | 'TELEGRAM',
          caption: `${contentItem.paaQuestion}\n\nLearn more on our blog!\n\n#${contentItem.client.businessName.replace(/\s+/g, '')} #AutoGlass`,
          hashtags: ['AutoGlass', 'WindshieldRepair', contentItem.client.businessName.replace(/\s+/g, '')],
          firstComment: 'Link to blog post in bio!',
        }))

        await prisma.socialPost.createMany({
          data: socialPosts.map(post => ({
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
            socialTotalCount: socialPosts.length,
          },
        })

        results.social = { success: true, count: socialPosts.length }
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
