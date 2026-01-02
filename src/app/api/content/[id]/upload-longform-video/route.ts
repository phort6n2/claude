import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ImageType } from '@prisma/client'
import {
  uploadVideo,
  generateVideoDescription,
  generateVideoTags,
  isYouTubeConfigured,
} from '@/lib/integrations/youtube'
import { getPost, updatePost } from '@/lib/integrations/wordpress'
import { decrypt } from '@/lib/encryption'

// Route segment config for App Router
export const maxDuration = 300 // 5 minutes for long uploads
export const dynamic = 'force-dynamic'

/**
 * Convert string to title case (capitalize first letter of each word)
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Check if YouTube is configured
    const configured = await isYouTubeConfigured()
    if (!configured) {
      return NextResponse.json(
        { error: 'YouTube API not configured' },
        { status: 400 }
      )
    }

    // Get the form data with the video file
    const formData = await request.formData()
    const videoFile = formData.get('video') as File | null

    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      )
    }

    // Get content item with all needed relations
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        serviceLocation: true,
        blogPost: true,
        wrhqBlogPost: true,
        podcast: true,
        images: {
          where: { imageType: ImageType.BLOG_FEATURED },
          take: 1,
        },
      },
    })

    if (!contentItem) {
      return NextResponse.json(
        { error: 'Content item not found' },
        { status: 404 }
      )
    }

    // Extract included relations
    const client = contentItem.client
    const serviceLocation = contentItem.serviceLocation
    const blogPost = contentItem.blogPost
    const wrhqBlogPost = contentItem.wrhqBlogPost
    const podcast = contentItem.podcast
    const images = contentItem.images
    const location = serviceLocation
      ? `${serviceLocation.city}, ${serviceLocation.state}`
      : `${client.city}, ${client.state}`

    // Generate video metadata
    const title = toTitleCase(contentItem.paaQuestion)
    const description = generateVideoDescription({
      paaQuestion: contentItem.paaQuestion,
      clientBlogUrl: blogPost?.wordpressUrl || '',
      wrhqBlogUrl: wrhqBlogPost?.wordpressUrl || '',
      googleMapsUrl: client.googleMapsUrl || undefined,
      wrhqDirectoryUrl: client.wrhqDirectoryUrl || undefined,
      podbeanUrl: podcast?.podbeanUrl || undefined,
      businessName: client.businessName,
      city: serviceLocation?.city || client.city,
      state: serviceLocation?.state || client.state,
    })
    const tags = generateVideoTags({
      businessName: client.businessName,
      city: serviceLocation?.city || client.city,
      state: serviceLocation?.state || client.state,
      paaQuestion: contentItem.paaQuestion,
    })

    // Get the featured image URL for thumbnail
    const thumbnailUrl = images[0]?.gcsUrl || undefined

    // Get the playlist ID from the client
    // Using type assertion since the field may not exist in older schema
    const playlistId = (client as { wrhqYoutubePlaylistId?: string | null }).wrhqYoutubePlaylistId || undefined

    // Convert file to buffer
    const arrayBuffer = await videoFile.arrayBuffer()
    const videoBuffer = Buffer.from(arrayBuffer)

    // Upload to YouTube
    console.log('Uploading video to YouTube...', {
      title,
      playlistId,
      tagsCount: tags.length,
      videoSize: videoBuffer.length,
      hasThumbnail: !!thumbnailUrl,
    })

    let result
    try {
      result = await uploadVideo(videoBuffer, {
        title,
        description,
        tags,
        playlistId,
        thumbnailUrl,
        privacyStatus: 'public',
      })
    } catch (uploadError) {
      console.error('YouTube upload failed:', uploadError)
      throw new Error(`YouTube upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`)
    }

    console.log('Video uploaded:', result)

    // Update the content item with the video URL
    await prisma.contentItem.update({
      where: { id },
      data: {
        longVideoUploaded: true,
        longformVideoUrl: result.videoUrl,
        longformVideoDesc: description,
      },
    })

    // Embed the video in both blog posts
    const youtubeEmbedHtml = `
<div style="margin: 30px 0; clear: both;">
  <h3 style="margin-bottom: 15px;">🎬 Watch the Full Video</h3>
  <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
    <iframe
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
      src="https://www.youtube.com/embed/${result.videoId}"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen>
    </iframe>
  </div>
</div>`

    // Update client blog post if published
    if (blogPost?.wordpressPostId && client.wordpressUrl && client.wordpressUsername && client.wordpressAppPassword) {
      try {
        const decryptedPassword = decrypt(client.wordpressAppPassword)
        if (!decryptedPassword) {
          throw new Error('Failed to decrypt WordPress password')
        }
        const credentials = {
          url: client.wordpressUrl,
          username: client.wordpressUsername,
          password: decryptedPassword,
        }

        // Get current content
        const currentPost = await getPost(credentials, blogPost.wordpressPostId)

        // Check if video is already embedded
        if (!currentPost.content.includes(result.videoId)) {
          // Add before the last paragraph
          let updatedContent = currentPost.content
          const lastPIndex = updatedContent.lastIndexOf('<p>')
          if (lastPIndex > 0) {
            updatedContent = updatedContent.slice(0, lastPIndex) + youtubeEmbedHtml + updatedContent.slice(lastPIndex)
          } else {
            updatedContent += youtubeEmbedHtml
          }

          await updatePost(credentials, blogPost.wordpressPostId, {
            content: updatedContent,
          })

          console.log('Long-form video embedded in client blog post')
        }
      } catch (error) {
        console.error('Failed to embed video in client blog:', error)
        // Don't fail the request, just log the error
      }
    }

    // Update WRHQ blog post if published
    if (wrhqBlogPost?.wordpressPostId) {
      try {
        // Get WRHQ credentials from settings
        const { getWRHQConfig } = await import('@/lib/settings')
        const wrhqConfig = await getWRHQConfig()

        if (wrhqConfig.wordpress.url && wrhqConfig.wordpress.username && wrhqConfig.wordpress.appPassword) {
          const credentials = {
            url: wrhqConfig.wordpress.url,
            username: wrhqConfig.wordpress.username,
            password: wrhqConfig.wordpress.appPassword,
          }

          // Get current content
          const currentPost = await getPost(credentials, wrhqBlogPost.wordpressPostId)

          // Check if video is already embedded
          if (!currentPost.content.includes(result.videoId)) {
            // Add before the last paragraph
            let updatedContent = currentPost.content
            const lastPIndex = updatedContent.lastIndexOf('<p>')
            if (lastPIndex > 0) {
              updatedContent = updatedContent.slice(0, lastPIndex) + youtubeEmbedHtml + updatedContent.slice(lastPIndex)
            } else {
              updatedContent += youtubeEmbedHtml
            }

            await updatePost(credentials, wrhqBlogPost.wordpressPostId, {
              content: updatedContent,
            })

            console.log('Long-form video embedded in WRHQ blog post')
          }
        }
      } catch (error) {
        console.error('Failed to embed video in WRHQ blog:', error)
        // Don't fail the request, just log the error
      }
    }

    // Mark long video as added to posts
    await prisma.contentItem.update({
      where: { id },
      data: {
        longVideoAddedToPost: true,
      },
    })

    return NextResponse.json({
      success: true,
      videoUrl: result.videoUrl,
      videoId: result.videoId,
    })
  } catch (error) {
    console.error('Failed to upload long-form video:', error)

    // Extract detailed error message
    let errorMessage = 'Upload failed'
    if (error instanceof Error) {
      errorMessage = error.message
      // Log the full stack trace for debugging
      console.error('Stack trace:', error.stack)
    } else if (typeof error === 'string') {
      errorMessage = error
    } else {
      console.error('Unknown error type:', typeof error, JSON.stringify(error))
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
