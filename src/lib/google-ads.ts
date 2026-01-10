import crypto from 'crypto'
import { prisma } from './db'
import { encrypt, decrypt } from './encryption'

const GOOGLE_ADS_API_VERSION = 'v18'
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

// OAuth endpoints
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

// Extended type for GoogleAdsConfig with new OAuth fields
interface GoogleAdsConfigExtended {
  id: string
  mccCustomerId: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpiry: Date | null
  developerToken: string | null
  oauthClientId?: string | null
  oauthClientSecret?: string | null
  isConnected: boolean
  lastSyncAt: Date | null
  lastError: string | null
}

/**
 * Get Google Ads API credentials from database
 */
export async function getGoogleAdsCredentials() {
  // Get MCC config from database
  const config = await prisma.googleAdsConfig.findFirst() as GoogleAdsConfigExtended | null

  if (!config?.isConnected) {
    return null
  }

  return {
    mccCustomerId: config.mccCustomerId,
    accessToken: config.accessToken ? decrypt(config.accessToken) : null,
    refreshToken: config.refreshToken ? decrypt(config.refreshToken) : null,
    tokenExpiry: config.tokenExpiry,
    developerToken: config.developerToken ? decrypt(config.developerToken) : null,
    oauthClientId: config.oauthClientId ? decrypt(config.oauthClientId) : null,
    oauthClientSecret: config.oauthClientSecret ? decrypt(config.oauthClientSecret) : null,
  }
}

/**
 * Get OAuth credentials from database (for use before connection is established)
 */
export async function getOAuthCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const config = await prisma.googleAdsConfig.findFirst() as GoogleAdsConfigExtended | null

  if (!config?.oauthClientId || !config?.oauthClientSecret) {
    return null
  }

  const clientId = decrypt(config.oauthClientId)
  const clientSecret = decrypt(config.oauthClientSecret)

  // If decryption failed, return null
  if (!clientId || !clientSecret) {
    return null
  }

  return { clientId, clientSecret }
}

/**
 * Generate OAuth URL for Google Ads authorization
 */
