import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updatePost, getPost } from '@/lib/integrations/wordpress'
import { generateSchemaGraph } from '@/lib/pipeline/schema-markup'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Generate short-form video embed (9:16 vertical, floated right)
function generateShortVideoEmbed(youtubeUrl: string): string | null {
  // Extract YouTube video ID
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
  padding-bottom: 177.78%; /* 9:16 aspect ratio */
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

// Generate long-form video embed (16:9 horizontal)
function generateLongVideoEmbed(url: string): string {
  // Check if YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (youtubeMatch) {
    return `
<div class="video-container" style="margin: 2rem 0; position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    src="https://www.youtube.com/embed/${youtubeMatch[1]}"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>`
  }

  // Check if Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) {
    return `
<div class="video-container" style="margin: 2rem 0; position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    src="https://player.vimeo.com/video/${vimeoMatch[1]}"
    frameborder="0"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>`
  }

  // Default to HTML5 video
  return `
<div class="video-container" style="margin: 2rem 0;">
  <video controls style="width: 100%; max-width: 100%;">
    <source src="${url}" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>`
}

// Generate podcast embed HTML
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

// Generate JSON-LD schema script tags (one per schema object)
function generateSchemaEmbed(schemaJson: string): string {
  try {
    const schemas = JSON.parse(schemaJson)
    if (Array.isArray(schemas)) {
      // Multiple schemas - create separate script tags for each
      return schemas.map((schema, index) => `<!-- JSON-LD Schema ${index + 1} -->
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`).join('\n')
    } else {
      // Single schema object
      return `<!-- JSON-LD Schema Markup -->
<script type="application/ld+json">
${schemaJson}
</script>`
    }
  } catch {
    // Fallback if parsing fails
    return `<!-- JSON-LD Schema Markup -->
<script type="application/ld+json">
${schemaJson}
</script>`
  }
}

