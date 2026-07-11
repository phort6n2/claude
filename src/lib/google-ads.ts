import crypto from 'crypto'
import { prisma } from './db'
import { encrypt, decrypt } from './encryption'

export const GOOGLE_ADS_API_VERSION = 'v23'
export const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

// OAuth endpoints
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

// Retry configuration for the conversion upload calls. Google Ads' upload
// endpoints occasionally return transient 5xx errors during regional incidents
// or capacity blips; the existing sync-enhanced-conversions cron will eventually
// retry but in-band recovery cuts most failures down to a few seconds.
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504])

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options)

      // Return immediately for non-retryable status codes (success or 4xx) and
      // also for the final attempt — caller decides what to do with that body.
      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
        return response
      }

      console.warn(
        `[${context}] Retryable ${response.status}, attempt ${attempt + 1}/${MAX_RETRIES}`
      )
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === MAX_RETRIES) {
        throw lastError
      }
      console.warn(
        `[${context}] Network error attempt ${attempt + 1}/${MAX_RETRIES}:`,
        lastError.message
      )
    }

    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
    await new Promise((resolve) => setTimeout(resolve, backoff))
  }

  throw lastError ?? new Error('fetchWithRetry exhausted all retries')
}

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
 * Route click identifiers into their correct Google Ads API field.
 *
 * Google rejects an upload with "gclid could not be decoded" when a
 * gbraid/wbraid value — the identifiers used for iOS/privacy traffic — is placed
 * in the `gclid` field. Real gclids always begin with a letter (e.g. "Cj0K",
 * "EAIa"); gbraid/wbraid values begin with a digit (observed "0AAAA…"). This
 * normalizer keeps real gclids as `gclid`, honors explicit gbraid/wbraid, and
 * reroutes a misfiled iOS identifier so the click still attributes instead of
 * being rejected. Only one identifier is returned, in priority order, because a
 * ClickConversion accepts a single click id.
 */
export function resolveClickIds(input: {
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
}): { gclid?: string; gbraid?: string; wbraid?: string } {
  const gclid = input.gclid?.trim() || undefined
  const gbraid = input.gbraid?.trim() || undefined
  const wbraid = input.wbraid?.trim() || undefined

  // A real gclid starts with a letter. Anything else in the gclid slot is a
  // misfiled iOS identifier.
  const gclidIsReal = !!gclid && /^[A-Za-z]/.test(gclid)

  if (gclidIsReal) return { gclid }
  if (gbraid) return { gbraid }
  if (wbraid) return { wbraid }

  // Misfiled iOS id with no explicit gbraid/wbraid column. For web-form lead-gen
  // this is a gbraid (web-to-web); route it there rather than sending a value
  // Google will reject as an undecodable gclid.
  if (gclid) return { gbraid: gclid }

  return {}
}

/**
 * Apply a resolved click identifier onto a ClickConversion payload. No-op when
 * there is no usable identifier (enhanced conversions can still match on hashed
 * email/phone alone).
 */
function applyClickId(
  target: Record<string, unknown>,
  ids: { gclid?: string; gbraid?: string; wbraid?: string }
): void {
  if (ids.gclid) target.gclid = ids.gclid
  else if (ids.gbraid) target.gbraid = ids.gbraid
  else if (ids.wbraid) target.wbraid = ids.wbraid
}

/**
 * Send Enhanced Conversion for a lead
 * This sends hashed email/phone to Google Ads via uploadClickConversions
 * (Enhanced Conversions for Leads - uses click conversions with user identifiers)
 *
 * Note: GCLID is optional. Google can still match conversions using hashed
 * email/phone data even without a click ID, providing better measurement coverage.
 */