export async function getGoogleAdsAuthUrl(state: string) {
  const oauthCreds = await getOAuthCredentials()
  if (!oauthCreds) {
    throw new Error('OAuth Client ID and Secret must be configured first')
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-ads/callback`

  const params = new URLSearchParams({
    client_id: oauthCreds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string) {
  const oauthCreds = await getOAuthCredentials()
  if (!oauthCreds) {
    throw new Error('OAuth credentials not configured')
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-ads/callback`

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: oauthCreds.clientId,
      client_secret: oauthCreds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return response.json()
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const oauthCreds = await getOAuthCredentials()
  if (!oauthCreds) {
    throw new Error('OAuth credentials not configured')
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: oauthCreds.clientId,
      client_secret: oauthCreds.clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  const creds = await getGoogleAdsCredentials()
  if (!creds?.accessToken || !creds?.refreshToken) return null

  // Check if token is expired (with 5 minute buffer)
  const now = new Date()
  const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000)

  if (creds.tokenExpiry && creds.tokenExpiry > expiryBuffer) {
    return creds.accessToken
  }

  // Refresh the token
  try {
    const newAccessToken = await refreshAccessToken(creds.refreshToken)

    // Update in database
    await prisma.googleAdsConfig.updateMany({
      data: {
        accessToken: encrypt(newAccessToken),
        tokenExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
      },
    })

    return newAccessToken
  } catch (error) {
    console.error('Failed to refresh Google Ads token:', error)
    return null
  }
}

/**
 * Hash user data for Enhanced Conversions (SHA-256, lowercase, trimmed)
 */
export function hashUserData(value: string): string {
  const normalized = value.toLowerCase().trim()
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/**
 * Format phone number for Enhanced Conversions (E.164 format)
 */
export function formatPhoneE164(phone: string, countryCode = '1'): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')

  // Add country code if not present
  if (digits.length === 10) {
    return `+${countryCode}${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  return `+${digits}`
}

/**
 * Send Enhanced Conversion for a lead
 * This sends hashed email/phone to Google Ads when a lead is captured
 */
export async function sendEnhancedConversion(params: {
  customerId: string
  gclid: string
  email?: string
  phone?: string
  conversionAction: string
  conversionDateTime: Date
  conversionValue?: number
  currencyCode?: string
}): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getValidAccessToken()
  const creds = await getGoogleAdsCredentials()

  if (!accessToken || !creds?.developerToken || !creds?.mccCustomerId) {
    return { success: false, error: 'Google Ads not configured' }
  }

  // Build user identifiers
  const userIdentifiers: Array<{ hashedEmail?: string; hashedPhoneNumber?: string }> = []

  if (params.email) {
    userIdentifiers.push({ hashedEmail: hashUserData(params.email) })
  }

  if (params.phone) {
    const e164Phone = formatPhoneE164(params.phone)
    userIdentifiers.push({ hashedPhoneNumber: hashUserData(e164Phone) })
  }

  if (userIdentifiers.length === 0) {
    return { success: false, error: 'No email or phone provided' }
  }

  // Format customer ID (remove dashes)
  const customerId = params.customerId.replace(/-/g, '')

  // Build the conversion adjustment
  const conversionAdjustment = {
    adjustmentType: 'ENHANCEMENT',
    conversionAction: `customers/${customerId}/conversionActions/${params.conversionAction}`,
    gclidDateTimePair: {
      gclid: params.gclid,
      conversionDateTime: params.conversionDateTime.toISOString().replace('Z', '+00:00'),
    },
    userIdentifiers: userIdentifiers.map((id) => {
      if (id.hashedEmail) {
        return { userIdentifierSource: 'FIRST_PARTY', hashedEmail: id.hashedEmail }
      }
      return { userIdentifierSource: 'FIRST_PARTY', hashedPhoneNumber: id.hashedPhoneNumber }
    }),
  }

  try {
    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}/conversionAdjustments:upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': creds.developerToken,
          'login-customer-id': creds.mccCustomerId.replace(/-/g, ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversionAdjustments: [conversionAdjustment],
          partialFailure: true,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('Enhanced conversion upload failed:', error)
      return { success: false, error: `API error: ${response.status}` }
    }

    const result = await response.json()

    // Check for partial failures
    if (result.partialFailureError) {
      console.warn('Enhanced conversion partial failure:', result.partialFailureError)
      return { success: false, error: result.partialFailureError.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Enhanced conversion error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send Offline Conversion Import for a sale
 * This sends sale data back to Google Ads when a lead converts to a sale
 */
export async function sendOfflineConversion(params: {
  customerId: string
  gclid: string
  conversionAction: string
  conversionDateTime: Date
  conversionValue: number
  currencyCode?: string
}): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getValidAccessToken()
  const creds = await getGoogleAdsCredentials()

  if (!accessToken || !creds?.developerToken || !creds?.mccCustomerId) {
    return { success: false, error: 'Google Ads not configured' }
  }

  // Format customer ID (remove dashes)
  const customerId = params.customerId.replace(/-/g, '')

  // Build the click conversion
  const clickConversion = {
    gclid: params.gclid,
    conversionAction: `customers/${customerId}/conversionActions/${params.conversionAction}`,
    conversionDateTime: params.conversionDateTime.toISOString().replace('Z', '+00:00'),
    conversionValue: params.conversionValue,
    currencyCode: params.currencyCode || 'USD',
  }

  try {
    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${customerId}:uploadClickConversions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': creds.developerToken,
          'login-customer-id': creds.mccCustomerId.replace(/-/g, ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversions: [clickConversion],
          partialFailure: true,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('Offline conversion upload failed:', error)
      return { success: false, error: `API error: ${response.status}` }
    }

    const result = await response.json()

    // Check for partial failures
    if (result.partialFailureError) {
      console.warn('Offline conversion partial failure:', result.partialFailureError)
      return { success: false, error: result.partialFailureError.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Offline conversion error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * List accessible customers under the MCC
 */
export async function listAccessibleCustomers(): Promise<{
  success: boolean
  customers?: Array<{ customerId: string; descriptiveName: string }>
  error?: string
}> {
  const accessToken = await getValidAccessToken()
  const creds = await getGoogleAdsCredentials()

  if (!accessToken || !creds?.developerToken) {
    return { success: false, error: 'Google Ads not configured' }
  }

  try {
    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': creds.developerToken,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `API error: ${response.status} - ${error}` }
    }

    const data = await response.json()

    // Get details for each customer
    const customers: Array<{ customerId: string; descriptiveName: string }> = []

    for (const resourceName of data.resourceNames || []) {
      const customerId = resourceName.split('/')[1]
      customers.push({
        customerId: formatCustomerId(customerId),
        descriptiveName: `Account ${formatCustomerId(customerId)}`,
      })
    }

    return { success: true, customers }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * List conversion actions for a customer
 */
export async function listConversionActions(customerId: string): Promise<{
  success: boolean
  actions?: Array<{ id: string; name: string; category: string }>
  error?: string
}> {
  const accessToken = await getValidAccessToken()
  const creds = await getGoogleAdsCredentials()

  if (!accessToken || !creds?.developerToken || !creds?.mccCustomerId) {
    return { success: false, error: 'Google Ads not configured' }
  }

  const cleanCustomerId = customerId.replace(/-/g, '')

  try {
    const query = `
      SELECT
        conversion_action.id,
        conversion_action.name,
        conversion_action.category,
        conversion_action.status
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `

    const response = await fetch(
      `${GOOGLE_ADS_API_BASE}/customers/${cleanCustomerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': creds.developerToken,
          'login-customer-id': creds.mccCustomerId.replace(/-/g, ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `API error: ${response.status} - ${error}` }
    }

    const data = await response.json()
    const actions: Array<{ id: string; name: string; category: string }> = []

    for (const batch of data || []) {
      for (const result of batch.results || []) {
        const action = result.conversionAction
        actions.push({
          id: action.id,
          name: action.name,
          category: action.category,
        })
      }
    }

    return { success: true, actions }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Format customer ID with dashes (xxx-xxx-xxxx)
 */
function formatCustomerId(id: string): string {
  const clean = id.replace(/-/g, '')
  if (clean.length !== 10) return id
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`
}
