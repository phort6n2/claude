import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updatePost } from '@/lib/integrations/wordpress'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Generate featured image embed HTML (after first paragraph)
function generateFeaturedImageEmbed(imageUrl: string | null, altText: string): string {
  if (!imageUrl) return ''

  return `
<figure class="featured-image" style="margin: 20px 0; text-align: center;">
  <img src="${imageUrl}" alt="${altText}" style="max-width: 100%; height: auto; border-radius: 8px;" />
</figure>`
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
  float: right;
  width: 280px;
  margin: 30px 0 20px 25px;
  clear: right;
}
.yt-shorts-embed .video-wrapper {
  position: relative;
  padding-bottom: 177.78%; /* 16:9 inverted = 9:16 */
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
    float: none;
    width: 100%;
    max-width: 320px;
    margin: 30px auto;
  }
}
</style>
<div class="yt-shorts-embed">
  <h3 style="margin: 0 0 10px 0; font-size: 16px;">🎬 Watch the Video</h3>
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
function generateLongVideoEmbed(url: string, description: string): string {
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
</div>
${description ? `<p class="video-description" style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">${description}</p>` : ''}`
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
</div>
${description ? `<p class="video-description" style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">${description}</p>` : ''}`
  }

  // Default to HTML5 video
  return `
<div class="video-container" style="margin: 2rem 0;">
  <video controls style="width: 100%; max-width: 100%;">
    <source src="${url}" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>
${description ? `<p class="video-description" style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">${description}</p>` : ''}`
}

// Generate Google Maps embed HTML
function generateGoogleMapsEmbed(client: {
  businessName: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
}): string {
  const fullAddress = `${client.streetAddress}, ${client.city}, ${client.state} ${client.postalCode}`
  const encodedAddress = encodeURIComponent(fullAddress)

  return `
<div class="google-maps-embed" style="margin: 30px 0; clear: both;">
  <h3 style="margin-bottom: 15px;">📍 Find ${client.businessName}</h3>
  <iframe
    src="https://maps.google.com/maps?q=${encodedAddress}&output=embed"
    width="100%"
    height="300"
    style="border: 0; border-radius: 8px;"
    allowfullscreen=""
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
  ></iframe>
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

/**
 * POST /api/content/[id]/embed-all-media - Embed all media (image, videos, map, podcast) into blog
 * This is a single atomic operation that builds the complete blog content with all embeds
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
        images: true,
        podcast: true,
        socialPosts: true,
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

    // Track what we're embedding
    const embedded: string[] = []

    // Start with the original blog content
    let fullContent = contentItem.blogPost.content

    // 1. Add featured image after first paragraph
    const featuredImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
    if (featuredImage?.gcsUrl) {
      const featuredImageEmbed = generateFeaturedImageEmbed(
        featuredImage.gcsUrl,
        `${contentItem.blogPost.title} | ${contentItem.client.businessName}`
      )
      const firstParagraphEnd = fullContent.indexOf('</p>')
      if (firstParagraphEnd !== -1) {
        fullContent = fullContent.slice(0, firstParagraphEnd + 4) + '\n\n' + featuredImageEmbed + '\n\n' + fullContent.slice(firstParagraphEnd + 4)
      } else {
        fullContent = featuredImageEmbed + '\n\n' + fullContent
      }
      embedded.push('featured-image')
    }

    // 2. Add short-form video (floated right) - find YouTube URL from video social posts
    const youtubeVideoPost = contentItem.socialPosts.find(
      p => p.platform === 'YOUTUBE' && p.mediaType === 'video' && p.publishedUrl
    )
    if (youtubeVideoPost?.publishedUrl) {
      const shortVideoEmbed = generateShortVideoEmbed(youtubeVideoPost.publishedUrl)
      if (shortVideoEmbed) {
        // Insert after the featured image (after second </p> or after first if no featured image)
        const insertPoint = featuredImage ? fullContent.indexOf('</p>', fullContent.indexOf('</p>') + 1) : fullContent.indexOf('</p>')
        if (insertPoint !== -1) {
          fullContent = fullContent.slice(0, insertPoint + 4) + '\n\n' + shortVideoEmbed + fullContent.slice(insertPoint + 4)
        } else {
          fullContent = shortVideoEmbed + fullContent
        }
        embedded.push('short-video')
      }
    }

    // 3. Add long-form video embed (if present)
    if (contentItem.longformVideoUrl) {
      const longVideoEmbed = generateLongVideoEmbed(
        contentItem.longformVideoUrl,
        contentItem.longformVideoDesc || ''
      )
      // Insert before the last paragraph
      const lastParagraphStart = fullContent.lastIndexOf('<p>')
      if (lastParagraphStart !== -1) {
        fullContent = fullContent.slice(0, lastParagraphStart) + '\n\n' + longVideoEmbed + '\n\n' + fullContent.slice(lastParagraphStart)
      } else {
        fullContent = fullContent + '\n\n' + longVideoEmbed
      }
      embedded.push('long-video')
    }

    // 4. Add Google Maps embed at the end
    const googleMapsEmbed = generateGoogleMapsEmbed(contentItem.client)
    fullContent = fullContent + googleMapsEmbed
    embedded.push('google-maps')

    // 5. Add podcast embed at the very end (if published to Podbean)
    if (contentItem.podcast?.podbeanPlayerUrl) {
      const podcastEmbed = generatePodcastEmbed(
        contentItem.blogPost.title,
        contentItem.podcast.podbeanPlayerUrl
      )
      fullContent = fullContent + podcastEmbed
      embedded.push('podcast')
    }

    // Update WordPress with the complete content
    await updatePost(
      {
        url: contentItem.client.wordpressUrl,
        username: contentItem.client.wordpressUsername || '',
        password: contentItem.client.wordpressAppPassword || '',
      },
      contentItem.blogPost.wordpressPostId,
      { content: fullContent }
    )

    // Update tracking flags
    const updateData: Record<string, unknown> = {
      mediaEmbeddedAt: new Date(),
    }

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

    await prisma.contentItem.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      embedded,
      message: `Embedded: ${embedded.join(', ')}`,
    })
  } catch (error) {
    console.error('Embed all media error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