export async function sendEnhancedConversion(params: {
  customerId: string
  gclid?: string | null // Optional - conversions can be matched via user identifiers alone
  gbraid?: string | null // iOS web-to-web click id
  wbraid?: string | null // iOS web-to-app click id
  email?: string
  phone?: string
  conversionAction: string
  conversionDateTime: Date
  conversionValue?: number
  currencyCode?: string
  orderId: string // Required unique identifier (e.g., lead ID)
}): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getValidAccessToken()
  const creds = await getGoogleAdsCredentials()

  if (!accessToken || !creds?.developerToken || !creds?.mccCustomerId) {
    return { success: false, error: 'Google Ads not configured' }
  }

  // Build user identifiers (hashed email/phone for enhanced matching)
  const userIdentifiers: Array<Record<string, string>> = []

  if (params.email) {
    userIdentifiers.push({
      userIdentifierSource: 'FIRST_PARTY',
      hashedEmail: hashUserData(params.email),
    })
  }

  if (params.phone) {
    const e164Phone = formatPhoneE164(params.phone)
    userIdentifiers.push({
      userIdentifierSource: 'FIRST_PARTY',
      hashedPhoneNumber: hashUserData(e164Phone),
    })
  }

  if (userIdentifiers.length === 0) {
    return { success: false, error: 'No email or phone provided' }
  }

  // Format customer ID (remove dashes)
  const customerId = params.customerId.replace(/-/g, '')

  // Format datetime as yyyy-mm-dd hh:mm:ss+|-hh:mm (Google Ads required format)
  const formatGoogleAdsDateTime = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const year = date.getUTCFullYear()
    const month = pad(date.getUTCMonth() + 1)
    const day = pad(date.getUTCDate())
    const hours = pad(date.getUTCHours())
    const minutes = pad(date.getUTCMinutes())
    const seconds = pad(date.getUTCSeconds())
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}+00:00`
  }

  // Build the click conversion with user identifiers (Enhanced Conversions for Leads)
  // A click id is optional - Google can match via user identifiers alone
  const clickConversion: Record<string, unknown> = {
    conversionAction: `customers/${customerId}/conversionActions/${params.conversionAction}`,
    conversionDateTime: formatGoogleAdsDateTime(params.conversionDateTime),
    orderId: params.orderId,
    userIdentifiers,
  }

  // Attach the click id in its correct field (gclid vs gbraid/wbraid). Misfiled
  // iOS identifiers are rerouted so Google doesn't reject the whole upload.
  applyClickId(
    clickConversion,
    resolveClickIds({ gclid: params.gclid, gbraid: params.gbraid, wbraid: params.wbraid })
  )

  try {
    const url = `${GOOGLE_ADS_API_BASE}/customers/${customerId}:uploadClickConversions`
    const requestBody = {
      conversions: [clickConversion],
      partialFailure: true,
    }

    console.log('[Enhanced Conversion] Sending request:', {
      url,
      customerId,
      conversionAction: params.conversionAction,
      hasEmail: !!params.email,
      hasPhone: !!params.phone,
      hasGclid: !!params.gclid,
      gclid: params.gclid ? params.gclid.substring(0, 20) + '...' : 'none',
    })

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': creds.developerToken,
          'login-customer-id': creds.mccCustomerId.replace(/-/g, ''),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      'Enhanced Conversion'
    )

    const responseText = await response.text()

    if (!response.ok) {
      console.error('[Enhanced Conversion] Upload failed:', {
        status: response.status,
        statusText: response.statusText,
        response: responseText.substring(0, 1000),
        url,
        customerId,
        conversionAction: params.conversionAction,
      })

      // Try to parse error for more details
      let errorDetail = `API error: ${response.status}`
      try {
        const errorJson = JSON.parse(responseText)
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message
        } else if (errorJson.error?.details) {
          errorDetail = JSON.stringify(errorJson.error.details)
        }
      } catch {
        // Response wasn't JSON, might be HTML error page
        if (responseText.includes('<!DOCTYPE')) {
          errorDetail = `API error: ${response.status} - HTML error page returned (API endpoint may not be available)`
        }
      }

      return { success: false, error: errorDetail }
    }

    // Parse successful response
    let result
    try {
      result = responseText ? JSON.parse(responseText) : {}
    } catch {
      console.log('[Enhanced Conversion] Empty or non-JSON response, treating as success')
      result = {}
    }

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
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
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

  // Format datetime as yyyy-mm-dd hh:mm:ss+|-hh:mm (Google Ads required format)
  const formatGoogleAdsDateTime = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const year = date.getUTCFullYear()
    const month = pad(date.getUTCMonth() + 1)
    const day = pad(date.getUTCDate())
    const hours = pad(date.getUTCHours())
    const minutes = pad(date.getUTCMinutes())
    const seconds = pad(date.getUTCSeconds())
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}+00:00`
  }

  // An offline (sale) conversion has no user identifiers, so it MUST carry a
  // click id to attribute. Route it to the correct field; bail out cleanly if
  // there's nothing usable rather than sending a value Google will reject.
  const ids = resolveClickIds({
    gclid: params.gclid,
    gbraid: params.gbraid,
    wbraid: params.wbraid,
  })
  if (!ids.gclid && !ids.gbraid && !ids.wbraid) {
    return {
      success: false,
      error: 'No usable click id (gclid/gbraid/wbraid) to attribute this offline conversion',
    }
  }

  // Build the click conversion
  const clickConversion: Record<string, unknown> = {
    conversionAction: `customers/${customerId}/conversionActions/${params.conversionAction}`,
    conversionDateTime: formatGoogleAdsDateTime(params.conversionDateTime),
    conversionValue: params.conversionValue,
    currencyCode: params.currencyCode || 'USD',
  }
  applyClickId(clickConversion, ids)

  try {
    const response = await fetchWithRetry(
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
      },
      'Offline Conversion'
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('[Offline Conversion] Upload failed:', {
        status: response.status,
        response: error.substring(0, 1000),
        customerId,
        conversionAction: params.conversionAction,
      })
      return {
        success: false,
        error: `API error ${response.status}: ${error.substring(0, 200)}`,
      }
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

  const url = `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`

  console.log('[Google Ads] listAccessibleCustomers request:', {
    url,
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken?.length,
    developerTokenFirstChars: creds.developerToken?.substring(0, 4) + '...',
    developerTokenLength: creds.developerToken?.length,
  })

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
      },
    })

    console.log('[Google Ads] listAccessibleCustomers response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    })

    if (!response.ok) {
      const error = await response.text()
      const isHtmlError = error.includes('<!DOCTYPE') || error.includes('<html')
      console.error('[Google Ads] listAccessibleCustomers error:', {
        status: response.status,
        isHtmlError,
        errorPreview: error.substring(0, 300),
      })
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

  console.log('[Google Ads] listConversionActions called:', {
    customerId,
    hasAccessToken: !!accessToken,
    hasDeveloperToken: !!creds?.developerToken,
    mccCustomerId: creds?.mccCustomerId,
  })

  if (!accessToken) {
    return { success: false, error: 'Google Ads not connected - no access token' }
  }
  if (!creds?.developerToken) {
    return { success: false, error: 'Google Ads not configured - missing developer token' }
  }
  if (!creds?.mccCustomerId) {
    return { success: false, error: 'Google Ads not configured - missing MCC customer ID' }
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

    console.log('[Google Ads] Fetching conversion actions for customer:', cleanCustomerId)

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
      const errorText = await response.text()
      console.error('[Google Ads] API error fetching conversion actions:', {
        status: response.status,
        error: errorText,
        customerId: cleanCustomerId,
      })
      return { success: false, error: `API error ${response.status}: ${errorText}` }
    }

    // Handle potentially empty response
    const responseText = await response.text()
    if (!responseText || responseText.trim() === '') {
      console.log('[Google Ads] Empty response from API, returning empty actions list')
      return { success: true, actions: [] }
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[Google Ads] Failed to parse response:', {
        responseText: responseText.substring(0, 500),
        error: parseError,
      })
      return { success: false, error: 'Invalid JSON response from Google Ads API' }
    }

    const actions: Array<{ id: string; name: string; category: string }> = []

    for (const batch of data || []) {
      for (const result of batch.results || []) {
        const action = result.conversionAction
        if (action) {
          actions.push({
            id: String(action.id),
            name: String(action.name || 'Unknown'),
            category: String(action.category || 'UNKNOWN'),
          })
        }
      }
    }

    console.log('[Google Ads] Found conversion actions:', actions.length)
    return { success: true, actions }
  } catch (error) {
    console.error('[Google Ads] Exception fetching conversion actions:', error)
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

/**
 * Execute a GAQL query against a customer account
 */
async function searchStreamQuery(
  customerId: string,
  query: string
): Promise<{ success: boolean; results?: unknown[]; error?: string }> {
  const accessToken = await getValidAccessToken()
  const creds = await getGoogleAdsCredentials()

  if (!accessToken || !creds?.developerToken || !creds?.mccCustomerId) {
    return { success: false, error: 'Google Ads not configured' }
  }

  const cleanCustomerId = customerId.replace(/-/g, '')
  const cleanMccId = creds.mccCustomerId.replace(/-/g, '')
  const url = `${GOOGLE_ADS_API_BASE}/customers/${cleanCustomerId}/googleAds:searchStream`

  console.log('[Google Ads] searchStreamQuery:', {
    url,
    customerId: cleanCustomerId,
    mccCustomerId: cleanMccId,
    hasDeveloperToken: !!creds.developerToken,
    developerTokenLength: creds.developerToken?.length,
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'login-customer-id': cleanMccId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      const error = await response.text()
      const isHtmlError = error.includes('<!DOCTYPE') || error.includes('<html')

      console.error('[Google Ads] API Error:', {
        status: response.status,
        isHtmlError,
        customerId: cleanCustomerId,
        mccCustomerId: cleanMccId,
        // Don't log full HTML, just first 200 chars
        errorPreview: error.substring(0, 200),
      })

      // Provide more helpful error messages for common issues
      if (response.status === 404 && isHtmlError) {
        return {
          success: false,
          error: `API error: 404 - Customer ${cleanCustomerId} not accessible. Check: 1) Developer token has production access, 2) MCC ${cleanMccId} manages this customer, 3) OAuth has correct permissions.`
        }
      }

      return { success: false, error: `API error: ${response.status} - ${error.substring(0, 500)}` }
    }

    const data = await response.json()
    const results: unknown[] = []

    for (const batch of data || []) {
      for (const result of batch.results || []) {
        results.push(result)
      }
    }

    return { success: true, results }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get account-level metrics for a date range
 */
export async function getAccountMetrics(
  customerId: string,
  dateRange: 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_7_DAYS' | 'LAST_30_DAYS' = 'TODAY'
): Promise<{
  success: boolean
  metrics?: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    costPerConversion: number
    conversionValue: number
    ctr: number
    avgCpc: number
  }
  error?: string
}> {
  // Build the date filter based on the range
  // Use America/Denver timezone for date calculations
  let dateFilter = ''

  // Get current date in Mountain Time
  const now = new Date()
  const mountainTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }))
  const today = new Date(mountainTime.getFullYear(), mountainTime.getMonth(), mountainTime.getDate())

  const formatDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }

  switch (dateRange) {
    case 'TODAY':
      dateFilter = `segments.date = '${formatDate(today)}'`
      break
    case 'YESTERDAY': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      dateFilter = `segments.date = '${formatDate(yesterday)}'`
      break
    }
    case 'THIS_WEEK': {
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      dateFilter = `segments.date BETWEEN '${formatDate(weekStart)}' AND '${formatDate(today)}'`
      break
    }
    case 'THIS_MONTH': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      dateFilter = `segments.date BETWEEN '${formatDate(monthStart)}' AND '${formatDate(today)}'`
      break
    }
    case 'LAST_7_DAYS': {
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      dateFilter = `segments.date BETWEEN '${formatDate(sevenDaysAgo)}' AND '${formatDate(today)}'`
      break
    }
    case 'LAST_30_DAYS': {
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = `segments.date BETWEEN '${formatDate(thirtyDaysAgo)}' AND '${formatDate(today)}'`
      break
    }
  }

  const query = `
    SELECT
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM customer
    WHERE ${dateFilter}
  `

  const result = await searchStreamQuery(customerId, query)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // Aggregate the results (there may be multiple rows if querying a range)
  let impressions = 0
  let clicks = 0
  let costMicros = 0
  let conversions = 0
  let conversionValue = 0

  for (const row of result.results || []) {
    const metrics = (row as { metrics?: Record<string, number> }).metrics || {}
    impressions += Number(metrics.impressions || 0)
    clicks += Number(metrics.clicks || 0)
    costMicros += Number(metrics.cost_micros || metrics.costMicros || 0)
    conversions += Number(metrics.conversions || 0)
    conversionValue += Number(metrics.conversions_value || metrics.conversionsValue || 0)
  }

  const cost = costMicros / 1_000_000 // Convert micros to dollars
  const costPerConversion = conversions > 0 ? cost / conversions : 0
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
  const avgCpc = clicks > 0 ? cost / clicks : 0

  return {
    success: true,
    metrics: {
      impressions,
      clicks,
      cost,
      conversions,
      costPerConversion,
      conversionValue,
      ctr,
      avgCpc,
    },
  }
}

