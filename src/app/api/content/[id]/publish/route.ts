import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { publishToWordPress } from '@/lib/integrations/wordpress'
import { schedulePost, postNowAndCheckStatus } from '@/lib/integrations/getlate'
import { getSetting, WRHQ_SETTINGS_KEYS } from '@/lib/settings'
import { validateScheduledDate } from '@/lib/scheduling'
import { compressImageForPlatform, compressImageForBlog } from '@/lib/utils/image-compression'
import { Image, SocialPost, WRHQSocialPost } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/publish - Publish content to WordPress and schedule/post social
 * Body: {
 *   publishClientBlog?: boolean,
 *   publishWrhqBlog?: boolean,
 *   scheduleSocial?: boolean,
 *   scheduleWrhqSocial?: boolean,
 *   postImmediate?: boolean  // If true, post now instead of scheduling
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
      scheduleVideoSocial = false,  // Video social posts for client
      scheduleWrhqVideoSocial = false,  // Video social posts for WRHQ
      postImmediate = false,  // Post immediately instead of scheduling
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
        shortFormVideos: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    // Check if scheduled date is in the past - if so, force immediate posting
    const scheduledDateIsPast = contentItem.scheduledDate < new Date()
    const shouldPostImmediately = postImmediate || scheduledDateIsPast

    if (scheduledDateIsPast && !postImmediate) {
      console.log(`Scheduled date ${contentItem.scheduledDate.toISOString()} is in the past, forcing immediate post`)
    }

    // Validate scheduled date - but skip day-of-week check for immediate/manual posts
    // The Tuesday/Thursday restriction only applies to scheduled auto-posts
    if (!shouldPostImmediately) {
      const validationError = await validateScheduledDate(
        contentItem.scheduledDate,
        contentItem.clientId,
        id
      )

      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }
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

        // Compress featured image for blog (targets 2MB for fast loading)
        let featuredImageUrl = featuredImage?.gcsUrl
        if (featuredImageUrl) {
          try {
            const compressed = await compressImageForBlog(featuredImageUrl, id, 'client-blog')
            featuredImageUrl = compressed.url
            if (compressed.wasCompressed) {
              console.log(`Compressed client blog image: ${(compressed.originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressed.compressedSize / 1024 / 1024).toFixed(2)}MB`)
            }
          } catch (compressError) {
            console.error('Failed to compress client blog image:', compressError)
            // Continue with original image
          }
        }

        const wpResult = await publishToWordPress({
          client: contentItem.client,
          title: contentItem.blogPost.title,
          content: contentItem.blogPost.content,
          excerpt: contentItem.blogPost.excerpt || undefined,
          slug: contentItem.blogPost.slug,
          scheduledDate: contentItem.scheduledDate,
          featuredImageUrl,
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

            // Compress featured image for WRHQ blog
            let wrhqFeaturedImageUrl = featuredImage?.gcsUrl
            if (wrhqFeaturedImageUrl) {
              try {
                const compressed = await compressImageForBlog(wrhqFeaturedImageUrl, id, 'wrhq-blog')
                wrhqFeaturedImageUrl = compressed.url
                if (compressed.wasCompressed) {
                  console.log(`Compressed WRHQ blog image: ${(compressed.originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressed.compressedSize / 1024 / 1024).toFixed(2)}MB`)
                }
              } catch (compressError) {
                console.error('Failed to compress WRHQ blog image:', compressError)
                // Continue with original image
              }
            }

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
              featuredImageUrl: wrhqFeaturedImageUrl,
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

    // Post/Schedule client social posts
    if (scheduleSocial && contentItem.socialGenerated) {
      try {
        const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
        const activePlatforms = (contentItem.client.socialPlatforms || []) as string[]
        const disconnectedAccounts = contentItem.client.disconnectedAccounts as Record<string, unknown> | null

        for (const socialPost of contentItem.socialPosts) {
          // Only post to platforms that are active AND have an account ID
          const platformLower = socialPost.platform.toLowerCase()
          const isActive = activePlatforms.map(p => p.toLowerCase()).includes(platformLower)
          const accountId = socialAccountIds?.[platformLower]

          if (!isActive || !accountId) {
            console.log(`Skipping ${socialPost.platform} - active: ${isActive}, hasAccountId: ${!!accountId}`)
            continue
          }

          // Skip disconnected accounts - mark as skipped and continue
          if (disconnectedAccounts && disconnectedAccounts[platformLower]) {
            console.log(`Skipping ${socialPost.platform} - account is disconnected`)
            await prisma.socialPost.update({
              where: { id: socialPost.id },
              data: {
                status: 'FAILED',
                errorMessage: 'Account disconnected - please reconnect in Late',
              },
            })
            continue
          }

          // Determine if this is a video platform
          const videoPlatforms = ['TIKTOK', 'YOUTUBE']
          const isVideoPlatform = videoPlatforms.includes(socialPost.platform)

          // Select correct media based on platform
          let mediaUrl: string | null = null
          let mediaType: 'image' | 'video' = 'image'

          if (isVideoPlatform) {
            // For video platforms, look for short-form videos
            const video = contentItem.shortFormVideos?.find(v =>
              v.platforms.includes(socialPost.platform as any)
            ) || contentItem.shortFormVideos?.[0]
            if (video) {
              mediaUrl = video.videoUrl
              mediaType = 'video'
            }
          } else {
            // For image platforms, select correct image type
            // - Instagram uses square 1:1 image (INSTAGRAM_FEED)
            // - All others use 16:9 landscape image (BLOG_FEATURED)
            const imageType = socialPost.platform === 'INSTAGRAM' ? 'INSTAGRAM_FEED' : 'BLOG_FEATURED'
            const image = contentItem.images.find((img: Image) => img.imageType === imageType)
              || contentItem.images.find((img: Image) => img.imageType === 'BLOG_FEATURED')
            if (image) {
              // Compress image if needed for the platform (e.g., GBP has 5MB limit)
              try {
                const compressed = await compressImageForPlatform(
                  image.gcsUrl,
                  socialPost.platform,
                  id
                )
                mediaUrl = compressed.url
                if (compressed.wasCompressed) {
                  console.log(`Compressed image for ${socialPost.platform}: ${(compressed.originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressed.compressedSize / 1024 / 1024).toFixed(2)}MB`)
                }
              } catch (compressError) {
                console.error(`Failed to compress image for ${socialPost.platform}:`, compressError)
                // Fall back to original URL
                mediaUrl = image.gcsUrl
              }
              mediaType = 'image'
            }
          }

          // Skip platforms that require media when none is available
          const platformsRequiringMedia = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'PINTEREST']
          if (platformsRequiringMedia.includes(socialPost.platform) && !mediaUrl) {
            console.log(`Skipping ${socialPost.platform} - no ${isVideoPlatform ? 'video' : 'image'} available and platform requires media`)
            continue
          }

          // For GBP posts, include the blog URL as the CTA "Learn More" link
          const gbpCtaUrl = socialPost.platform === 'GBP' && contentItem.blogPost?.wordpressUrl
            ? contentItem.blogPost.wordpressUrl
            : undefined

          // Wrap each post in try-catch so one failure doesn't stop others
          try {
            // Use postNowAndCheckStatus for immediate posting (polls for result), schedulePost for scheduling
            const lateResult = shouldPostImmediately
              ? await postNowAndCheckStatus({
                  accountId,
                  platform: socialPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: socialPost.caption,
                  mediaUrls: mediaUrl ? [mediaUrl] : [],
                  mediaType,
                  hashtags: socialPost.hashtags,
                  firstComment: socialPost.firstComment || undefined,
                  ctaUrl: gbpCtaUrl,
                })
              : await schedulePost({
                  accountId,
                  platform: socialPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: socialPost.caption,
                  mediaUrls: mediaUrl ? [mediaUrl] : [],
                  mediaType,
                  scheduledTime: contentItem.scheduledDate,
                  hashtags: socialPost.hashtags,
                  firstComment: socialPost.firstComment || undefined,
                  ctaUrl: gbpCtaUrl,
                })

            // Determine the status based on Late API response
            let dbStatus: 'PUBLISHED' | 'SCHEDULED' | 'PROCESSING' | 'FAILED' = 'PROCESSING'
            if (lateResult.status === 'failed') {
              dbStatus = 'FAILED'
              console.error(`${socialPost.platform} post failed:`, lateResult.error)
            } else if (lateResult.status === 'published' && lateResult.platformPostUrl) {
              dbStatus = 'PUBLISHED'
            } else if (!shouldPostImmediately) {
              dbStatus = 'SCHEDULED'
            }

            await prisma.socialPost.update({
              where: { id: socialPost.id },
              data: {
                getlatePostId: lateResult.postId,
                status: dbStatus,
                publishedUrl: lateResult.platformPostUrl || null,
                publishedAt: dbStatus === 'PUBLISHED' ? new Date() : null,
                errorMessage: lateResult.error || null,
              },
            })
          } catch (postError) {
            console.error(`Failed to post ${socialPost.platform}:`, postError)
            await prisma.socialPost.update({
              where: { id: socialPost.id },
              data: {
                status: 'FAILED',
                errorMessage: String(postError),
              },
            })
          }
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
        console.error('Social posting error:', error)
        results.social = { success: false, error: String(error) }
      }
    }

    // Post/Schedule WRHQ social posts
    if (scheduleWrhqSocial && contentItem.wrhqSocialGenerated) {
      try {
        for (const wrhqPost of contentItem.wrhqSocialPosts) {
          const accountIdKey = `WRHQ_LATE_${wrhqPost.platform}_ID` as keyof typeof WRHQ_SETTINGS_KEYS
          const accountId = await getSetting(WRHQ_SETTINGS_KEYS[accountIdKey])

          if (!accountId) continue

          // Determine if this is a video platform
          const videoPlatforms = ['TIKTOK', 'YOUTUBE']
          const isVideoPlatform = videoPlatforms.includes(wrhqPost.platform)

          // Select correct media based on platform
          let mediaUrl: string | null = null
          let mediaType: 'image' | 'video' = 'image'

          if (isVideoPlatform) {
            // For video platforms, look for short-form videos
            const video = contentItem.shortFormVideos?.find(v =>
              v.platforms.includes(wrhqPost.platform as any)
            ) || contentItem.shortFormVideos?.[0]
            if (video) {
              mediaUrl = video.videoUrl
              mediaType = 'video'
            }
          } else {
            // For image platforms, select correct image type
            const imageType = wrhqPost.platform === 'INSTAGRAM' ? 'INSTAGRAM_FEED' : 'BLOG_FEATURED'
            const image = contentItem.images.find((img: Image) => img.imageType === imageType)
              || contentItem.images.find((img: Image) => img.imageType === 'BLOG_FEATURED')
            if (image) {
              // Compress image if needed for the platform
              try {
                const compressed = await compressImageForPlatform(
                  image.gcsUrl,
                  wrhqPost.platform,
                  id
                )
                mediaUrl = compressed.url
                if (compressed.wasCompressed) {
                  console.log(`Compressed WRHQ image for ${wrhqPost.platform}: ${(compressed.originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressed.compressedSize / 1024 / 1024).toFixed(2)}MB`)
                }
              } catch (compressError) {
                console.error(`Failed to compress WRHQ image for ${wrhqPost.platform}:`, compressError)
                mediaUrl = image.gcsUrl
              }
              mediaType = 'image'
            }
          }

          // Skip platforms that require media when none is available
          const platformsRequiringMedia = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'PINTEREST']
          if (platformsRequiringMedia.includes(wrhqPost.platform) && !mediaUrl) {
            console.log(`Skipping WRHQ ${wrhqPost.platform} - no ${isVideoPlatform ? 'video' : 'image'} available and platform requires media`)
            continue
          }

          // Wrap each post in try-catch so one failure doesn't stop others
          try {
            // Use postNowAndCheckStatus for immediate posting (polls for result), schedulePost for scheduling
            const lateResult = shouldPostImmediately
              ? await postNowAndCheckStatus({
                  accountId,
                  platform: wrhqPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: wrhqPost.caption,
                  mediaUrls: mediaUrl ? [mediaUrl] : [],
                  mediaType,
                  hashtags: wrhqPost.hashtags,
                  firstComment: wrhqPost.firstComment || undefined,
                })
              : await schedulePost({
                  accountId,
                  platform: wrhqPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: wrhqPost.caption,
                  mediaUrls: mediaUrl ? [mediaUrl] : [],
                  mediaType,
                  scheduledTime: contentItem.scheduledDate,
                  hashtags: wrhqPost.hashtags,
                  firstComment: wrhqPost.firstComment || undefined,
                })

            // Determine the status based on Late API response
            let wrhqDbStatus: 'PUBLISHED' | 'SCHEDULED' | 'PROCESSING' | 'FAILED' = 'PROCESSING'
            if (lateResult.status === 'failed') {
              wrhqDbStatus = 'FAILED'
              console.error(`WRHQ ${wrhqPost.platform} post failed:`, lateResult.error)
            } else if (lateResult.status === 'published' && lateResult.platformPostUrl) {
              wrhqDbStatus = 'PUBLISHED'
            } else if (!shouldPostImmediately) {
              wrhqDbStatus = 'SCHEDULED'
            }

            await prisma.wRHQSocialPost.update({
              where: { id: wrhqPost.id },
              data: {
                getlatePostId: lateResult.postId,
                status: wrhqDbStatus,
                publishedUrl: lateResult.platformPostUrl || null,
                publishedAt: wrhqDbStatus === 'PUBLISHED' ? new Date() : null,
                errorMessage: lateResult.error || null,
              },
            })
          } catch (postError) {
            console.error(`Failed to post WRHQ ${wrhqPost.platform}:`, postError)
            await prisma.wRHQSocialPost.update({
              where: { id: wrhqPost.id },
              data: {
                status: 'FAILED',
                errorMessage: String(postError),
              },
            })
          }
        }

        results.wrhqSocial = { success: true, count: contentItem.wrhqSocialPosts.length }
      } catch (error) {
        console.error('WRHQ social posting error:', error)
        results.wrhqSocial = { success: false, error: String(error) }
      }
    }

    // Post/Schedule client VIDEO social posts
    if (scheduleVideoSocial && contentItem.shortVideoGenerated) {
      try {
        const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
        const activePlatforms = (contentItem.client.socialPlatforms || []) as string[]
        const disconnectedAccounts = contentItem.client.disconnectedAccounts as Record<string, unknown> | null

        // Filter for video posts only
        const videoSocialPosts = contentItem.socialPosts.filter((p: SocialPost) => p.mediaType === 'video')

        for (const socialPost of videoSocialPosts) {
          // Only post to platforms that are active AND have an account ID
          const platformLower = socialPost.platform.toLowerCase()
          const isActive = activePlatforms.map(p => p.toLowerCase()).includes(platformLower)
          const accountId = socialAccountIds?.[platformLower]

          if (!isActive || !accountId) {
            console.log(`Skipping video ${socialPost.platform} - active: ${isActive}, hasAccountId: ${!!accountId}`)
            continue
          }

          // Skip disconnected accounts
          if (disconnectedAccounts && disconnectedAccounts[platformLower]) {
            console.log(`Skipping video ${socialPost.platform} - account is disconnected`)
            await prisma.socialPost.update({
              where: { id: socialPost.id },
              data: {
                status: 'FAILED',
                errorMessage: 'Account disconnected - please reconnect in Late',
              },
            })
            continue
          }

          // Get the video URL from the social post's mediaUrls
          const mediaUrl = socialPost.mediaUrls?.[0] || null

          // Skip if no video available
          if (!mediaUrl) {
            console.log(`Skipping video ${socialPost.platform} - no video URL available`)
            continue
          }

          // Wrap each post in try-catch so one failure doesn't stop others
          try {
            const lateResult = shouldPostImmediately
              ? await postNowAndCheckStatus({
                  accountId,
                  platform: socialPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: socialPost.caption,
                  mediaUrls: [mediaUrl],
                  mediaType: 'video',
                  hashtags: socialPost.hashtags,
                  firstComment: socialPost.firstComment || undefined,
                })
              : await schedulePost({
                  accountId,
                  platform: socialPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: socialPost.caption,
                  mediaUrls: [mediaUrl],
                  mediaType: 'video',
                  scheduledTime: contentItem.scheduledDate,
                  hashtags: socialPost.hashtags,
                  firstComment: socialPost.firstComment || undefined,
                })

            // Determine the status based on Late API response
            let dbStatus: 'PUBLISHED' | 'SCHEDULED' | 'PROCESSING' | 'FAILED' = 'PROCESSING'
            if (lateResult.status === 'failed') {
              dbStatus = 'FAILED'
              console.error(`Video ${socialPost.platform} post failed:`, lateResult.error)
            } else if (lateResult.status === 'published' && lateResult.platformPostUrl) {
              dbStatus = 'PUBLISHED'
            } else if (!shouldPostImmediately) {
              dbStatus = 'SCHEDULED'
            }

            await prisma.socialPost.update({
              where: { id: socialPost.id },
              data: {
                getlatePostId: lateResult.postId,
                status: dbStatus,
                publishedUrl: lateResult.platformPostUrl || null,
                publishedAt: dbStatus === 'PUBLISHED' ? new Date() : null,
                errorMessage: lateResult.error || null,
              },
            })
          } catch (postError) {
            console.error(`Failed to post video ${socialPost.platform}:`, postError)
            await prisma.socialPost.update({
              where: { id: socialPost.id },
              data: {
                status: 'FAILED',
                errorMessage: String(postError),
              },
            })
          }
        }

        results.videoSocial = { success: true, count: videoSocialPosts.length }
      } catch (error) {
        console.error('Video social posting error:', error)
        results.videoSocial = { success: false, error: String(error) }
      }
    }

    // Post/Schedule WRHQ VIDEO social posts
    if (scheduleWrhqVideoSocial && contentItem.shortVideoGenerated) {
      try {
        // Filter for video posts only
        const wrhqVideoSocialPosts = contentItem.wrhqSocialPosts.filter((p: WRHQSocialPost) => p.mediaType === 'video')

        for (const wrhqPost of wrhqVideoSocialPosts) {
          const accountIdKey = `WRHQ_LATE_${wrhqPost.platform}_ID` as keyof typeof WRHQ_SETTINGS_KEYS
          const accountId = await getSetting(WRHQ_SETTINGS_KEYS[accountIdKey])

          if (!accountId) {
            console.log(`Skipping WRHQ video ${wrhqPost.platform} - no account ID configured`)
            continue
          }

          // Get the video URL from the social post's mediaUrls
          const mediaUrl = wrhqPost.mediaUrls?.[0] || null

          // Skip if no video available
          if (!mediaUrl) {
            console.log(`Skipping WRHQ video ${wrhqPost.platform} - no video URL available`)
            continue
          }

          // Wrap each post in try-catch so one failure doesn't stop others
          try {
            const lateResult = shouldPostImmediately
              ? await postNowAndCheckStatus({
                  accountId,
                  platform: wrhqPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: wrhqPost.caption,
                  mediaUrls: [mediaUrl],
                  mediaType: 'video',
                  hashtags: wrhqPost.hashtags,
                  firstComment: wrhqPost.firstComment || undefined,
                })
              : await schedulePost({
                  accountId,
                  platform: wrhqPost.platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
                  caption: wrhqPost.caption,
                  mediaUrls: [mediaUrl],
                  mediaType: 'video',
                  scheduledTime: contentItem.scheduledDate,
                  hashtags: wrhqPost.hashtags,
                  firstComment: wrhqPost.firstComment || undefined,
                })

            // Determine the status based on Late API response
            let wrhqDbStatus: 'PUBLISHED' | 'SCHEDULED' | 'PROCESSING' | 'FAILED' = 'PROCESSING'
            if (lateResult.status === 'failed') {
              wrhqDbStatus = 'FAILED'
              console.error(`WRHQ video ${wrhqPost.platform} post failed:`, lateResult.error)
            } else if (lateResult.status === 'published' && lateResult.platformPostUrl) {
              wrhqDbStatus = 'PUBLISHED'
            } else if (!shouldPostImmediately) {
              wrhqDbStatus = 'SCHEDULED'
            }

            await prisma.wRHQSocialPost.update({
              where: { id: wrhqPost.id },
              data: {
                getlatePostId: lateResult.postId,
                status: wrhqDbStatus,
                publishedUrl: lateResult.platformPostUrl || null,
                publishedAt: wrhqDbStatus === 'PUBLISHED' ? new Date() : null,
                errorMessage: lateResult.error || null,
              },
            })
          } catch (postError) {
            console.error(`Failed to post WRHQ video ${wrhqPost.platform}:`, postError)
            await prisma.wRHQSocialPost.update({
              where: { id: wrhqPost.id },
              data: {
                status: 'FAILED',
                errorMessage: String(postError),
              },
            })
          }
        }

        results.wrhqVideoSocial = { success: true, count: wrhqVideoSocialPosts.length }
      } catch (error) {
        console.error('WRHQ video social posting error:', error)
        results.wrhqVideoSocial = { success: false, error: String(error) }
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
