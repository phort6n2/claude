// Google Business Profile API Integration for Photo Fetching
// Used by the GBP Posting Service to fetch photos from client's GBP profile

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSetting, setSetting } from '@/lib/settings'

// Google Business Profile API endpoints
const GBP_API_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'

// Settings keys for GBP OAuth (app-level, not per-client)
export const GBP_SETTINGS_KEYS = {
  GBP_CLIENT_ID: 'GBP_CLIENT_ID',
  GBP_CLIENT_SECRET: 'GBP_CLIENT_SECRET',
} as const

interface GBPOAuthCredentials {
  clientId: string
  clientSecret: string
}

interface GBPPhoto {
  name: string           // Resource name
  mediaUrl: string       // Full-size URL
  thumbnailUrl?: string  // Thumbnail URL
  category: string       // COVER, PROFILE, LOGO, EXTERIOR, INTERIOR, etc.
  description?: string
  createTime?: string
}

interface GBPLocation {
  name: string          // Resource name (accounts/{accountId}/locations/{locationId})
  title: string         // Business name
  storeCode?: string
  websiteUri?: string
  phoneNumbers?: { primaryPhone: string }
}

interface GBPAccount {
  name: string          // Resource name (accounts/{accountId})
  accountName: string   // Display name
  type: string          // PERSONAL, LOCATION_GROUP, USER_GROUP, ORGANIZATION
}

/**
 * Get GBP OAuth credentials from settings
 */
export async function getGBPOAuthCredentials(): Promise<GBPOAuthCredentials | null> {
  const clientId = process.env.GBP_CLIENT_ID || await getSetting(GBP_SETTINGS_KEYS.GBP_CLIENT_ID)
  const clientSecret = process.env.GBP_CLIENT_SECRET || await getSetting(GBP_SETTINGS_KEYS.GBP_CLIENT_SECRET)

  if (!clientId || !clientSecret) {
    return null
  }

  return { clientId, clientSecret }
}

/**
 * Generate OAuth URL for a client to authorize GBP photo access
 */