/**
 * Get campaign-level metrics for a customer
 */
export async function getCampaignMetrics(
  customerId: string,
  dateRange: 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' = 'LAST_7_DAYS'
): Promise<{
  success: boolean
  campaigns?: Array<{
    id: string
    name: string
    status: string
    impressions: number
    clicks: number
    cost: number
    conversions: number
    ctr: number
  }>
  error?: string
}> {
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')

  let dateFilter = ''
  switch (dateRange) {
    case 'TODAY':
      dateFilter = `segments.date = '${formatDate(today)}'`
      break
    case 'YESTERDAY': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      dateFilter = `segments.date = '${formatDate(yesterday)}'`
      break
    }
    case 'LAST_7_DAYS': {
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      dateFilter = `segments.date BETWEEN '${formatDate(sevenDaysAgo)}' AND '${formatDate(today)}'`
      break
    }
    case 'LAST_30_DAYS': {
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = `segments.date BETWEEN '${formatDate(thirtyDaysAgo)}' AND '${formatDate(today)}'`
      break
    }
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND ${dateFilter}
    ORDER BY metrics.cost_micros DESC
    LIMIT 20
  `

  const result = await searchStreamQuery(customerId, query)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // Aggregate by campaign (since we might have multiple date rows per campaign)
  const campaignMap = new Map<string, {
    id: string
    name: string
    status: string
    impressions: number
    clicks: number
    costMicros: number
    conversions: number
  }>()

  for (const row of result.results || []) {
    const r = row as { campaign?: Record<string, string>; metrics?: Record<string, number> }
    const campaign = r.campaign || {}
    const metrics = r.metrics || {}

    const id = String(campaign.id)
    const existing = campaignMap.get(id)

    if (existing) {
      existing.impressions += Number(metrics.impressions || 0)
      existing.clicks += Number(metrics.clicks || 0)
      existing.costMicros += Number(metrics.cost_micros || metrics.costMicros || 0)
      existing.conversions += Number(metrics.conversions || 0)
    } else {
      campaignMap.set(id, {
        id,
        name: String(campaign.name || 'Unknown'),
        status: String(campaign.status || 'UNKNOWN'),
        impressions: Number(metrics.impressions || 0),
        clicks: Number(metrics.clicks || 0),
        costMicros: Number(metrics.cost_micros || metrics.costMicros || 0),
        conversions: Number(metrics.conversions || 0),
      })
    }
  }

  const campaigns = Array.from(campaignMap.values())
    .map((c) => ({
      ...c,
      cost: c.costMicros / 1_000_000,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost)

  return { success: true, campaigns }
}

/**
 * Get customer account details (name, currency, etc.)
 */
export async function getCustomerDetails(customerId: string): Promise<{
  success: boolean
  details?: {
    id: string
    descriptiveName: string
    currencyCode: string
    timeZone: string
  }
  error?: string
}> {
  const query = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone
    FROM customer
    LIMIT 1
  `

  const result = await searchStreamQuery(customerId, query)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const row = result.results?.[0] as { customer?: Record<string, string> } | undefined
  if (!row?.customer) {
    return { success: false, error: 'No customer data returned' }
  }

  return {
    success: true,
    details: {
      id: formatCustomerId(String(row.customer.id)),
      descriptiveName: String(row.customer.descriptive_name || row.customer.descriptiveName || 'Unknown'),
      currencyCode: String(row.customer.currency_code || row.customer.currencyCode || 'USD'),
      timeZone: String(row.customer.time_zone || row.customer.timeZone || 'America/Los_Angeles'),
    },
  }
}

