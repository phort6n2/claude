import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getYouTubeCredentials } from '@/lib/integrations/youtube'
import { getSetting, setSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'
import { getPost, updatePost } from '@/lib/integrations/wordpress'
import { decrypt } from '@/lib/encryption'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3'

// Route segment config
export const maxDuration = 120 // 2 minutes for finalization

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Refresh access token if needed
 */
async function refreshAccessToken(credentials: {
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string
  tokenExpiry?: number
}): Promise<string> {
  if (credentials.accessToken && credentials.tokenExpiry) {
    const now = Date.now()
    if (credentials.tokenExpiry > now + 5 * 60 * 1000) {
      return credentials.accessToken
    }
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh token: ${error}`)
  }

  const data = await response.json()
  const newAccessToken = data.access_token
  const expiresIn = data.expires_in || 3600
  const newExpiry = Date.now() + expiresIn * 1000

  await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_ACCESS_TOKEN, newAccessToken)
  await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_TOKEN_EXPIRY, newExpiry.toString())

  return newAccessToken
}

/**
 * Add video to playlist
 */
async function addVideoToPlaylist(
  videoId: string,
  playlistId: string,
  accessToken: string
): Promise<void> {
  const response = await fetch(`${YOUTUBE_API_BASE}/playlistItems?part=snippet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId,
        },
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to add video to playlist:', error)
    // Don't throw - not critical
  } else {
    console.log('Video added to playlist:', playlistId)
  }
}

/**
 * Set custom thumbnail for video
 */