/**
 * POST /api/content/[id]/embed-all-media - Embed videos and podcast into blog
 * Fetches current WordPress content (which already has image + map) and adds:
 * - JSON-LD schema markup
 * - Short-form video (YouTube Short)
 * - Long-form video (YouTube)
 * - Podcast player embed
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    // Get content item with all related data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        podcast: true,
        socialPosts: true,
        wrhqSocialPosts: true,
        shortFormVideos: true,
        videos: true,
        images: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    if (!contentItem.blogPost) {
      return NextResponse.json({
        error: 'No blog post found. Please generate a blog post first.',
        details: {
          contentId: id,
          clientName: contentItem.client.businessName,
          blogGenerated: contentItem.blogGenerated,
        }
      }, { status: 400 })
    }

    if (!contentItem.blogPost.wordpressPostId) {
      return NextResponse.json({
        error: 'Blog has not been published to WordPress yet. Please publish the blog first, then use Embed Media.',
        details: {
          contentId: id,
          clientName: contentItem.client.businessName,
          blogTitle: contentItem.blogPost.title,
          wordpressUrl: contentItem.client.wordpressUrl || 'NOT CONFIGURED',
          hasWordpressCredentials: !!(contentItem.client.wordpressUrl && contentItem.client.wordpressUsername && contentItem.client.wordpressAppPassword),
        }
      }, { status: 400 })
    }

    if (!contentItem.client.wordpressUrl) {
      return NextResponse.json({
        error: 'WordPress not configured for this client. Please go to Edit Client and add WordPress URL, Username, and App Password.',
        details: {
          contentId: id,
          clientName: contentItem.client.businessName,
        }
      }, { status: 400 })
    }

    if (!contentItem.client.wordpressUsername || !contentItem.client.wordpressAppPassword) {
      return NextResponse.json({
        error: 'WordPress credentials incomplete. Please go to Edit Client and add WordPress Username and App Password.',
        details: {
          contentId: id,
          clientName: contentItem.client.businessName,
          wordpressUrl: contentItem.client.wordpressUrl,
          hasUsername: !!contentItem.client.wordpressUsername,
          hasPassword: !!contentItem.client.wordpressAppPassword,
        }
      }, { status: 400 })
    }

    // Fetch current content from WordPress (already has featured image + Google Maps)
    const wpCredentials = {
      url: contentItem.client.wordpressUrl,
      username: contentItem.client.wordpressUsername,
      password: contentItem.client.wordpressAppPassword,
    }

    let currentPost
    try {
      currentPost = await getPost(wpCredentials, contentItem.blogPost.wordpressPostId)
    } catch (wpError) {
      return NextResponse.json({
        error: `Failed to fetch post from WordPress: ${wpError instanceof Error ? wpError.message : String(wpError)}`,
        details: {
          contentId: id,
          clientName: contentItem.client.businessName,
          wordpressUrl: contentItem.client.wordpressUrl,
          wordpressPostId: contentItem.blogPost.wordpressPostId,
          hint: 'Check that the WordPress URL is correct and credentials are valid. The post may have been deleted from WordPress.',
        }
      }, { status: 500 })
    }
    let fullContent = currentPost.content

    // Track what we're embedding
    const embedded: string[] = []

    // Remove any existing embeds before adding fresh ones
    // This prevents duplicates on re-embed
    fullContent = fullContent.replace(/<!-- JSON-LD Schema \d+ -->[\s\S]*?<\/script>/g, '')
    fullContent = fullContent.replace(/<!-- JSON-LD Schema Markup -->[\s\S]*?<\/script>/g, '')
    fullContent = fullContent.replace(/<!-- YouTube Short Video -->[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="yt-shorts-embed">[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="video-container"[\s\S]*?<\/div>/g, '')
    fullContent = fullContent.replace(/<!-- Podcast Episode -->[\s\S]*?<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="podcast-embed"[\s\S]*?<\/div>/g, '')
    // NOTE: We do NOT remove or regenerate Google Maps embeds here
    // The initial publish creates a good map embed that shows the business listing
    // Re-embed should preserve that original map

    // 0. REGENERATE schema using latest code (with image, priceRange, etc.)
    const featuredImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
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
        title: contentItem.blogPost.title,
        slug: contentItem.blogPost.slug,
        content: contentItem.blogPost.content,
        excerpt: contentItem.blogPost.excerpt,
        metaDescription: contentItem.blogPost.metaDescription,
        wordpressUrl: contentItem.blogPost.wordpressUrl,
        publishedAt: contentItem.blogPost.publishedAt,
        imageUrl: featuredImage?.gcsUrl || null,
      },
      contentItem: {
        paaQuestion: contentItem.paaQuestion,
      },
      podcast: contentItem.podcast ? { audioUrl: contentItem.podcast.audioUrl, duration: contentItem.podcast.duration } : undefined,
      video: contentItem.videos[0] ? { videoUrl: contentItem.videos[0].videoUrl, thumbnailUrl: contentItem.videos[0].thumbnailUrl, duration: contentItem.videos[0].duration } : undefined,
    })

    // Save regenerated schema to database
    await prisma.blogPost.update({
      where: { id: contentItem.blogPost.id },
      data: { schemaJson },
    })

    // Embed the fresh schema
    const schemaEmbed = generateSchemaEmbed(schemaJson)
    fullContent = schemaEmbed + '\n\n' + fullContent
    embedded.push('schema')

    // 1. Add short-form video (floated right)
    // YouTube URL is in socialPosts.publishedUrl after publishing via Late
    let shortVideoUrl: string | null = null

    // Debug: log all sources
    console.log('=== SHORT VIDEO DEBUG ===')
    console.log('socialPosts:', contentItem.socialPosts.map(p => ({ platform: p.platform, mediaType: p.mediaType, publishedUrl: p.publishedUrl })))
    console.log('wrhqSocialPosts:', contentItem.wrhqSocialPosts.map(p => ({ platform: p.platform, mediaType: p.mediaType, publishedUrl: p.publishedUrl })))

    // Check client socialPosts for YouTube published URL
    const youtubePost = contentItem.socialPosts.find(
      p => p.platform === 'YOUTUBE' && p.publishedUrl
    )
    if (youtubePost?.publishedUrl) {
      shortVideoUrl = youtubePost.publishedUrl
      console.log('Found in client socialPosts:', shortVideoUrl)
    }

    // Check WRHQ socialPosts for YouTube published URL
    if (!shortVideoUrl) {
      const wrhqYoutubePost = contentItem.wrhqSocialPosts.find(
        p => p.platform === 'YOUTUBE' && p.publishedUrl
      )
      if (wrhqYoutubePost?.publishedUrl) {
        shortVideoUrl = wrhqYoutubePost.publishedUrl
        console.log('Found in wrhqSocialPosts:', shortVideoUrl)
      }
    }

    console.log('Short video URL to embed:', shortVideoUrl)

    if (shortVideoUrl) {
      const shortVideoEmbed = generateShortVideoEmbed(shortVideoUrl)
      if (shortVideoEmbed) {
        // Insert at the very beginning so text flows around the floated video
        fullContent = shortVideoEmbed + '\n' + fullContent
        embedded.push('short-video')
      }
    }

    // 2. Add long-form video embed (if present)
    if (contentItem.longformVideoUrl) {
      const longVideoEmbed = generateLongVideoEmbed(contentItem.longformVideoUrl)
      fullContent = fullContent + '\n\n' + longVideoEmbed
      embedded.push('long-video')
    }

    // NOTE: Google Maps is NOT added here - we preserve the one from initial publish
    // which shows the actual Google Business listing with ratings

    // 3. Add podcast embed at the end
    console.log('=== PODCAST EMBED DEBUG ===')
    console.log('Has podcast record:', !!contentItem.podcast)
    let podcastSkipReason: string | null = null

    if (contentItem.podcast) {
      console.log('Podcast status:', contentItem.podcast.status)
      console.log('Podcast podbeanPlayerUrl:', contentItem.podcast.podbeanPlayerUrl)
      console.log('Podcast podbeanEpisodeId:', contentItem.podcast.podbeanEpisodeId)
      console.log('Podcast podbeanUrl:', contentItem.podcast.podbeanUrl)
      console.log('Podcast audioUrl:', contentItem.podcast.audioUrl)
    }

    if (contentItem.podcast?.podbeanPlayerUrl) {
      const podcastEmbed = generatePodcastEmbed(
        contentItem.blogPost.title,
        contentItem.podcast.podbeanPlayerUrl
      )
      fullContent = fullContent + podcastEmbed
      embedded.push('podcast')
      console.log('Podcast embed added successfully')
    } else if (contentItem.podcast) {
      // Podcast exists but no player URL - determine why
      if (!contentItem.podcast.podbeanPlayerUrl) {
        podcastSkipReason = `Podcast exists (status: ${contentItem.podcast.status}) but missing podbeanPlayerUrl - may not have been published to Podbean yet`
      }
      console.log('Podcast NOT embedded:', podcastSkipReason)
    } else {
      podcastSkipReason = 'No podcast record found for this content'
      console.log('Podcast NOT embedded:', podcastSkipReason)
    }

    // Update WordPress with the content including new embeds
    console.log('Updating WordPress post with embedded content...')
    console.log('Content length:', fullContent.length)
    console.log('Items to embed:', embedded)

    await updatePost(wpCredentials, contentItem.blogPost.wordpressPostId, { content: fullContent })
    console.log('WordPress update completed')

    // Update tracking flags for what was embedded
    const updateData: Record<string, unknown> = {}

    if (embedded.includes('podcast')) {
      updateData.podcastAddedToPost = true
      updateData.podcastAddedAt = new Date()
    }
    if (embedded.includes('short-video')) {
      updateData.shortVideoAddedToPost = true
      updateData.shortVideoAddedAt = new Date()
    }
    if (embedded.includes('long-video')) {
      updateData.longVideoAddedToPost = true
      updateData.longVideoAddedAt = new Date()
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.contentItem.update({
        where: { id },
        data: updateData,
      })
    }

    // Build comprehensive diagnostic info
    const shortVideoSkipReason = !shortVideoUrl
      ? (() => {
          const youtubeClientPosts = contentItem.socialPosts.filter(p => p.platform === 'YOUTUBE')
          const youtubeWrhqPosts = contentItem.wrhqSocialPosts.filter(p => p.platform === 'YOUTUBE')
          if (youtubeClientPosts.length === 0 && youtubeWrhqPosts.length === 0) {
            return 'No YouTube social posts found. Generate video social posts first.'
          }
          const allYoutubePosts = [...youtubeClientPosts, ...youtubeWrhqPosts]
          const statuses = allYoutubePosts.map(p => `${p.platform}: status=${p.status}, publishedUrl=${p.publishedUrl || 'none'}`).join('; ')
          return `YouTube posts exist but none have publishedUrl yet. Publish videos to YouTube first. (${statuses})`
        })()
      : null

    // Check image status
    const blogFeaturedImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
    const imageStatus = {
      hasBlogFeaturedImage: !!blogFeaturedImage,
      imageUrl: blogFeaturedImage?.gcsUrl || null,
      imageCount: contentItem.images.length,
      imageTypes: contentItem.images.map(img => img.imageType),
    }

    return NextResponse.json({
      success: true,
      embedded,
      message: embedded.length > 0
        ? `Embedded: ${embedded.join(', ')}`
        : 'No new media to embed',
      skipped: {
        shortVideo: shortVideoSkipReason,
        podcast: podcastSkipReason,
      },
      debug: {
        hasPodcast: !!contentItem.podcast,
        podcastStatus: contentItem.podcast?.status,
        hasPodbeanPlayerUrl: !!contentItem.podcast?.podbeanPlayerUrl,
        podbeanUrl: contentItem.podcast?.podbeanUrl || null,
        hasShortFormVideos: contentItem.shortFormVideos?.length > 0,
        shortFormVideoCount: contentItem.shortFormVideos?.length || 0,
        youtubeClientPosts: contentItem.socialPosts.filter(p => p.platform === 'YOUTUBE').map(p => ({
          status: p.status,
          publishedUrl: p.publishedUrl,
          mediaType: p.mediaType,
        })),
        youtubeWrhqPosts: contentItem.wrhqSocialPosts.filter(p => p.platform === 'YOUTUBE').map(p => ({
          status: p.status,
          publishedUrl: p.publishedUrl,
          mediaType: p.mediaType,
        })),
        imageStatus,
      },
    })
  } catch (error) {
    console.error('Embed all media error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
