// Shared media embedding logic
// Can be called from API routes or background jobs

import { prisma } from '@/lib/db'
import { updatePost, getPost } from '@/lib/integrations/wordpress'
import { generateSchemaGraph } from '@/lib/pipeline/schema-markup'

// Generate short-form video embed (9:16 vertical, floated right)
function generateShortVideoEmbed(youtubeUrl: string): string | null {
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
  padding-bottom: 177.78%;
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

// Generate podcast embed
function generatePodcastEmbed(title: string, playerUrl: string): string {
  return `<!-- Podcast Episode -->
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

// Generate schema embed
function generateSchemaEmbed(schemaJson: string): string {
  return `<!-- JSON-LD Schema Markup -->
<script type="application/ld+json">
${schemaJson}
</script>`
}

// Generate long-form video embed
function generateLongformVideoEmbed(videoUrl: string): string {
  let videoId: string | null = null
  try {
    const url = new URL(videoUrl)
    if (url.hostname.includes('youtube.com')) {
      videoId = url.searchParams.get('v')
    } else if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.slice(1).split('?')[0]
    }
  } catch {
    return ''
  }

  if (!videoId) return ''

  return `<!-- Long-form Video -->
<div class="video-container" style="margin: 30px 0;">
  <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
    <iframe
      src="https://www.youtube.com/embed/${videoId}?rel=0"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
      title="Watch on YouTube"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen>
    </iframe>
  </div>
</div>`
}

export interface EmbedResult {
  success: boolean
  embedded: string[]
  skipped: {
    shortVideo?: string | null
    podcast?: string | null
  }
  error?: string
}

/**
 * Run the embed-all-media logic for a content item
 * This generates schema and embeds video/podcast into the WordPress post
 */
export async function runEmbedAllMedia(contentItemId: string): Promise<EmbedResult> {
  console.log('[EmbedMedia] Starting embed for content', contentItemId)

  try {
    // Get content item with all related data
    const contentItem = await prisma.contentItem.findUnique({
      where: { id: contentItemId },
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
      return { success: false, embedded: [], skipped: {}, error: 'Content item not found' }
    }

    if (!contentItem.blogPost) {
      return { success: false, embedded: [], skipped: {}, error: 'No blog post found' }
    }

    if (!contentItem.blogPost.wordpressPostId) {
      return { success: false, embedded: [], skipped: {}, error: 'Blog has not been published to WordPress yet' }
    }

    if (!contentItem.client.wordpressUrl) {
      return { success: false, embedded: [], skipped: {}, error: 'WordPress not configured for client' }
    }

    if (!contentItem.client.wordpressUsername || !contentItem.client.wordpressAppPassword) {
      return { success: false, embedded: [], skipped: {}, error: 'WordPress credentials incomplete' }
    }

    // Fetch current content from WordPress
    const wpCredentials = {
      url: contentItem.client.wordpressUrl,
      username: contentItem.client.wordpressUsername,
      password: contentItem.client.wordpressAppPassword,
    }

    let currentPost
    try {
      currentPost = await getPost(wpCredentials, contentItem.blogPost.wordpressPostId)
    } catch (wpError) {
      return {
        success: false,
        embedded: [],
        skipped: {},
        error: `Failed to fetch post from WordPress: ${wpError instanceof Error ? wpError.message : String(wpError)}`
      }
    }

    let fullContent = currentPost.content

    // Track what we're embedding
    const embedded: string[] = []

    // Remove any existing embeds before adding fresh ones
    fullContent = fullContent.replace(/<!-- JSON-LD Schema \d+ -->[\s\S]*?<\/script>/g, '')
    fullContent = fullContent.replace(/<!-- JSON-LD Schema Markup -->[\s\S]*?<\/script>/g, '')
    fullContent = fullContent.replace(/<!-- YouTube Short Video -->[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="yt-shorts-embed">[\s\S]*?<\/div>\s*<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="video-container"[\s\S]*?<\/div>/g, '')
    fullContent = fullContent.replace(/<!-- Podcast Episode -->[\s\S]*?<\/div>/g, '')
    fullContent = fullContent.replace(/<div class="podcast-embed"[\s\S]*?<\/div>/g, '')

    // 0. REGENERATE schema using latest code
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
    })

    // Save schema to blog post
    await prisma.blogPost.update({
      where: { id: contentItem.blogPost.id },
      data: { schemaJson },
    })

    // Add schema at the beginning
    const schemaEmbed = generateSchemaEmbed(schemaJson)
    fullContent = schemaEmbed + '\n\n' + fullContent
    embedded.push('schema')

    // 1. Add short-form video (floated right)
    // Look for VIDEO posts specifically (mediaType === 'video')
    let shortVideoUrl: string | null = null

    // Check client socialPosts for YouTube VIDEO post
    const youtubeVideoPost = contentItem.socialPosts.find(
      p => p.platform === 'YOUTUBE' && p.mediaType === 'video' && p.publishedUrl
    )
    if (youtubeVideoPost?.publishedUrl) {
      shortVideoUrl = youtubeVideoPost.publishedUrl
    }

    // Check WRHQ socialPosts for YouTube VIDEO post
    if (!shortVideoUrl) {
      const wrhqYoutubeVideoPost = contentItem.wrhqSocialPosts.find(
        p => p.platform === 'YOUTUBE' && p.mediaType === 'video' && p.publishedUrl
      )
      if (wrhqYoutubeVideoPost?.publishedUrl) {
        shortVideoUrl = wrhqYoutubeVideoPost.publishedUrl
      }
    }

    // Fallback: any YouTube post with publishedUrl
    if (!shortVideoUrl) {
      const anyYoutubePost = contentItem.socialPosts.find(
        p => p.platform === 'YOUTUBE' && p.publishedUrl
      ) || contentItem.wrhqSocialPosts.find(
        p => p.platform === 'YOUTUBE' && p.publishedUrl
      )
      if (anyYoutubePost?.publishedUrl) {
        shortVideoUrl = anyYoutubePost.publishedUrl
      }
    }

    if (shortVideoUrl) {
      const shortVideoEmbed = generateShortVideoEmbed(shortVideoUrl)
      if (shortVideoEmbed) {
        const firstH2 = fullContent.indexOf('<h2')
        if (firstH2 > 0) {
          fullContent = fullContent.slice(0, firstH2) + shortVideoEmbed + fullContent.slice(firstH2)
        } else {
          fullContent = shortVideoEmbed + fullContent
        }
        embedded.push('short-video')
      }
    }

    // 2. Add long-form video (if available)
    if (contentItem.longformVideoUrl) {
      const longVideoEmbed = generateLongformVideoEmbed(contentItem.longformVideoUrl)
      if (longVideoEmbed) {
        const mapsIndex = fullContent.indexOf('<!-- Google Maps')
        if (mapsIndex > 0) {
          fullContent = fullContent.slice(0, mapsIndex) + longVideoEmbed + fullContent.slice(mapsIndex)
        } else {
          fullContent = fullContent + longVideoEmbed
        }
        embedded.push('long-video')
      }
    }

    // 3. Add podcast embed (at end)
    let podcastSkipReason: string | null = null
    if (contentItem.podcast) {
      if (contentItem.podcast.podbeanPlayerUrl) {
        const podcastEmbed = generatePodcastEmbed(
          contentItem.blogPost.title,
          contentItem.podcast.podbeanPlayerUrl
        )
        fullContent = fullContent + podcastEmbed
        embedded.push('podcast')
      } else {
        podcastSkipReason = contentItem.podcast.podbeanUrl
          ? 'Podcast published but player URL not available'
          : 'Podcast not published to Podbean yet'
      }
    }

    // Update WordPress with all embeds
    await updatePost(wpCredentials, contentItem.blogPost.wordpressPostId, { content: fullContent })
    console.log('[EmbedMedia] WordPress update completed, embedded:', embedded)

    // Update tracking flags
    const updateData: Record<string, unknown> = { schemaGenerated: true }

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
        where: { id: contentItemId },
        data: updateData,
      })
    }

    // Build skip reason for short video
    const shortVideoSkipReason = !shortVideoUrl
      ? (() => {
          const youtubeClientPosts = contentItem.socialPosts.filter(p => p.platform === 'YOUTUBE')
          const youtubeWrhqPosts = contentItem.wrhqSocialPosts.filter(p => p.platform === 'YOUTUBE')
          const allYoutubePosts = [...youtubeClientPosts, ...youtubeWrhqPosts]

          if (allYoutubePosts.length === 0) {
            return 'No YouTube social posts found'
          }

          const videoPosts = allYoutubePosts.filter(p => p.mediaType === 'video')
          if (videoPosts.length === 0) {
            return 'No video-type YouTube posts found'
          }

          const videoWithUrl = videoPosts.filter(p => p.publishedUrl)
          if (videoWithUrl.length === 0) {
            return 'YouTube video posts exist but none have publishedUrl yet'
          }

          return null
        })()
      : null

    console.log('[EmbedMedia] Embed complete for', contentItemId)

    return {
      success: true,
      embedded,
      skipped: {
        shortVideo: shortVideoSkipReason,
        podcast: podcastSkipReason,
      },
    }
  } catch (error) {
    console.error('[EmbedMedia] Error:', error)
    return {
      success: false,
      embedded: [],
      skipped: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