async function setVideoThumbnail(
  videoId: string,
  thumbnailUrl: string,
  accessToken: string
): Promise<void> {
  try {
    const imageResponse = await fetch(thumbnailUrl)
    if (!imageResponse.ok) {
      console.error('Failed to fetch thumbnail image')
      return
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    const response = await fetch(
      `${YOUTUBE_UPLOAD_BASE}/thumbnails/set?videoId=${videoId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
        },
        body: new Uint8Array(imageBuffer),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to set video thumbnail:', error)
    } else {
      console.log('Thumbnail set for video:', videoId)
    }
  } catch (error) {
    console.error('Error setting video thumbnail:', error)
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { videoId, videoUrl, playlistId, thumbnailUrl, description } = body

    if (!videoId || !videoUrl) {
      return NextResponse.json(
        { error: 'Missing videoId or videoUrl' },
        { status: 400 }
      )
    }

    // Get credentials and access token
    const credentials = await getYouTubeCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'YouTube credentials not found' },
        { status: 400 }
      )
    }

    const accessToken = await refreshAccessToken(credentials)

    // Add to playlist if specified
    if (playlistId) {
      await addVideoToPlaylist(videoId, playlistId, accessToken)
    }

    // Set thumbnail if specified
    if (thumbnailUrl) {
      await setVideoThumbnail(videoId, thumbnailUrl, accessToken)
    }

    // Get content item for blog embedding
    const contentItem = await prisma.contentItem.findUnique({
      where: { id },
      include: {
        client: true,
        blogPost: true,
        wrhqBlogPost: true,
      },
    })

    if (!contentItem) {
      return NextResponse.json(
        { error: 'Content item not found' },
        { status: 404 }
      )
    }

    // Update the content item with the video URL
    await prisma.contentItem.update({
      where: { id },
      data: {
        longVideoUploaded: true,
        longformVideoUrl: videoUrl,
        longformVideoDesc: description,
      },
    })

    // Helper function to remove existing YouTube embeds from content
    function removeExistingYouTubeEmbeds(content: string): string {
      // Look for our specific embed signature and remove it
      // We use a simple approach: find the start marker and end marker
      const startMarker = '<div style="margin: 30px 0; clear: both;">'
      const h3Marker = '<h3 style="margin-bottom: 15px;">Watch the Full Video</h3>'

      let result = content
      let startIdx = result.indexOf(startMarker)

      while (startIdx !== -1) {
        // Check if this div contains our "Watch the Full Video" header
        const searchEnd = Math.min(startIdx + 500, result.length) // Look within next 500 chars
        const snippet = result.substring(startIdx, searchEnd)

        if (snippet.includes(h3Marker) && snippet.includes('youtube.com/embed/')) {
          // This is our embed - find the closing </div></div></div>
          // Count div depth to find the right closing tags
          let depth = 0
          let endIdx = startIdx

          for (let i = startIdx; i < result.length; i++) {
            if (result.substring(i, i + 4) === '<div') {
              depth++
            } else if (result.substring(i, i + 6) === '</div>') {
              depth--
              if (depth === 0) {
                endIdx = i + 6
                break
              }
            }
          }

          if (endIdx > startIdx) {
            // Remove this embed block
            result = result.substring(0, startIdx) + result.substring(endIdx)
            console.log('Removed existing YouTube embed from position', startIdx)
          }
        }

        // Look for next occurrence
        startIdx = result.indexOf(startMarker, startIdx + 1)
      }

      return result
    }

    // Embed the video in both blog posts
    const youtubeEmbedHtml = `
<div style="margin: 30px 0; clear: both;">
  <h3 style="margin-bottom: 15px;">Watch the Full Video</h3>
  <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
    <iframe
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
      src="https://www.youtube.com/embed/${videoId}"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen>
    </iframe>
  </div>
</div>`

    const client = contentItem.client
    const blogPost = contentItem.blogPost
    const wrhqBlogPost = contentItem.wrhqBlogPost

    console.log('Blog embedding debug:', {
      hasClientBlogPost: !!blogPost,
      clientBlogPostId: blogPost?.wordpressPostId,
      hasClientWpUrl: !!client.wordpressUrl,
      hasClientWpUsername: !!client.wordpressUsername,
      hasClientWpPassword: !!client.wordpressAppPassword,
      hasWrhqBlogPost: !!wrhqBlogPost,
      wrhqBlogPostId: wrhqBlogPost?.wordpressPostId,
    })

    // Update client blog post if published
    if (blogPost?.wordpressPostId && client.wordpressUrl && client.wordpressUsername && client.wordpressAppPassword) {
      console.log('Attempting to embed video in client blog post...')
      try {
        const decryptedPassword = decrypt(client.wordpressAppPassword)
        if (decryptedPassword) {
          const credentials = {
            url: client.wordpressUrl,
            username: client.wordpressUsername,
            password: decryptedPassword,
          }

          console.log('Fetching client blog post:', blogPost.wordpressPostId)
          const currentPost = await getPost(credentials, blogPost.wordpressPostId)
          console.log('Current post content length:', currentPost.content?.length)

          // Remove any existing YouTube embeds first (for re-uploads)
          let updatedContent = removeExistingYouTubeEmbeds(currentPost.content)
          console.log('Content after removing old embeds:', updatedContent.length)

          // Add the new embed before the last paragraph
          const lastPIndex = updatedContent.lastIndexOf('<p>')
          if (lastPIndex > 0) {
            updatedContent = updatedContent.slice(0, lastPIndex) + youtubeEmbedHtml + updatedContent.slice(lastPIndex)
          } else {
            updatedContent += youtubeEmbedHtml
          }

          console.log('Updating client blog post with video embed...')
          await updatePost(credentials, blogPost.wordpressPostId, {
            content: updatedContent,
          })

          console.log('Long-form video embedded in client blog post')
        } else {
          console.log('Failed to decrypt client WordPress password')
        }
      } catch (error) {
        console.error('Failed to embed video in client blog:', error)
      }
    } else {
      console.log('Skipping client blog embed - missing requirements:', {
        hasWordpressPostId: !!blogPost?.wordpressPostId,
        hasWpUrl: !!client.wordpressUrl,
        hasWpUsername: !!client.wordpressUsername,
        hasWpPassword: !!client.wordpressAppPassword,
      })
    }

    // Update WRHQ blog post if published
    if (wrhqBlogPost?.wordpressPostId) {
      console.log('Attempting to embed video in WRHQ blog post...')
      try {
        const { getWRHQConfig } = await import('@/lib/settings')
        const wrhqConfig = await getWRHQConfig()

        console.log('WRHQ config:', {
          hasUrl: !!wrhqConfig.wordpress.url,
          hasUsername: !!wrhqConfig.wordpress.username,
          hasPassword: !!wrhqConfig.wordpress.appPassword,
        })

        if (wrhqConfig.wordpress.url && wrhqConfig.wordpress.username && wrhqConfig.wordpress.appPassword) {
          const credentials = {
            url: wrhqConfig.wordpress.url,
            username: wrhqConfig.wordpress.username,
            password: wrhqConfig.wordpress.appPassword,
          }

          console.log('Fetching WRHQ blog post:', wrhqBlogPost.wordpressPostId)
          const currentPost = await getPost(credentials, wrhqBlogPost.wordpressPostId)
          console.log('Current WRHQ post content length:', currentPost.content?.length)

          // Remove any existing YouTube embeds first (for re-uploads)
          let updatedContent = removeExistingYouTubeEmbeds(currentPost.content)
          console.log('WRHQ content after removing old embeds:', updatedContent.length)

          // Add the new embed before the last paragraph
          const lastPIndex = updatedContent.lastIndexOf('<p>')
          if (lastPIndex > 0) {
            updatedContent = updatedContent.slice(0, lastPIndex) + youtubeEmbedHtml + updatedContent.slice(lastPIndex)
          } else {
            updatedContent += youtubeEmbedHtml
          }

          console.log('Updating WRHQ blog post with video embed...')
          await updatePost(credentials, wrhqBlogPost.wordpressPostId, {
            content: updatedContent,
          })

          console.log('Long-form video embedded in WRHQ blog post')
        } else {
          console.log('WRHQ WordPress not configured')
        }
      } catch (error) {
        console.error('Failed to embed video in WRHQ blog:', error)
      }
    } else {
      console.log('Skipping WRHQ blog embed - no wordpressPostId')
    }

    // Note: longVideoAddedToPost is NOT set here - it will be set when user clicks
    // the "Embed All Media" button in step 7. This keeps the embed step separate from upload.

    return NextResponse.json({
      success: true,
      videoUrl,
      videoId,
    })
  } catch (error) {
    console.error('Failed to finalize YouTube upload:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Finalization failed' },
      { status: 500 }
    )
  }
}
