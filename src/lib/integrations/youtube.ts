// YouTube Data API Integration for WRHQ Long-form Video Publishing

import { getSetting, setSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3'

interface YouTubeCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string
  tokenExpiry?: number
}

interface YouTubePlaylist {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  itemCount: number
}

interface YouTubeVideoUploadParams {
  title: string
  description: string
  tags: string[]
  playlistId?: string
  thumbnailUrl?: string
  privacyStatus: 'public' | 'private' | 'unlisted'
}

interface YouTubeVideoUploadResult {
  videoId: string
  videoUrl: string
  status: string
}

/**
 * Get YouTube API credentials from settings
 */
export async function getYouTubeCredentials(): Promise<YouTubeCredentials | null> {
  const clientId = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CLIENT_ID)
  const clientSecret = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CLIENT_SECRET)
  const refreshToken = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_REFRESH_TOKEN)

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  const accessToken = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_ACCESS_TOKEN)
  const tokenExpiryStr = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_TOKEN_EXPIRY)
  const tokenExpiry = tokenExpiryStr ? parseInt(tokenExpiryStr, 10) : undefined

  return {
    clientId,
    clientSecret,
    refreshToken,
    accessToken: accessToken || undefined,
    tokenExpiry,
  }
}

/**
 * Check if YouTube API is configured
 */
export async function isYouTubeConfigured(): Promise<boolean> {
  const credentials = await getYouTubeCredentials()
  return credentials !== null
}

/**
 * Refresh access token if needed
 */
