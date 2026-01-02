// Podbean API Integration for Podcast Publishing
// API Docs: https://developers.podbean.com/

import { decrypt } from '../encryption'

interface PodbeanCredentials {
  clientId: string
  clientSecret: string // Encrypted
}

interface PodbeanTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface PodbeanEpisode {
  id: string
  title: string
  permalink_url: string
  player_url: string
  logo: string
  status: string
}

interface UploadAuthResponse {
  presigned_url: string
  file_key: string
  expire_at: number
}

interface CreateEpisodeParams {
  title: string
  content: string
  audioFileUrl: string
  status?: 'draft' | 'publish'
  type?: 'public' | 'premium' | 'private'
  logo?: string
  transcriptUrl?: string
}

// Cache token to avoid repeated auth requests
let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Get OAuth2 access token from Podbean
 */
async function getAccessToken(credentials: PodbeanCredentials): Promise<string> {
  // Check cached token
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token
  }

  const clientSecret = decrypt(credentials.clientSecret)
  const basicAuth = Buffer.from(`${credentials.clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://api.podbean.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Podbean auth error: ${error}`)
  }

  const data: PodbeanTokenResponse = await response.json()

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  }

  return data.access_token
}

/**
 * Test Podbean connection
 */
export async function testConnection(credentials: PodbeanCredentials): Promise<boolean> {
  try {
    await getAccessToken(credentials)
    return true
  } catch {
    return false
  }
}

/**
 * Get upload authorization for audio file
 */
async function getUploadAuth(
  credentials: PodbeanCredentials,
  filename: string,
  filesize: number
): Promise<UploadAuthResponse> {
  const token = await getAccessToken(credentials)

  const response = await fetch(
    `https://api.podbean.com/v1/files/uploadAuthorize?` +
    `access_token=${token}&filename=${encodeURIComponent(filename)}&filesize=${filesize}&content_type=audio/mpeg`,
    { method: 'GET' }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Podbean upload auth error: ${error}`)
  }

  return response.json()
}

/**
 * Upload audio file to Podbean
 */
async function uploadAudioFile(
  credentials: PodbeanCredentials,
  audioUrl: string,
  filename: string
): Promise<string> {
  // Fetch the audio file
  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio from ${audioUrl}`)
  }

  const audioBuffer = await audioResponse.arrayBuffer()
  const filesize = audioBuffer.byteLength

  // Get upload authorization
  const uploadAuth = await getUploadAuth(credentials, filename, filesize)

  // Upload to presigned URL
  const uploadResponse = await fetch(uploadAuth.presigned_url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'audio/mpeg',
    },
    body: audioBuffer,
  })

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    throw new Error(`Podbean file upload error: ${error}`)
  }

  return uploadAuth.file_key
}

/**
 * Create a new podcast episode
 */
export async function createEpisode(
  credentials: PodbeanCredentials,
  params: CreateEpisodeParams
): Promise<PodbeanEpisode> {
  const token = await getAccessToken(credentials)

  // Generate filename from title
  const filename = `${params.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.mp3`

  // Upload audio file first
  const fileKey = await uploadAudioFile(credentials, params.audioFileUrl, filename)

  // Create the episode
  const formData = new URLSearchParams({
    access_token: token,
    title: params.title,
    content: params.content,
    status: params.status || 'publish',
    type: params.type || 'public',
    media_key: fileKey,
  })

  if (params.logo) {
    formData.append('logo', params.logo)
  }

  if (params.transcriptUrl) {
    formData.append('transcript_url', params.transcriptUrl)
  }

  const response = await fetch('https://api.podbean.com/v1/episodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Podbean create episode error: ${error}`)
  }

  const data = await response.json()

  return {
    id: data.episode.id,
    title: data.episode.title,
    permalink_url: data.episode.permalink_url,
    player_url: data.episode.player_url,
    logo: data.episode.logo,
    status: data.episode.status,
  }
}

/**
 * Get episode details
 */
