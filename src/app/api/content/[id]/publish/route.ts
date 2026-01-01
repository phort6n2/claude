import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { publishToWordPress } from '@/lib/integrations/wordpress'
import { schedulePost } from '@/lib/integrations/getlate'
import { getSetting, WRHQ_SETTINGS_KEYS } from '@/lib/settings'
import { validateScheduledDate } from '@/lib/scheduling'
import { Image, SocialPost, WRHQSocialPost } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/publish - Publish content to WordPress and schedule social
 * Body: {
 *   publishClientBlog?: boolean,
 *   publishWrhqBlog?: boolean,
 *   scheduleSocial?: boolean,
 *   scheduleWrhqSocial?: boolean
 * }
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
      publishClientBlog = true,
      publishWrhqBlog = true,
      scheduleSocial = true,
      scheduleWrhqSocial = true,
    } = body

    // Get content item with all related data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        wrhqBlogPost: true,
        images: true,
        podcast: true,
        socialPosts: true,
        wrhqSocialPosts: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    // Validate scheduled date
    const validationError = await validateScheduledDate(
      contentItem.scheduledDate,
      contentItem.clientId,
      id
    )

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Check that content exists for what's being published
    if (publishClientBlog && !contentItem.blogGenerated) {
      return NextResponse.json({ error: 'Blog must be generated before publishing' }, { status: 400 })
    }
    if (publishWrhqBlog && !contentItem.wrhqBlogGenerated) {
      return NextResponse.json({ error: 'WRHQ Blog must be generated before publishing' }, { status: 400 })
    }
    if (scheduleSocial && !contentItem.socialGenerated) {
      return NextResponse.json({ error: 'Social posts must be generated before scheduling' }, { status: 400 })
    }
    if (scheduleWrhqSocial && !contentItem.wrhqSocialGenerated) {
      return NextResponse.json({ error: 'WRHQ Social posts must be generated before scheduling' }, { status: 400 })
    }

    // Update status to PUBLISHING
    await prisma.contentItem.update({
      where: { id },
      data: {
        status: 'PUBLISHING',
        pipelineStep: 'publishing',
      },
    })

    const results: Record<string, unknown> = {}

    // Publish client blog to WordPress
    if (publishClientBlog && contentItem.blogPost) {
      try {
        const featuredImage = contentItem.images.find((img: Image) => img.imageType === 'BLOG_FEATURED')

        const wpResult = await publishToWordPress({
          client: contentItem.client,
          title: contentItem.blogPost.title,
          content: contentItem.blogPost.content,
          excerpt: contentItem.blogPost.excerpt || undefined,
          slug: contentItem.blogPost.slug,
          scheduledDate: contentItem.scheduledDate,
          featuredImageUrl: featuredImage?.gcsUrl,
          metaTitle: contentItem.blogPost.metaTitle || undefined,
          metaDescription: contentItem.blogPost.metaDescription || undefined,
          schemaJson: contentItem.blogPost.schemaJson || undefined,
        })

        await prisma.blogPost.update({
          where: { id: contentItem.blogPost.id },
          data: {
            wordpressPostId: wpResult.postId,
            wordpressUrl: wpResult.url,
            featuredImageId: wpResult.featuredImageId,
            publishedAt: contentItem.scheduledDate,
          },
        })

        await prisma.contentItem.update({
          where: { id },
          data: {
            clientBlogPublished: true,
            clientBlogPublishedAt: new Date(),
            clientBlogUrl: wpResult.url,
          },
        })

        results.clientBlog = { success: true, url: wpResult.url }
      } catch (error) {
        console.error('Client blog publish error:', error)
        results.clientBlog = { success: false, error: String(error) }
      }
    }

    // Publish WRHQ blog to WordPress (if credentials are configured)
    if (publishWrhqBlog && contentItem.wrhqBlogPost) {
      try {
        let wrhqWpUrl: string | null = null
        let wrhqWpUser: string | null = null
        let wrhqWpPass: string | null = null

        try {
          // Get URL and username normally (not encrypted)
          wrhqWpUrl = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_URL)
          wrhqWpUser = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_USERNAME)

          // Get password RAW (still encrypted) - WordPress will decrypt it
          // This mirrors how client passwords work (stored encrypted, WordPress decrypts)
          const wrhqWpPassSetting = await prisma.setting.findUnique({
            where: { key: WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_APP_PASSWORD }
          })
          wrhqWpPass = wrhqWpPassSetting?.value || null
        } catch (settingsError) {
          console.error('Error reading WRHQ settings:', settingsError)
          results.wrhqBlog = { success: false, error: 'WRHQ credentials could not be read. Please go to Settings → WRHQ and re-enter the WordPress App Password.' }
        }

        // Check if WRHQ WordPress credentials are configured
        if (!wrhqWpUrl || !wrhqWpUser || !wrhqWpPass) {
          if (!results.wrhqBlog) {
            results.wrhqBlog = { success: false, error: 'WRHQ WordPress credentials not configured. Please go to Settings → WRHQ and re-enter the WordPress App Password.' }
          }
        } else {
            // Use the 16:9 landscape image for WRHQ blog
            const featuredImage = contentItem.images.find((img: Image) => img.imageType === 'BLOG_FEATURED')

            const wpResult = await publishToWordPress({
              client: {
                ...contentItem.client,
                wordpressUrl: wrhqWpUrl,
                wordpressUsername: wrhqWpUser,
                wordpressAppPassword: wrhqWpPass,
              },
              title: contentItem.wrhqBlogPost.title,
              content: contentItem.wrhqBlogPost.content,
              excerpt: contentItem.wrhqBlogPost.excerpt || undefined,
              slug: contentItem.wrhqBlogPost.slug,
              scheduledDate: contentItem.scheduledDate,
              featuredImageUrl: featuredImage?.gcsUrl,
              metaTitle: contentItem.wrhqBlogPost.metaTitle || undefined,
              metaDescription: contentItem.wrhqBlogPost.metaDescription || undefined,
              categorySlug: 'auto-glass-repair',
              categoryName: 'Auto Glass Repair',
            })

            // Update the WRHQ blog post with WordPress info
            await prisma.wRHQBlogPost.update({
              where: { id: contentItem.wrhqBlogPost.id },
              data: {
                wordpressPostId: wpResult.postId,
                wordpressUrl: wpResult.url,
                publishedAt: contentItem.scheduledDate,
              },
            })

            await prisma.contentItem.update({
              where: { id },
              data: {
                wrhqBlogPublished: true,
                wrhqBlogPublishedAt: new Date(),
                wrhqBlogUrl: wpResult.url,
              },
            })

            results.wrhqBlog = { success: true, url: wpResult.url }
          }
      } catch (error) {
        console.error('WRHQ blog publish error:', error)
        results.wrhqBlog = { success: false, error: String(error) }
      }
    }

    // Schedule client social posts
    if (scheduleSocial && contentItem.socialGenerated) {
      try {
        const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null

        for (const socialPost of contentItem.socialPosts) {

          const accountId = socialAccountIds?.[socialPost.platform.toLowerCase()]
          if (!accountId) continue

          // Select correct image based on platform:
          // - Instagram uses square 1:1 image (INSTAGRAM_FEED)
          // - All others use 16:9 landscape image (BLOG_FEATURED)
          const imageType = socialPost.platform === 'INSTAGRAM' ? 'INSTAGRAM_FEED' : 'BLOG_FEATURED'
          const image = contentItem.images.find((img: Image) => img.imageType === imageType)
            || contentItem.images.find((img: Image) => img.imageType === 'BLOG_FEATURED')

          const lateResult = await schedulePost({
            accountId,
            platform: socialPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
            caption: socialPost.caption,
            mediaUrls: image ? [image.gcsUrl] : [],
            scheduledTime: contentItem.scheduledDate,
            hashtags: socialPost.hashtags,
            firstComment: socialPost.firstComment || undefined,
          })

          await prisma.socialPost.update({
            where: { id: socialPost.id },
            data: {
              getlatePostId: lateResult.postId,
              status: 'SCHEDULED',
            },
          })
        }

        await prisma.contentItem.update({
          where: { id },
          data: {
            socialPublished: true,
            socialPublishedAt: new Date(),
          },
        })

        results.social = { success: true, count: contentItem.socialPosts.length }
      } catch (error) {
        console.error('Social scheduling error:', error)
        results.social = { success: false, error: String(error) }
      }
    }

    // Schedule WRHQ social posts
    if (scheduleWrhqSocial && contentItem.wrhqSocialGenerated) {
      try {
        for (const wrhqPost of contentItem.wrhqSocialPosts) {
          const accountIdKey = `WRHQ_LATE_${wrhqPost.platform}_ID` as keyof typeof WRHQ_SETTINGS_KEYS
          const accountId = await getSetting(WRHQ_SETTINGS_KEYS[accountIdKey])

          if (!accountId) continue

          // Select correct image based on platform
          const imageType = wrhqPost.platform === 'INSTAGRAM' ? 'INSTAGRAM_FEED' : 'BLOG_FEATURED'
          const image = contentItem.images.find((img: Image) => img.imageType === imageType)
            || contentItem.images.find((img: Image) => img.imageType === 'BLOG_FEATURED')

          const lateResult = await schedulePost({
            accountId,
            platform: wrhqPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
            caption: wrhqPost.caption,
            mediaUrls: image ? [image.gcsUrl] : [],
            scheduledTime: contentItem.scheduledDate,
            hashtags: wrhqPost.hashtags,
            firstComment: wrhqPost.firstComment || undefined,
          })

          await prisma.wRHQSocialPost.update({
            where: { id: wrhqPost.id },
            data: {
              getlatePostId: lateResult.postId,
              status: 'SCHEDULED',
            },
          })
        }

        results.wrhqSocial = { success: true, count: contentItem.wrhqSocialPosts.length }
      } catch (error) {
        console.error('WRHQ social scheduling error:', error)
        results.wrhqSocial = { success: false, error: String(error) }
      }
    }

    // Publish podcast to Podbean and embed in blog post
    if (contentItem.podcast?.audioUrl && contentItem.podcast.status === 'READY') {
      try {
        const { publishToPodbean } = await import('@/lib/integrations/podbean')
        const { updatePost } = await import('@/lib/integrations/wordpress')

        // Publish to Podbean
        const podbeanResult = await publishToPodbean({
          title: contentItem.blogPost?.title || contentItem.paaQuestion,
          description: contentItem.podcast.description || contentItem.podcastDescription || '',
          audioUrl: contentItem.podcast.audioUrl,
        })

        // Generate iframe embed code
        const podcastEmbed = `<iframe title="${contentItem.blogPost?.title || contentItem.paaQuestion}" allowtransparency="true" height="150" width="100%" style="border: none; min-width: min(100%, 430px);height:150px;" scrolling="no" data-name="pb-iframe-player" src="${podbeanResult.playerUrl}&from=pb6admin&share=1&download=1&rtl=0&fonts=Arial&skin=1&font-color=&logo_link=episode_page&btn-skin=7" loading="lazy"></iframe>`

        // Update WordPress blog post with podcast embed
        if (contentItem.blogPost?.wordpressPostId && contentItem.client.wordpressUrl) {
          const updatedContent = contentItem.blogPost.content + `\n\n<!-- Podcast Episode -->\n<div class="podcast-embed" style="margin: 30px 0;">\n<h3>Listen to This Episode</h3>\n${podcastEmbed}\n</div>`

          await updatePost(
            {
              url: contentItem.client.wordpressUrl,
              username: contentItem.client.wordpressUsername || '',
              password: contentItem.client.wordpressAppPassword || '',
            },
            contentItem.blogPost.wordpressPostId,
            { content: updatedContent }
          )
        }

        // Update podcast record
        await prisma.podcast.update({
          where: { id: contentItem.podcast.id },
          data: {
            status: 'READY',
          },
        })

        // Update content item
        await prisma.contentItem.update({
          where: { id },
          data: {
            podcastGenerated: true,
            podcastAddedToPost: true,
            podcastAddedAt: new Date(),
            podcastUrl: podbeanResult.url,
          },
        })

        results.podcast = { success: true, url: podbeanResult.url, playerUrl: podbeanResult.playerUrl }
      } catch (error) {
        console.error('Podcast publishing error:', error)
        results.podcast = { success: false, error: String(error) }
      }
    }

    // Update final status
    const allSuccessful = Object.values(results).every(
      (r: unknown) => (r as { success: boolean }).success !== false
    )

    await prisma.contentItem.update({
      where: { id },
      data: {
        status: allSuccessful ? 'SCHEDULED' : 'FAILED',
        pipelineStep: allSuccessful ? 'scheduled' : 'failed',
        lastError: allSuccessful ? null : JSON.stringify(results),
      },
    })

    return NextResponse.json({
      success: allSuccessful,
      results,
    })
  } catch (error) {
    console.error('Content publish error:', error)

    await prisma.contentItem.update({
      where: { id },
      data: {
        status: 'FAILED',
        pipelineStep: 'failed',
        lastError: String(error),
      },
    })

    return NextResponse.json({ error: 'Failed to publish content' }, { status: 500 })
  }
}