async function refreshAccessToken(credentials: YouTubeCredentials): Promise<string> {
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
    console.error('Failed to refresh YouTube access token:', error)
    throw new Error('Failed to refresh YouTube access token')
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

/**
 * Get OAuth URL for initial authentication
 */
export function getYouTubeOAuthUrl(clientId: string, redirectUri: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to exchange code for tokens:', error)
    throw new Error('Failed to exchange authorization code')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Get channel info for the authenticated user
 */
export async function getChannelInfo(): Promise<{ id: string; title: string } | null> {
  const credentials = await getYouTubeCredentials()
  if (!credentials) {
    throw new Error('YouTube API not configured')
  }

  const accessToken = await refreshAccessToken(credentials)

  const response = await fetch(
    `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to get channel info:', error)
    throw new Error('Failed to get YouTube channel info')
  }

  const data = await response.json()
  if (data.items && data.items.length > 0) {
    const channel = data.items[0]
    return {
      id: channel.id,
      title: channel.snippet.title,
    }
  }

  return null
}

/**
 * Get all playlists for the authenticated channel
 */
export async function getPlaylists(): Promise<YouTubePlaylist[]> {
  const credentials = await getYouTubeCredentials()
  if (!credentials) {
    throw new Error('YouTube API not configured')
  }

  const accessToken = await refreshAccessToken(credentials)

  const playlists: YouTubePlaylist[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(`${YOUTUBE_API_BASE}/playlists`)
    url.searchParams.append('part', 'snippet,contentDetails')
    url.searchParams.append('mine', 'true')
    url.searchParams.append('maxResults', '50')
    if (nextPageToken) {
      url.searchParams.append('pageToken', nextPageToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to get playlists:', error)
      throw new Error('Failed to get YouTube playlists')
    }

    const data = await response.json()

    for (const item of data.items || []) {
      playlists.push({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description || '',
        thumbnailUrl: item.snippet.thumbnails?.default?.url || '',
        itemCount: item.contentDetails?.itemCount || 0,
      })
    }

    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return playlists
}

/**
 * Upload a video to YouTube
 * Uses resumable upload for better reliability with large files
 */
export async function uploadVideo(
  videoBuffer: Buffer,
  params: YouTubeVideoUploadParams
): Promise<YouTubeVideoUploadResult> {
  const credentials = await getYouTubeCredentials()
  if (!credentials) {
    throw new Error('YouTube API not configured')
  }

  const accessToken = await refreshAccessToken(credentials)

  // Step 1: Initialize resumable upload
  const metadata = {
    snippet: {
      title: params.title,
      description: params.description,
      tags: params.tags,
      categoryId: '22', // People & Blogs category
    },
    status: {
      privacyStatus: params.privacyStatus,
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
        'X-Upload-Content-Length': videoBuffer.length.toString(),
      },
      body: JSON.stringify(metadata),
    }
  )

  if (!initResponse.ok) {
    const error = await initResponse.text()
    console.error('Failed to initialize upload:', error)
    throw new Error('Failed to initialize YouTube upload')
  }

  const uploadUrl = initResponse.headers.get('location')
  if (!uploadUrl) {
    throw new Error('No upload URL returned from YouTube')
  }

  // Step 2: Upload the video content
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/*',
      'Content-Length': videoBuffer.length.toString(),
    },
    body: new Uint8Array(videoBuffer),
  })

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    console.error('Failed to upload video:', error)
    throw new Error('Failed to upload video to YouTube')
  }

  const videoData = await uploadResponse.json()
  const videoId = videoData.id

  // Step 3: Add to playlist if specified
  if (params.playlistId) {
    await addVideoToPlaylist(videoId, params.playlistId, accessToken)
  }

  // Step 4: Set thumbnail if specified
  if (params.thumbnailUrl) {
    await setVideoThumbnail(videoId, params.thumbnailUrl, accessToken)
  }

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    status: videoData.status?.uploadStatus || 'uploaded',
  }
}

/**
 * Upload a video to YouTube from a URL (fetches the video first)
 */
export async function uploadVideoFromUrl(
  videoUrl: string,
  params: YouTubeVideoUploadParams
): Promise<YouTubeVideoUploadResult> {
  // Fetch the video content
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch video from URL: ${videoUrl}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const videoBuffer = Buffer.from(arrayBuffer)

  return uploadVideo(videoBuffer, params)
}

/**
 * Add a video to a playlist
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
    // Don't throw - this is not critical
  }
}

/**
 * Set a custom thumbnail for a video
 */
async function setVideoThumbnail(
  videoId: string,
  thumbnailUrl: string,
  accessToken: string
): Promise<void> {
  try {
    // Fetch the thumbnail image
    const imageResponse = await fetch(thumbnailUrl)
    if (!imageResponse.ok) {
      console.error('Failed to fetch thumbnail image')
      return
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    // Upload the thumbnail
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
      // Don't throw - this is not critical
    }
  } catch (error) {
    console.error('Error setting video thumbnail:', error)
  }
}

/**
 * Generate YouTube video description with links
 */
export function generateVideoDescription(params: {
  paaQuestion: string
  clientBlogUrl: string
  wrhqBlogUrl: string
  googleMapsUrl?: string
  wrhqDirectoryUrl?: string
  podbeanUrl?: string
  businessName: string
  city: string
  state: string
}): string {
  const lines: string[] = []

  lines.push(params.paaQuestion)
  lines.push('')
  lines.push(`In this video, ${params.businessName} answers your questions about windshield repair and replacement services in ${params.city}, ${params.state}.`)
  lines.push('')
  lines.push('📚 RESOURCES:')
  lines.push('')
  lines.push(`📝 Read the full article: ${params.clientBlogUrl}`)
  lines.push(`🌐 WRHQ Directory: ${params.wrhqBlogUrl}`)

  if (params.googleMapsUrl) {
    lines.push(`📍 Find us on Google Maps: ${params.googleMapsUrl}`)
  }

  if (params.wrhqDirectoryUrl) {
    lines.push(`📋 Our Directory Listing: ${params.wrhqDirectoryUrl}`)
  }

  if (params.podbeanUrl) {
    lines.push(`🎧 Listen to the Podcast: ${params.podbeanUrl}`)
  }

  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`${params.businessName} provides professional windshield repair and auto glass replacement services in the ${params.city}, ${params.state} area.`)
  lines.push('')
  lines.push('#windshieldrepair #autoglass #windshieldreplacement #' + params.city.toLowerCase().replace(/\s+/g, '') + ' #' + params.state.toLowerCase())

  return lines.join('\n')
}

/**
 * Generate tags for a YouTube video
 */
export function generateVideoTags(params: {
  businessName: string
  city: string
  state: string
  paaQuestion: string
}): string[] {
  const tags: string[] = []

  // Business name variations
  tags.push(params.businessName)
  tags.push(params.businessName.replace(/\s+/g, ''))

  // Location tags
  tags.push(params.city)
  tags.push(params.state)
  tags.push(`${params.city} ${params.state}`)
  tags.push(`windshield repair ${params.city}`)
  tags.push(`auto glass ${params.city}`)

  // Industry tags
  tags.push('windshield repair')
  tags.push('windshield replacement')
  tags.push('auto glass repair')
  tags.push('auto glass replacement')
  tags.push('cracked windshield')
  tags.push('windshield chip repair')
  tags.push('mobile windshield repair')

  // Extract keywords from the PAA question
  const questionWords = params.paaQuestion
    .toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !['what', 'when', 'where', 'which', 'that', 'this', 'with', 'from', 'have', 'your', 'does'].includes(word))

  // Add unique keywords from the question
  const uniqueKeywords = [...new Set(questionWords)].slice(0, 5)
  tags.push(...uniqueKeywords)

  // Ensure tags are under 30 characters each (YouTube limit)
  return tags
    .filter((tag) => tag.length <= 30)
    .slice(0, 40) // YouTube limit of ~500 chars total, so cap at 40 tags
}

/**
 * Test YouTube API connection
 */
export async function testYouTubeConnection(): Promise<{ success: boolean; message: string; channelTitle?: string }> {
  try {
    const channel = await getChannelInfo()
    if (channel) {
      return {
        success: true,
        message: `Connected to YouTube channel: ${channel.title}`,
        channelTitle: channel.title,
      }
    }
    return {
      success: false,
      message: 'Could not retrieve channel information',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