export async function getGBPOAuthUrl(clientId: string, redirectUri: string, state: string): Promise<string> {
  const credentials = await getGBPOAuthCredentials()
  if (!credentials) {
    throw new Error('GBP OAuth not configured. Add GBP_CLIENT_ID and GBP_CLIENT_SECRET to settings.')
  }

  // Scopes needed for reading photos from GBP
  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state, // Pass client ID to identify which client is connecting
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const credentials = await getGBPOAuthCredentials()
  if (!credentials) {
    throw new Error('GBP OAuth not configured')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('GBP token exchange failed:', error)
    throw new Error(`Failed to exchange authorization code: ${error}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Refresh access token for a client
 */
export async function refreshAccessToken(clientId: string): Promise<string> {
  const config = await prisma.gBPPostConfig.findUnique({
    where: { clientId },
  })

  if (!config?.googleRefreshToken) {
    throw new Error('No refresh token stored for this client')
  }

  // Check if current token is still valid (with 5 minute buffer)
  if (config.googleAccessToken && config.googleTokenExpiry) {
    const now = new Date()
    const expiry = new Date(config.googleTokenExpiry)
    if (expiry.getTime() > now.getTime() + 5 * 60 * 1000) {
      return config.googleAccessToken
    }
  }

  const credentials = await getGBPOAuthCredentials()
  if (!credentials) {
    throw new Error('GBP OAuth not configured')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: config.googleRefreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('GBP token refresh failed:', error)
    throw new Error(`Failed to refresh token: ${error}`)
  }

  const data = await response.json()
  const newAccessToken = data.access_token
  const expiresIn = data.expires_in || 3600
  const newExpiry = new Date(Date.now() + expiresIn * 1000)

  // Save the new token
  await prisma.gBPPostConfig.update({
    where: { clientId },
    data: {
      googleAccessToken: newAccessToken,
      googleTokenExpiry: newExpiry,
    },
  })

  return newAccessToken
}

/**
 * Store OAuth tokens for a client
 */
export async function storeGBPTokens(
  clientId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000)

  // First get the accounts to store the account ID
  const accounts = await listAccounts(accessToken)
  const accountId = accounts[0]?.name || null

  await prisma.gBPPostConfig.upsert({
    where: { clientId },
    update: {
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      googleTokenExpiry: tokenExpiry,
      googleAccountId: accountId,
    },
    create: {
      clientId,
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      googleTokenExpiry: tokenExpiry,
      googleAccountId: accountId,
    },
  })
}

/**
 * List all GBP accounts for the authenticated user
 */
export async function listAccounts(accessToken: string): Promise<GBPAccount[]> {
  const response = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to list GBP accounts:', error)
    throw new Error(`GBP API error: ${error}`)
  }

  const data = await response.json()
  return (data.accounts || []).map((account: Record<string, unknown>) => ({
    name: account.name as string,
    accountName: account.accountName as string,
    type: account.type as string,
  }))
}

/**
 * List all locations for an account
 */
export async function listLocations(accessToken: string, accountName: string): Promise<GBPLocation[]> {
  const response = await fetch(
    `${GBP_API_BASE}/${accountName}/locations`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to list GBP locations:', error)
    throw new Error(`GBP API error: ${error}`)
  }

  const data = await response.json()
  return (data.locations || []).map((loc: Record<string, unknown>) => ({
    name: loc.name as string,
    title: loc.title as string,
    storeCode: loc.storeCode as string | undefined,
    websiteUri: loc.websiteUri as string | undefined,
    phoneNumbers: loc.phoneNumbers as { primaryPhone: string } | undefined,
  }))
}

/**
 * Fetch photos from a GBP location
 */
export async function fetchLocationPhotos(
  accessToken: string,
  locationName: string
): Promise<GBPPhoto[]> {
  // The media endpoint is: locations/{locationId}/media
  // But we need to use the My Business API v4 for media
  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to fetch GBP photos:', error)
    // Return empty array instead of throwing - some locations may not have photos
    return []
  }

  const data = await response.json()

  return (data.mediaItems || []).map((item: Record<string, unknown>) => ({
    name: item.name as string,
    mediaUrl: item.googleUrl as string || item.sourceUrl as string,
    thumbnailUrl: item.thumbnailUrl as string,
    category: item.mediaFormat as string || item.category as string || 'OTHER',
    description: item.description as string,
    createTime: item.createTime as string,
  }))
}

/**
 * Fetch and cache photos for a client's GBP profile
 */
export async function refreshClientPhotos(clientId: string): Promise<GBPPhoto[]> {
  const config = await prisma.gBPPostConfig.findUnique({
    where: { clientId },
  })

  if (!config?.googleAccountId) {
    throw new Error('Client has not connected their Google account')
  }

  const accessToken = await refreshAccessToken(clientId)

  // Get locations for the account
  const locations = await listLocations(accessToken, config.googleAccountId)

  if (locations.length === 0) {
    console.log('No GBP locations found for client:', clientId)
    return []
  }

  // Fetch photos from all locations
  const allPhotos: GBPPhoto[] = []

  for (const location of locations) {
    try {
      const photos = await fetchLocationPhotos(accessToken, location.name)
      allPhotos.push(...photos)
    } catch (error) {
      console.error(`Failed to fetch photos for location ${location.name}:`, error)
    }
  }

  // Cache the photos in the config (cast to Json type via JSON round-trip)
  await prisma.gBPPostConfig.update({
    where: { clientId },
    data: {
      cachedPhotos: JSON.parse(JSON.stringify(allPhotos)),
      photosLastFetched: new Date(),
    },
  })

  return allPhotos
}

/**
 * Get cached photos for a client (or refresh if stale)
 */
export async function getClientPhotos(
  clientId: string,
  maxAgeHours: number = 24
): Promise<GBPPhoto[]> {
  const config = await prisma.gBPPostConfig.findUnique({
    where: { clientId },
  })

  if (!config) {
    return []
  }

  // Check if cache is fresh enough
  if (config.cachedPhotos && config.photosLastFetched) {
    const cacheAge = Date.now() - config.photosLastFetched.getTime()
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000

    if (cacheAge < maxAgeMs) {
      return config.cachedPhotos as unknown as GBPPhoto[]
    }
  }

  // Cache is stale or missing - refresh if we have OAuth tokens
  if (config.googleRefreshToken) {
    try {
      return await refreshClientPhotos(clientId)
    } catch (error) {
      console.error('Failed to refresh photos:', error)
      // Return stale cache if available
      return (config.cachedPhotos as unknown as GBPPhoto[]) || []
    }
  }

  return []
}

/**
 * Select a random photo from the client's cached photos
 * Optionally filter by category
 */
export async function selectRandomPhoto(
  clientId: string,
  preferredCategories?: string[]
): Promise<GBPPhoto | null> {
  const photos = await getClientPhotos(clientId)

  if (photos.length === 0) {
    return null
  }

  // Filter by preferred categories if specified
  let filteredPhotos = photos
  if (preferredCategories && preferredCategories.length > 0) {
    filteredPhotos = photos.filter(p =>
      preferredCategories.includes(p.category)
    )
    // Fall back to all photos if no matches
    if (filteredPhotos.length === 0) {
      filteredPhotos = photos
    }
  }

  // Select random photo
  const randomIndex = Math.floor(Math.random() * filteredPhotos.length)
  return filteredPhotos[randomIndex]
}

/**
 * Check if a client has connected their Google account
 */
export async function isGBPConnected(clientId: string): Promise<boolean> {
  const config = await prisma.gBPPostConfig.findUnique({
    where: { clientId },
    select: { googleRefreshToken: true },
  })

  return !!config?.googleRefreshToken
}

/**
 * Disconnect a client's Google account
 */
export async function disconnectGBP(clientId: string): Promise<void> {
  await prisma.gBPPostConfig.update({
    where: { clientId },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleAccountId: null,
      cachedPhotos: Prisma.JsonNull,
      photosLastFetched: null,
    },
  })
}

/**
 * Test GBP connection for a client
 */
export async function testGBPConnection(clientId: string): Promise<{
  success: boolean
  message: string
  accountName?: string
  locationCount?: number
  photoCount?: number
}> {
  try {
    const config = await prisma.gBPPostConfig.findUnique({
      where: { clientId },
    })

    if (!config?.googleRefreshToken) {
      return {
        success: false,
        message: 'Google account not connected',
      }
    }

    const accessToken = await refreshAccessToken(clientId)

    // Get accounts
    const accounts = await listAccounts(accessToken)
    if (accounts.length === 0) {
      return {
        success: false,
        message: 'No GBP accounts found for this Google account',
      }
    }

    // Get locations for first account
    const locations = await listLocations(accessToken, accounts[0].name)

    // Get photo count from cache
    const photos = await getClientPhotos(clientId)

    return {
      success: true,
      message: `Connected to ${accounts[0].accountName}`,
      accountName: accounts[0].accountName,
      locationCount: locations.length,
      photoCount: photos.length,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
