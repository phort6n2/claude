import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ImageType } from '@prisma/client'
import {
  getYouTubeCredentials,
  generateVideoDescription,
  generateVideoTags,
  isYouTubeConfigured,
} from '@/lib/integrations/youtube'
import { getSetting, setSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'

const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3'

interface RouteContext {
  params: Promise<{ id: string }>
}

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
  // Check if current token is still valid (with 5 minute buffer)
  if (credentials.accessToken && credentials.tokenExpiry) {
    const now = Date.now()
    if (credentials.tokenExpiry > now + 5 * 60 * 1000) {
      return credentials.accessToken
    }
  }

  // Refresh the token
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

  // Save the new token
  await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_ACCESS_TOKEN, newAccessToken)
  await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_TOKEN_EXPIRY, newExpiry.toString())

  return newAccessToken
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { fileSize } = body

    if (!fileSize) {
      return NextResponse.json(
        { error: 'Missing fileSize' },
        { status: 400 }
      )
    }

    // Check if YouTube is configured
    const configured = await isYouTubeConfigured()
    if (!configured) {
      return NextResponse.json(
        { error: 'YouTube API not configured' },
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

    const client = contentItem.client
    const serviceLocation = contentItem.serviceLocation
    const blogPost = contentItem.blogPost
    const wrhqBlogPost = contentItem.wrhqBlogPost
    const podcast = contentItem.podcast

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

    // Get YouTube credentials and access token
    const credentials = await getYouTubeCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'YouTube credentials not found' },
        { status: 400 }
      )
    }

    const accessToken = await refreshAccessToken(credentials)

    // Initialize YouTube resumable upload
    const metadata = {
      snippet: {
        title,
        description,
        tags,
        categoryId: '22', // People & Blogs category
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    }

    const initResponse = await fetch(
      `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': fileSize.toString(),
        },
        body: JSON.stringify(metadata),
      }
    )

    if (!initResponse.ok) {
      const error = await initResponse.text()
      console.error('Failed to initialize YouTube upload:', error)
      return NextResponse.json(
        { error: `YouTube upload init failed: ${error}` },
        { status: 500 }
      )
    }

    const uploadUrl = initResponse.headers.get('location')
    if (!uploadUrl) {
      return NextResponse.json(
        { error: 'No upload URL returned from YouTube' },
        { status: 500 }
      )
    }

    // Get playlist ID from client
    const playlistId = (client as { wrhqYoutubePlaylistId?: string | null }).wrhqYoutubePlaylistId || undefined

    // Store upload session info in Settings
    const sessionData = {
      uploadUrl,
      fileSize,
      bytesUploaded: 0,
      contentId: id,
      title,
      description,
      playlistId,
      thumbnailUrl: contentItem.images[0]?.gcsUrl || undefined,
      createdAt: Date.now(),
    }

    await setSetting(`youtube_upload_session_${id}`, JSON.stringify(sessionData))

    console.log('YouTube upload session initialized:', {
      contentId: id,
      title,
      fileSize,
    })

    return NextResponse.json({
      success: true,
      sessionId: id,
      fileSize,
      chunkSize: 2 * 1024 * 1024, // Recommend 2MB chunks
    })
  } catch (error) {
    console.error('Failed to initialize YouTube upload:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload init failed' },
      { status: 500 }
    )
  }
}