export async function getEpisode(
  credentials: PodbeanCredentials,
  episodeId: string
): Promise<PodbeanEpisode> {
  const token = await getAccessToken(credentials)

  const response = await fetch(
    `https://api.podbean.com/v1/episodes/${episodeId}?access_token=${token}`,
    { method: 'GET' }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Podbean get episode error: ${error}`)
  }

  const data = await response.json()

  return {
    id: data.episode.id,
    title: data.episode.title,
    permalink_url: data.episode.permalink_url,
    player_url: data.episode.player_url,
    logo: data.episode.logo,
    status: data.episode.status,
  }
}

/**
 * Update episode status
 */
export async function updateEpisodeStatus(
  credentials: PodbeanCredentials,
  episodeId: string,
  status: 'draft' | 'publish'
): Promise<PodbeanEpisode> {
  const token = await getAccessToken(credentials)

  const response = await fetch(`https://api.podbean.com/v1/episodes/${episodeId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      access_token: token,
      status,
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Podbean update episode error: ${error}`)
  }

  const data = await response.json()

  return {
    id: data.episode.id,
    title: data.episode.title,
    permalink_url: data.episode.permalink_url,
    player_url: data.episode.player_url,
    logo: data.episode.logo,
    status: data.episode.status,
  }
}

/**
 * Get all episodes (paginated)
 */
export async function listEpisodes(
  credentials: PodbeanCredentials,
  limit: number = 20,
  offset: number = 0
): Promise<{ episodes: PodbeanEpisode[]; total: number }> {
  const token = await getAccessToken(credentials)

  const response = await fetch(
    `https://api.podbean.com/v1/episodes?access_token=${token}&limit=${limit}&offset=${offset}`,
    { method: 'GET' }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Podbean list episodes error: ${error}`)
  }

  const data = await response.json()

  return {
    episodes: data.episodes.map((ep: Record<string, unknown>) => ({
      id: ep.id as string,
      title: ep.title as string,
      permalink_url: ep.permalink_url as string,
      player_url: ep.player_url as string,
      logo: ep.logo as string,
      status: ep.status as string,
    })),
    total: data.count,
  }
}

/**
 * High-level publish function used by content pipeline
 * Uses global Podbean credentials from settings
 */
export interface PublishToPodbeanParams {
  title: string
  description: string
  audioUrl: string
  logoUrl?: string
  transcriptUrl?: string
}

export interface PodbeanPublishResult {
  episodeId: string
  url: string
  playerUrl: string
}

/**
 * Get global Podbean credentials from settings
 */
async function getGlobalPodbeanCredentials(): Promise<PodbeanCredentials> {
  // Dynamic import to avoid circular dependencies
  const { prisma } = await import('@/lib/db')
  const { decrypt } = await import('@/lib/encryption')

  const clientIdSetting = await prisma.setting.findUnique({ where: { key: 'PODBEAN_CLIENT_ID' } })
  const clientSecretSetting = await prisma.setting.findUnique({ where: { key: 'PODBEAN_CLIENT_SECRET' } })

  if (!clientIdSetting || !clientSecretSetting) {
    throw new Error('Podbean credentials not configured in settings')
  }

  const clientId = clientIdSetting.encrypted ? decrypt(clientIdSetting.value) : clientIdSetting.value
  const clientSecret = clientSecretSetting.encrypted ? decrypt(clientSecretSetting.value) : clientSecretSetting.value

  // Handle case where decryption fails
  if (!clientId || !clientSecret) {
    throw new Error('Podbean credentials could not be decrypted. Please re-save them in Settings.')
  }

  return { clientId, clientSecret }
}

export async function publishToPodbean(params: PublishToPodbeanParams): Promise<PodbeanPublishResult> {
  const credentials = await getGlobalPodbeanCredentials()

  const episode = await createEpisode(credentials, {
    title: params.title,
    content: params.description,
    audioFileUrl: params.audioUrl,
    status: 'publish',
    type: 'public',
    logo: params.logoUrl,
    transcriptUrl: params.transcriptUrl,
  })

  return {
    episodeId: episode.id,
    url: episode.permalink_url,
    playerUrl: episode.player_url,
  }
}
