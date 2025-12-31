import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createPodcast } from '@/lib/integrations/autocontent'
import { updateWordPressPost } from '@/lib/integrations/wordpress'
import { getSetting, WRHQ_SETTINGS_KEYS } from '@/lib/settings'
import { schedulePost } from '@/lib/integrations/getlate'
import { calculateVideoSchedule } from '@/lib/scheduling'
import { SocialPlatform } from '@prisma/client'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/content/[id]/media - Handle media operations
 * Body: {
 *   action: 'generate-podcast' | 'add-podcast' | 'upload-longform' | 'embed-longform' |
 *           'publish-longform-social' | 'upload-short-videos' | 'schedule-short-videos' |
 *           'regenerate-schema' | 'update-schema'
 *   ...actionSpecificData
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
    const { action, ...data } = body

    // Get content item
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        images: true,
        shortFormVideos: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 })
    }

    switch (action) {
      case 'generate-podcast':
        return await handleGeneratePodcast(id, contentItem)

      case 'add-podcast':
        return await handleAddPodcastToPost(id, contentItem)

      case 'upload-longform':
        return await handleUploadLongform(id, contentItem, data)

      case 'embed-longform':
        return await handleEmbedLongform(id, contentItem)

      case 'publish-longform-social':
        return await handlePublishLongformSocial(id, contentItem)

      case 'upload-short-videos':
        return await handleUploadShortVideos(id, contentItem, data)

      case 'update-short-video':
        return await handleUpdateShortVideo(data)

      case 'delete-short-video':
        return await handleDeleteShortVideo(data)

      case 'schedule-short-videos':
        return await handleScheduleShortVideos(id, contentItem, data)

      case 'regenerate-schema':
        return await handleRegenerateSchema(id, contentItem)

      case 'update-schema':
        return await handleUpdateSchema(id, contentItem)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Media API error:', error)
    return NextResponse.json({ error: 'Failed to process media request' }, { status: 500 })
  }
}

// Handler functions

async function handleGeneratePodcast(
  id: string,
  contentItem: { blogPost: { content: string; title: string } | null; clientId: string }
) {
  if (!contentItem.blogPost) {
    return NextResponse.json({ error: 'Blog post required for podcast generation' }, { status: 400 })
  }

  try {
    await prisma.contentItem.update({
      where: { id },
      data: { podcastStatus: 'generating' },
    })

    const result = await createPodcast({
      script: contentItem.blogPost.content,
      title: contentItem.blogPost.title,
    })

    // Create or update podcast record
    await prisma.podcast.upsert({
      where: { contentItemId: id },
      create: {
        contentItemId: id,
        clientId: contentItem.clientId,
        audioUrl: result.audioUrl || '',
        duration: result.duration,
        script: contentItem.blogPost.content,
        autocontentJobId: result.jobId,
        status: 'PENDING', // Will update when job completes
      },
      update: {
        audioUrl: result.audioUrl || '',
        duration: result.duration,
        script: contentItem.blogPost.content,
        autocontentJobId: result.jobId,
        status: 'PENDING',
      },
    })

    await prisma.contentItem.update({
      where: { id },
      data: {
        podcastGenerated: true,
        podcastStatus: 'pending',
      },
    })

    return NextResponse.json({ success: true, jobId: result.jobId })
  } catch (error) {
    await prisma.contentItem.update({
      where: { id },
      data: { podcastStatus: 'failed' },
    })
    throw error
  }
}