/**
 * Get conversion actions with their value/counting settings. Used by the
 * account-hygiene audit to verify that a client's sale conversion action
 * actually tracks value (a prerequisite for value-based Smart Bidding).
 */
export async function getConversionActionSettings(customerId: string): Promise<{
  success: boolean
  actions?: Array<{
    id: string
    name: string
    category: string
    status: string
    type: string
    countingType: string
    includeInConversionsMetric: boolean
    defaultValue: number
    alwaysUseDefaultValue: boolean
  }>
  error?: string
}> {
  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.category,
      conversion_action.status,
      conversion_action.type,
      conversion_action.counting_type,
      conversion_action.include_in_conversions_metric,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value
    FROM conversion_action
  `

  const result = await searchStreamQuery(customerId, query)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  const actions = (result.results || []).map((row) => {
    const ca =
      (row as { conversionAction?: Record<string, unknown> }).conversionAction || {}
    const vs = (ca.valueSettings || ca.value_settings || {}) as Record<string, unknown>
    return {
      id: String(ca.id ?? ''),
      name: String(ca.name ?? 'Unknown'),
      category: String(ca.category ?? 'UNKNOWN'),
      status: String(ca.status ?? 'UNKNOWN'),
      type: String(ca.type ?? 'UNKNOWN'),
      countingType: String(ca.countingType ?? ca.counting_type ?? 'UNKNOWN'),
      includeInConversionsMetric: Boolean(
        ca.includeInConversionsMetric ?? ca.include_in_conversions_metric ?? false
      ),
      defaultValue: Number(vs.defaultValue ?? vs.default_value ?? 0),
      alwaysUseDefaultValue: Boolean(
        vs.alwaysUseDefaultValue ?? vs.always_use_default_value ?? false
      ),
    }
  })

  return { success: true, actions }
}

/**
 * List Customer Match (CRM-based) audience lists for a customer, with their
 * approximate sizes. Used by the audit to flag clients that haven't set up
 * Customer Match — a lever the Google rep specifically recommended.
 */
export async function listCustomerMatchLists(customerId: string): Promise<{
  success: boolean
  lists?: Array<{
    id: string
    name: string
    sizeForSearch: number
    membershipStatus: string
  }>
  error?: string
}> {
  const query = `
    SELECT
      user_list.id,
      user_list.name,
      user_list.type,
      user_list.size_for_search,
      user_list.membership_status
    FROM user_list
    WHERE user_list.type = 'CRM_BASED'
  `

  const result = await searchStreamQuery(customerId, query)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  const lists = (result.results || []).map((row) => {
    const ul = (row as { userList?: Record<string, unknown> }).userList || {}
    return {
      id: String(ul.id ?? ''),
      name: String(ul.name ?? 'Unknown'),
      sizeForSearch: Number(ul.sizeForSearch ?? ul.size_for_search ?? 0),
      membershipStatus: String(ul.membershipStatus ?? ul.membership_status ?? 'UNKNOWN'),
    }
  })

  return { success: true, lists }
}

/**
 * Search-terms report (last 30 days) — the actual queries that triggered ads,
 * with spend and conversions. Used to surface wasted spend and irrelevant
 * traffic as negative-keyword suggestions.
 */
export async function getSearchTermsReport(customerId: string): Promise<{
  success: boolean
  terms?: Array<{
    term: string
    campaignId: string
    campaignName: string
    adGroupName: string
    clicks: number
    cost: number
    conversions: number
    conversionsValue: number
  }>
  error?: string
}> {
  const query = `
    SELECT
      search_term_view.search_term,
      campaign.id,
      campaign.name,
      ad_group.name,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `

  const result = await searchStreamQuery(customerId, query)
  if (!result.success) return { success: false, error: result.error }

  // A term can appear across multiple ad groups/days; aggregate by term text.
  const map = new Map<
    string,
    {
      term: string
      campaignId: string
      campaignName: string
      adGroupName: string
      clicks: number
      cost: number
      conversions: number
      conversionsValue: number
    }
  >()

  for (const row of result.results || []) {
    const r = row as {
      searchTermView?: Record<string, unknown>
      campaign?: Record<string, unknown>
      adGroup?: Record<string, unknown>
      metrics?: Record<string, number>
    }
    const term = String(r.searchTermView?.searchTerm ?? r.searchTermView?.search_term ?? '')
    if (!term) continue
    const m = r.metrics || {}
    const cost = Number(m.cost_micros ?? m.costMicros ?? 0) / 1_000_000
    const existing = map.get(term)
    if (existing) {
      existing.clicks += Number(m.clicks || 0)
      existing.cost += cost
      existing.conversions += Number(m.conversions || 0)
      existing.conversionsValue += Number(m.conversions_value ?? m.conversionsValue ?? 0)
    } else {
      map.set(term, {
        term,
        campaignId: String(r.campaign?.id ?? ''),
        campaignName: String(r.campaign?.name ?? 'Unknown'),
        adGroupName: String(r.adGroup?.name ?? 'Unknown'),
        clicks: Number(m.clicks || 0),
        cost,
        conversions: Number(m.conversions || 0),
        conversionsValue: Number(m.conversions_value ?? m.conversionsValue ?? 0),
      })
    }
  }

  return { success: true, terms: Array.from(map.values()) }
}

/**
 * All existing negative keyword texts (ad-group + campaign level), lowercased,
 * so suggestions can skip terms that are already excluded.
 */
export async function getNegativeKeywordTexts(customerId: string): Promise<{
  success: boolean
  negatives?: Set<string>
  error?: string
}> {
  const adGroupQuery = `
    SELECT ad_group_criterion.keyword.text
    FROM ad_group_criterion
    WHERE ad_group_criterion.negative = TRUE
      AND ad_group_criterion.type = 'KEYWORD'
  `
  const campaignQuery = `
    SELECT campaign_criterion.keyword.text
    FROM campaign_criterion
    WHERE campaign_criterion.negative = TRUE
      AND campaign_criterion.type = 'KEYWORD'
  `

  const [adGroupRes, campaignRes] = await Promise.all([
    searchStreamQuery(customerId, adGroupQuery),
    searchStreamQuery(customerId, campaignQuery),
  ])

  if (!adGroupRes.success && !campaignRes.success) {
    return { success: false, error: adGroupRes.error || campaignRes.error }
  }

  const negatives = new Set<string>()
  for (const row of adGroupRes.results || []) {
    const t = (row as { adGroupCriterion?: { keyword?: { text?: string } } }).adGroupCriterion
      ?.keyword?.text
    if (t) negatives.add(t.toLowerCase())
  }
  for (const row of campaignRes.results || []) {
    const t = (row as { campaignCriterion?: { keyword?: { text?: string } } }).campaignCriterion
      ?.keyword?.text
    if (t) negatives.add(t.toLowerCase())
  }

  return { success: true, negatives }
}

/**
 * Campaign performance (last 30 days, aggregated) including bidding strategy,
 * budget, and impression-share-lost signals. Powers the ROAS dashboard and the
 * budget-limited-vs-rank-limited detection.
 */
export async function getCampaignPerformance(customerId: string): Promise<{
  success: boolean
  campaigns?: Array<{
    id: string
    name: string
    status: string
    biddingStrategyType: string
    budget: number
    cost: number
    clicks: number
    impressions: number
    conversions: number
    conversionsValue: number
    searchImpressionShare: number
    searchBudgetLostIS: number
    searchRankLostIS: number
  }>
  error?: string
}> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date DURING LAST_30_DAYS
  `

  const result = await searchStreamQuery(customerId, query)
  if (!result.success) return { success: false, error: result.error }

  const campaigns = (result.results || []).map((row) => {
    const r = row as {
      campaign?: Record<string, unknown>
      campaignBudget?: Record<string, unknown>
      metrics?: Record<string, number>
    }
    const c = r.campaign || {}
    const m = r.metrics || {}
    return {
      id: String(c.id ?? ''),
      name: String(c.name ?? 'Unknown'),
      status: String(c.status ?? 'UNKNOWN'),
      biddingStrategyType: String(c.biddingStrategyType ?? c.bidding_strategy_type ?? 'UNKNOWN'),
      budget: Number(r.campaignBudget?.amountMicros ?? r.campaignBudget?.amount_micros ?? 0) / 1_000_000,
      cost: Number(m.cost_micros ?? m.costMicros ?? 0) / 1_000_000,
      clicks: Number(m.clicks || 0),
      impressions: Number(m.impressions || 0),
      conversions: Number(m.conversions || 0),
      conversionsValue: Number(m.conversions_value ?? m.conversionsValue ?? 0),
      searchImpressionShare: Number(m.search_impression_share ?? m.searchImpressionShare ?? 0),
      searchBudgetLostIS: Number(
        m.search_budget_lost_impression_share ?? m.searchBudgetLostImpressionShare ?? 0
      ),
      searchRankLostIS: Number(
        m.search_rank_lost_impression_share ?? m.searchRankLostImpressionShare ?? 0
      ),
    }
  })

  return { success: true, campaigns }
}

