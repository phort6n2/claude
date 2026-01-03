import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updatePost, getPost } from '@/lib/integrations/wordpress'

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

/**
 * POST /api/content/[id]/embed-all-media - Embed videos and podcast into blog
 * Fetches current WordPress content (which already has image + map) and adds:
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
        shortFormVideos: true,
        videos: true,
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

    // Debug: log all video sources
    console.log('=== EMBED ALL MEDIA DEBUG ===')
    console.log('Videos count:', contentItem.videos.length)
    console.log('Videos:', contentItem.videos.map(v => ({ id: v.id, videoUrl: v.videoUrl, videoType: v.videoType })))
    console.log('ShortFormVideos count:', contentItem.shortFormVideos.length)
    console.log('ShortFormVideos:', contentItem.shortFormVideos.map(v => ({ id: v.id, videoUrl: v.videoUrl, publishedUrls: v.publishedUrls })))
    console.log('SocialPosts (video type):', contentItem.socialPosts.filter(p => p.mediaType === 'video').map(p => ({ platform: p.platform, publishedUrl: p.publishedUrl })))

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

    // Remove any existing video/podcast embeds before adding fresh ones
    // This prevents duplicates on re-embed
    fullContent = fullContent.replace(/<!-- YouTube Short Video -->[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="yt-shorts-embed">[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="video-container"[\s\S]*?<\/div>/g, '')
    fullContent = fullContent.replace(/<!-- Podcast Episode -->[\s\S]*?<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="podcast-embed"[\s\S]*?<\/div>/g, '')

    // 1. Add short-form video (floated right) - find YouTube URL from multiple sources
    let youtubeShortUrl: string | null = null

    // Primary: check videos table for any video with YouTube URL (this is where it's stored)
    const youtubeVideo = contentItem.videos.find(
      v => v.videoUrl?.includes('youtube.com') || v.videoUrl?.includes('youtu.be')
    )
    if (youtubeVideo?.videoUrl) {
      youtubeShortUrl = youtubeVideo.videoUrl
    }

    // Fallback: check shortFormVideos publishedUrls (JSON field with { platform: url } mapping)
    if (!youtubeShortUrl) {
      const shortFormVideo = contentItem.shortFormVideos[0]
      if (shortFormVideo?.publishedUrls) {
        const publishedUrls = shortFormVideo.publishedUrls as Record<string, string>
        youtubeShortUrl = publishedUrls['YOUTUBE'] || publishedUrls['youtube'] || null
      }
    }

    // Fallback: check socialPosts for YouTube video post with publishedUrl
    if (!youtubeShortUrl) {
      const youtubeVideoPost = contentItem.socialPosts.find(
        p => p.platform === 'YOUTUBE' && p.mediaType === 'video' && p.publishedUrl
      )
      youtubeShortUrl = youtubeVideoPost?.publishedUrl || null
    }

    console.log('Short video embed - YouTube URL found:', youtubeShortUrl)

    if (youtubeShortUrl) {
      const shortVideoEmbed = generateShortVideoEmbed(youtubeShortUrl)
      if (shortVideoEmbed) {
        // Insert after second paragraph (after featured image which is after first paragraph)
        let insertPoint = fullContent.indexOf('</p>')
        if (insertPoint !== -1) {
          insertPoint = fullContent.indexOf('</p>', insertPoint + 1)
        }
        if (insertPoint !== -1) {
          fullContent = fullContent.slice(0, insertPoint + 4) + '\n\n' + shortVideoEmbed + fullContent.slice(insertPoint + 4)
        } else {
          // Fallback: insert at beginning
          fullContent = shortVideoEmbed + '\n\n' + fullContent
        }
        embedded.push('short-video')
      }
    }

    // 2. Add long-form video embed (if present)
    if (contentItem.longformVideoUrl) {
      const longVideoEmbed = generateLongVideoEmbed(contentItem.longformVideoUrl)
      // Insert before Google Maps embed (which is at the end)
      const mapsIndex = fullContent.indexOf('<div class="google-maps-embed"')
      if (mapsIndex !== -1) {
        fullContent = fullContent.slice(0, mapsIndex) + longVideoEmbed + '\n\n' + fullContent.slice(mapsIndex)
      } else {
        // No maps embed found, insert before last paragraph
        const lastParagraphStart = fullContent.lastIndexOf('<p>')
        if (lastParagraphStart !== -1) {
          fullContent = fullContent.slice(0, lastParagraphStart) + '\n\n' + longVideoEmbed + '\n\n' + fullContent.slice(lastParagraphStart)
        } else {
          fullContent = fullContent + '\n\n' + longVideoEmbed
        }
      }
      embedded.push('long-video')
    }

    // 3. Add podcast embed at the very end (after Google Maps)
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
