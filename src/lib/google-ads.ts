import crypto from 'crypto'
import { prisma } from './db'
import { encrypt, decrypt } from './encryption'

const GOOGLE_ADS_API_VERSION = 'v19'
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

  // Build the conversion adjustment
  const conversionAdjustment = {
    adjustmentType: 'ENHANCEMENT',
    conversionAction: `customers/${customerId}/conversionActions/${params.conversionAction}`,
    gclidDateTimePair: {
      gclid: params.gclid,
      conversionDateTime: formatGoogleAdsDateTime(params.conversionDateTime),
    },
    userIdentifiers: userIdentifiers.map((id) => {
      if (id.hashedEmail) {
        return { userIdentifierSource: 'FIRST_PARTY', hashedEmail: id.hashedEmail }
      }
      return { userIdentifierSource: 'FIRST_PARTY', hashedPhoneNumber: id.hashedPhoneNumber }
    }),
  }

  try {
    const url = `${GOOGLE_ADS_API_BASE}/customers/${customerId}:uploadConversionAdjustments`
    const requestBody = {
      conversionAdjustments: [conversionAdjustment],
      partialFailure: true,
    }

    console.log('[Enhanced Conversion] Sending request:', {
      url,
      customerId,
      conversionAction: params.conversionAction,
      hasEmail: !!params.email,
      hasPhone: !!params.phone,
      gclid: params.gclid?.substring(0, 20) + '...',
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'login-customer-id': creds.mccCustomerId.replace(/-/g, ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

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

  // Build the click conversion
  const clickConversion = {
    gclid: params.gclid,
    conversionAction: `customers/${customerId}/conversionActions/${params.conversionAction}`,
    conversionDateTime: formatGoogleAdsDateTime(params.conversionDateTime),
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
  let dateFilter = ''
  const today = new Date()
  const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')

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