/**
 * Read account-level conversion settings — specifically whether "enhanced
 * conversions for leads" is turned on. When it's off, Google rejects every
 * upload that carries hashed email/phone with "Make sure you've turned on
 * enhanced conversions for leads in conversion settings." Surfaced in the
 * Ads Health audit so you know which accounts need the manual switch.
 */
export async function getCustomerConversionSettings(customerId: string): Promise<{
  success: boolean
  settings?: {
    enhancedConversionsForLeadsEnabled: boolean
    acceptedCustomerDataTerms: boolean
  }
  error?: string
}> {
  const query = `
    SELECT
      customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled,
      customer.conversion_tracking_setting.accepted_customer_data_terms
    FROM customer
    LIMIT 1
  `

  const result = await searchStreamQuery(customerId, query)
  if (!result.success) return { success: false, error: result.error }

  const row = result.results?.[0] as
    | { customer?: { conversionTrackingSetting?: Record<string, unknown> } }
    | undefined
  const cts = row?.customer?.conversionTrackingSetting || {}

  return {
    success: true,
    settings: {
      enhancedConversionsForLeadsEnabled: Boolean(
        cts.enhancedConversionsForLeadsEnabled ?? cts.enhanced_conversions_for_leads_enabled ?? false
      ),
      acceptedCustomerDataTerms: Boolean(
        cts.acceptedCustomerDataTerms ?? cts.accepted_customer_data_terms ?? false
      ),
    },
  }
}