async function handleAddPodcastToPost(
  id: string,
  contentItem: {
    blogPost: { id: string; content: string; wordpressPostId: number | null } | null
    client: { wordpressUrl: string | null; wordpressUsername: string | null; wordpressAppPassword: string | null }
    podcast?: { audioUrl: string } | null
    podcastDescription: string | null
  }
) {
  if (!contentItem.blogPost || !contentItem.blogPost.wordpressPostId) {
    return NextResponse.json({ error: 'Blog must be published first' }, { status: 400 })
  }

  const podcast = await prisma.podcast.findUnique({
    where: { contentItemId: id },
  })

  if (!podcast) {
    return NextResponse.json({ error: 'Podcast not generated' }, { status: 400 })
  }

  // Create podcast embed HTML
  const podcastEmbed = `
<div class="podcast-embed" style="margin: 2rem 0; padding: 1.5rem; background: #f8f9fa; border-radius: 8px;">
  <h3 style="margin-top: 0;">🎧 Listen to this article</h3>
  <audio controls style="width: 100%;">
    <source src="${podcast.audioUrl}" type="audio/mpeg">
    Your browser does not support the audio element.
  </audio>
  ${contentItem.podcastDescription ? `<p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">${contentItem.podcastDescription}</p>` : ''}
</div>
`

  // Insert after first paragraph
  const updatedContent = insertAfterFirstParagraph(contentItem.blogPost.content, podcastEmbed)

  // Update WordPress
  await updateWordPressPost({
    client: contentItem.client as {
      wordpressUrl: string
      wordpressUsername: string
      wordpressAppPassword: string
    },
    postId: contentItem.blogPost.wordpressPostId,
    content: updatedContent,
  })

  // Update local records
  await prisma.blogPost.update({
    where: { id: contentItem.blogPost.id },
    data: { content: updatedContent },
  })

  await prisma.contentItem.update({
    where: { id },
    data: {
      podcastAddedToPost: true,
      podcastAddedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true })
}

async function handleUploadLongform(
  id: string,
  contentItem: { clientId: string },
  data: { videoUrl: string; description?: string; thumbnailUrl?: string }
) {
  const { videoUrl, description, thumbnailUrl } = data

  if (!videoUrl) {
    return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 })
  }

  await prisma.contentItem.update({
    where: { id },
    data: {
      longVideoUploaded: true,
      longformVideoUrl: videoUrl,
      longformVideoDesc: description,
    },
  })

  // Create video record
  await prisma.video.create({
    data: {
      contentItemId: id,
      clientId: contentItem.clientId,
      videoType: 'LONG',
      videoUrl,
      thumbnailUrl,
      provider: 'MANUAL',
      status: 'READY',
    },
  })

  return NextResponse.json({ success: true })
}

async function handleEmbedLongform(
  id: string,
  contentItem: {
    blogPost: { id: string; content: string; wordpressPostId: number | null } | null
    client: { wordpressUrl: string | null; wordpressUsername: string | null; wordpressAppPassword: string | null }
    longformVideoUrl: string | null
    longformVideoDesc: string | null
  }
) {
  if (!contentItem.blogPost || !contentItem.blogPost.wordpressPostId) {
    return NextResponse.json({ error: 'Blog must be published first' }, { status: 400 })
  }

  if (!contentItem.longformVideoUrl) {
    return NextResponse.json({ error: 'No video uploaded' }, { status: 400 })
  }

  // Create video embed HTML
  const videoEmbed = createVideoEmbed(contentItem.longformVideoUrl, contentItem.longformVideoDesc || '')

  // Insert after first paragraph
  const updatedContent = insertAfterFirstParagraph(contentItem.blogPost.content, videoEmbed)

  // Update client WordPress
  await updateWordPressPost({
    client: contentItem.client as {
      wordpressUrl: string
      wordpressUsername: string
      wordpressAppPassword: string
    },
    postId: contentItem.blogPost.wordpressPostId,
    content: updatedContent,
  })

  // Also update WRHQ WordPress if enabled
  const wrhqEnabled = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_ENABLED)
  if (wrhqEnabled === 'true') {
    const wrhqWpUrl = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_URL)
    const wrhqWpUser = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_USERNAME)
    const wrhqWpPass = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_APP_PASSWORD)

    if (wrhqWpUrl && wrhqWpUser && wrhqWpPass) {
      // Would need to track WRHQ post ID separately
      // For now, just update local content
    }
  }

  // Update local records
  await prisma.blogPost.update({
    where: { id: contentItem.blogPost.id },
    data: { content: updatedContent },
  })

  await prisma.contentItem.update({
    where: { id },
    data: {
      longVideoAddedToPost: true,
      longVideoAddedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true })
}

async function handlePublishLongformSocial(
  id: string,
  contentItem: {
    client: { socialPlatforms: string[]; socialAccountIds: unknown }
    longformVideoUrl: string | null
    longformVideoDesc: string | null
  }
) {
  if (!contentItem.longformVideoUrl) {
    return NextResponse.json({ error: 'No video uploaded' }, { status: 400 })
  }

  const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
  const results: { platform: string; success: boolean; error?: string }[] = []

  // Publish to client platforms IMMEDIATELY
  for (const platform of contentItem.client.socialPlatforms || []) {
    const accountId = socialAccountIds?.[platform.toLowerCase()]
    if (!accountId) continue

    try {
      await schedulePost({
        accountId,
        platform: platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
        caption: contentItem.longformVideoDesc || 'Check out our latest video!',
        mediaUrls: [contentItem.longformVideoUrl],
        scheduledTime: new Date(), // NOW
      })
      results.push({ platform, success: true })
    } catch (error) {
      results.push({ platform, success: false, error: String(error) })
    }
  }

  // Also publish to WRHQ platforms if enabled
  const wrhqEnabled = await getSetting(WRHQ_SETTINGS_KEYS.WRHQ_ENABLED)
  if (wrhqEnabled === 'true') {
    const wrhqPlatformKeys = [
      { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_YOUTUBE_ID, platform: 'youtube' },
      { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_FACEBOOK_ID, platform: 'facebook' },
      { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_INSTAGRAM_ID, platform: 'instagram' },
      { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_LINKEDIN_ID, platform: 'linkedin' },
      { key: WRHQ_SETTINGS_KEYS.WRHQ_LATE_TIKTOK_ID, platform: 'tiktok' },
    ]

    for (const { key, platform } of wrhqPlatformKeys) {
      const accountId = await getSetting(key)
      if (!accountId) continue

      try {
        await schedulePost({
          accountId,
          platform: platform as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
          caption: `WRHQ Partner Video: ${contentItem.longformVideoDesc || ''}`,
          mediaUrls: [contentItem.longformVideoUrl],
          scheduledTime: new Date(), // NOW
        })
        results.push({ platform: `wrhq_${platform}`, success: true })
      } catch (error) {
        results.push({ platform: `wrhq_${platform}`, success: false, error: String(error) })
      }
    }
  }

  return NextResponse.json({ success: true, results })
}

async function handleUploadShortVideos(
  id: string,
  contentItem: { clientId: string },
  data: { videos: { videoUrl: string; title?: string; description?: string; platforms?: string[]; thumbnailUrl?: string }[] }
) {
  const { videos } = data

  if (!videos || !Array.isArray(videos)) {
    return NextResponse.json({ error: 'videos array is required' }, { status: 400 })
  }

  const createdVideos = await prisma.shortFormVideo.createMany({
    data: videos.map((video, index) => ({
      contentItemId: id,
      clientId: contentItem.clientId,
      title: video.title || null,
      description: video.description || null,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl || null,
      platforms: (video.platforms || ['TIKTOK', 'INSTAGRAM', 'YOUTUBE']) as SocialPlatform[],
      sortOrder: index,
    })),
  })

  await prisma.contentItem.update({
    where: { id },
    data: { shortVideoGenerated: true },
  })

  return NextResponse.json({ success: true, count: createdVideos.count })
}

async function handleUpdateShortVideo(data: {
  videoId: string
  title?: string
  description?: string
  platforms?: string[]
}) {
  const { videoId, title, description, platforms } = data

  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
  }

  await prisma.shortFormVideo.update({
    where: { id: videoId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(platforms !== undefined && { platforms: platforms as SocialPlatform[] }),
    },
  })

  return NextResponse.json({ success: true })
}

async function handleDeleteShortVideo(data: { videoId: string }) {
  const { videoId } = data

  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
  }

  await prisma.shortFormVideo.delete({
    where: { id: videoId },
  })

  return NextResponse.json({ success: true })
}

async function handleScheduleShortVideos(
  id: string,
  contentItem: {
    client: { socialAccountIds: unknown }
    shortFormVideos: { id: string; videoUrl: string; description: string | null; platforms: string[] }[]
  },
  data: { startDate: string; videosPerDay?: number; timeSlots?: string[] }
) {
  const { startDate, videosPerDay = 3, timeSlots = ['09:00', '13:00', '17:00'] } = data

  if (!startDate) {
    return NextResponse.json({ error: 'startDate is required' }, { status: 400 })
  }

  const videos = contentItem.shortFormVideos
  const schedule = calculateVideoSchedule(videos.length, new Date(startDate), videosPerDay, timeSlots)

  const socialAccountIds = contentItem.client.socialAccountIds as Record<string, string> | null
  const results: { videoId: string; success: boolean; postIds?: unknown }[] = []

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i]
    const slot = schedule[i]
    const postIds: Record<string, string> = {}

    // Schedule to each platform
    for (const platform of video.platforms) {
      const accountId = socialAccountIds?.[platform.toLowerCase()]
      if (!accountId) continue

      try {
        const scheduledTime = new Date(slot.scheduledDate)
        const [hours, minutes] = slot.scheduledTime.split(':').map(Number)
        scheduledTime.setHours(hours, minutes, 0, 0)

        const result = await schedulePost({
          accountId,
          platform: platform.toLowerCase() as 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram',
          caption: video.description || '',
          mediaUrls: [video.videoUrl],
          scheduledTime,
        })

        postIds[platform] = result.postId
      } catch (error) {
        console.error(`Failed to schedule video ${video.id} to ${platform}:`, error)
      }
    }

    // Update video record
    await prisma.shortFormVideo.update({
      where: { id: video.id },
      data: {
        scheduledDate: slot.scheduledDate,
        scheduledTime: slot.scheduledTime,
        dayNumber: slot.dayNumber,
        slotNumber: slot.slotNumber,
        getlatePostIds: postIds,
        status: 'SCHEDULED',
      },
    })

    results.push({ videoId: video.id, success: true, postIds })
  }

  return NextResponse.json({ success: true, results, schedule })
}

async function handleRegenerateSchema(
  id: string,
  contentItem: {
    blogPost: { title: string; content: string; metaDescription: string | null } | null
    client: { businessName: string }
    podcast?: { audioUrl: string } | null
    longformVideoUrl: string | null
    shortFormVideos: { videoUrl: string }[]
  }
) {
  if (!contentItem.blogPost) {
    return NextResponse.json({ error: 'Blog post required' }, { status: 400 })
  }

  const podcast = await prisma.podcast.findUnique({
    where: { contentItemId: id },
  })

  // Build comprehensive schema with all media
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: contentItem.blogPost.title,
        description: contentItem.blogPost.metaDescription,
        author: {
          '@type': 'Organization',
          name: contentItem.client.businessName,
        },
      },
    ],
  }

  // Add podcast schema
  if (podcast) {
    (schema['@graph'] as unknown[]).push({
      '@type': 'AudioObject',
      name: `${contentItem.blogPost.title} - Audio`,
      contentUrl: podcast.audioUrl,
    })
  }

  // Add video schema for long-form
  if (contentItem.longformVideoUrl) {
    (schema['@graph'] as unknown[]).push({
      '@type': 'VideoObject',
      name: `${contentItem.blogPost.title} - Video`,
      contentUrl: contentItem.longformVideoUrl,
    })
  }

  // Add schemas for short-form videos
  for (const video of contentItem.shortFormVideos) {
    (schema['@graph'] as unknown[]).push({
      '@type': 'VideoObject',
      name: `${contentItem.blogPost.title} - Short Clip`,
      contentUrl: video.videoUrl,
    })
  }

  // Update blog post
  await prisma.blogPost.update({
    where: { contentItemId: id },
    data: { schemaJson: JSON.stringify(schema) },
  })

  await prisma.contentItem.update({
    where: { id },
    data: {
      schemaGenerated: true,
      schemaUpdateCount: { increment: 1 },
      schemaLastUpdated: new Date(),
    },
  })

  return NextResponse.json({ success: true, schema })
}

async function handleUpdateSchema(
  id: string,
  contentItem: {
    blogPost: { wordpressPostId: number | null; schemaJson: string | null } | null
    client: { wordpressUrl: string | null; wordpressUsername: string | null; wordpressAppPassword: string | null }
  }
) {
  if (!contentItem.blogPost || !contentItem.blogPost.wordpressPostId || !contentItem.blogPost.schemaJson) {
    return NextResponse.json({ error: 'Blog must be published with schema' }, { status: 400 })
  }

  // Update WordPress with new schema
  await updateWordPressPost({
    client: contentItem.client as {
      wordpressUrl: string
      wordpressUsername: string
      wordpressAppPassword: string
    },
    postId: contentItem.blogPost.wordpressPostId,
    schemaJson: contentItem.blogPost.schemaJson,
  })

  return NextResponse.json({ success: true })
}

// Helper functions

function insertAfterFirstParagraph(content: string, insert: string): string {
  const match = content.match(/<\/p>/i)
  if (match && match.index !== undefined) {
    return content.slice(0, match.index + 4) + '\n' + insert + content.slice(match.index + 4)
  }
  return insert + content
}

function createVideoEmbed(url: string, description: string): string {
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
${description ? `<p class="video-description" style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">${description}</p>` : ''}
`
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
${description ? `<p class="video-description" style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">${description}</p>` : ''}
`
  }

  // Default to HTML5 video
  return `
<div class="video-container" style="margin: 2rem 0;">
  <video controls style="width: 100%; max-width: 100%;">
    <source src="${url}" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>
${description ? `<p class="video-description" style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">${description}</p>` : ''}
`
}
