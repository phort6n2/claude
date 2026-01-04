import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updatePost } from '@/lib/integrations/wordpress'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Generate featured image embed HTML
function generateFeaturedImageEmbed(imageUrl: string | null, altText: string): string {
  if (!imageUrl) return ''

  return `
<figure class="featured-image" style="margin: 20px 0; text-align: center;">
  <img src="${imageUrl}" alt="${altText}" style="max-width: 100%; height: auto; border-radius: 8px;" />
</figure>`
}

// Helper function to insert content after the 3rd H2 header (or best available position)
function insertAfterThirdH2(content: string, insert: string): string {
  if (!insert) return content

  // Find all H2 closing tags
  const h2Pattern = /<\/h2>/gi
  let match
  let h2Count = 0
  let insertPosition = -1

  while ((match = h2Pattern.exec(content)) !== null) {
    h2Count++
    if (h2Count === 3) {
      insertPosition = match.index + match[0].length
      break
    }
  }

  // If we found 3rd H2, insert after it
  if (insertPosition !== -1) {
    return content.slice(0, insertPosition) + '\n\n' + insert + '\n\n' + content.slice(insertPosition)
  }

  // Fallback: if less than 3 H2s, try after the last H2
  if (h2Count > 0) {
    h2Pattern.lastIndex = 0 // Reset
    while ((match = h2Pattern.exec(content)) !== null) {
      insertPosition = match.index + match[0].length
    }
    if (insertPosition !== -1) {
      return content.slice(0, insertPosition) + '\n\n' + insert + '\n\n' + content.slice(insertPosition)
    }
  }

  // Final fallback: insert after first paragraph
  const firstParagraphEnd = content.indexOf('</p>')
  if (firstParagraphEnd !== -1) {
    return content.slice(0, firstParagraphEnd + 4) + '\n\n' + insert + '\n\n' + content.slice(firstParagraphEnd + 4)
  }

  // Last resort: prepend
  return insert + '\n\n' + content
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

// Generate video embed HTML
function generateVideoEmbed(url: string, description: string): string {
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

/**
 * POST /api/content/[id]/republish-blog - Re-publish blog with all embeds (image, map, podcast, video)
 * Use this to fix a blog that lost its embeds
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

    // Start with the original blog content
    let fullContent = contentItem.blogPost.content

    // Add featured image after 3rd H2 header (in the middle of the blog post)
    const featuredImage = contentItem.images.find(img => img.imageType === 'BLOG_FEATURED')
    if (featuredImage?.gcsUrl) {
      const featuredImageEmbed = generateFeaturedImageEmbed(
        featuredImage.gcsUrl,
        `${contentItem.blogPost.title} | ${contentItem.client.businessName}`
      )
      fullContent = insertAfterThirdH2(fullContent, featuredImageEmbed)
    }

    // Add longform video embed after featured image (if present)
    if (contentItem.longformVideoUrl && contentItem.longVideoAddedToPost) {
      const videoEmbed = generateVideoEmbed(
        contentItem.longformVideoUrl,
        contentItem.longformVideoDesc || ''
      )
      // Insert after first paragraph (which now includes the featured image)
      const firstParagraphEnd = fullContent.indexOf('</p>')
      if (firstParagraphEnd !== -1) {
        fullContent = fullContent.slice(0, firstParagraphEnd + 4) + '\n' + videoEmbed + fullContent.slice(firstParagraphEnd + 4)
      } else {
        fullContent = videoEmbed + fullContent
      }
    }

    // Add Google Maps embed at the end
    const googleMapsEmbed = generateGoogleMapsEmbed(contentItem.client)
    fullContent = fullContent + googleMapsEmbed

    // Add podcast embed at the very end (if published)
    if (contentItem.podcast?.podbeanPlayerUrl && contentItem.podcastAddedToPost) {
      const podcastEmbed = generatePodcastEmbed(
        contentItem.blogPost.title,
        contentItem.podcast.podbeanPlayerUrl
      )
      fullContent = fullContent + podcastEmbed
    }

    // Update WordPress
    await updatePost(
      {
        url: contentItem.client.wordpressUrl,
        username: contentItem.client.wordpressUsername || '',
        password: contentItem.client.wordpressAppPassword || '',
      },
      contentItem.blogPost.wordpressPostId,
      { content: fullContent }
    )

    return NextResponse.json({
      success: true,
      message: 'Blog re-published with all embeds',
    })
  } catch (error) {
    console.error('Re-publish blog error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
