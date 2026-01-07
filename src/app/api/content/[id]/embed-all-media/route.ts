import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updatePost, getPost } from '@/lib/integrations/wordpress'
import { generateSchemaGraph } from '@/lib/pipeline/schema-markup'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Generate Google Maps embed with heading
function generateGoogleMapsEmbed(params: {
  businessName: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
}): string {
  const addressQuery = encodeURIComponent(
    `${params.businessName}, ${params.streetAddress}, ${params.city}, ${params.state} ${params.postalCode}`
  )
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
      return NextResponse.json({ error: 'No blog post found' }, { status: 400 })
    }

    if (!contentItem.blogPost.wordpressPostId) {
      return NextResponse.json({ error: 'Blog has not been published yet' }, { status: 400 })
    }

    if (!contentItem.client.wordpressUrl) {
      return NextResponse.json({ error: 'WordPress not configured for client' }, { status: 400 })
    }


    // Fetch current content from WordPress (already has featured image + Google Maps)
    const wpCredentials = {
      url: contentItem.client.wordpressUrl,
      username: contentItem.client.wordpressUsername || '',
      password: contentItem.client.wordpressAppPassword || '',
    }

    const currentPost = await getPost(wpCredentials, contentItem.blogPost.wordpressPostId)
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
    // Remove old Google Maps embeds (with or without heading) to regenerate with latest format
    fullContent = fullContent.replace(/<!-- Google Maps Embed -->[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="google-maps-embed"[\s\S]*?<\/div>\s*<\/div>/g, '')

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
    // Appended at end - Google Maps and Podcast will be added after this
    if (contentItem.longformVideoUrl) {
      const longVideoEmbed = generateLongVideoEmbed(contentItem.longformVideoUrl)
      fullContent = fullContent + '\n\n' + longVideoEmbed
      embedded.push('long-video')
    }

    // 3. Add Google Maps embed with heading (regenerated with latest format)
    const mapsEmbed = generateGoogleMapsEmbed({
      businessName: contentItem.client.businessName,
      streetAddress: contentItem.client.streetAddress,
      city: contentItem.client.city,
      state: contentItem.client.state,
      postalCode: contentItem.client.postalCode,
    })
    fullContent = fullContent + mapsEmbed
    embedded.push('google-maps')

    // 4. Add podcast embed at the very end (after Google Maps)
    if (contentItem.podcast?.podbeanPlayerUrl) {
      const podcastEmbed = generatePodcastEmbed(
        contentItem.blogPost.title,
        contentItem.podcast.podbeanPlayerUrl
      )
      fullContent = fullContent + podcastEmbed
      embedded.push('podcast')
    }

    // Update WordPress with the content including new embeds
    await updatePost(wpCredentials, contentItem.blogPost.wordpressPostId, { content: fullContent })

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

    return NextResponse.json({
      success: true,
      embedded,
      message: embedded.length > 0
        ? `Embedded: ${embedded.join(', ')}`
        : 'No new media to embed',
    })
  } catch (error) {
    console.error('Embed all media error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
