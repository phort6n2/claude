import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Google Ads API, used read-only for now: proving a conversion action exists,
 * is enabled, and is actually receiving conversions.
 *
 * Talks REST rather than pulling in the official client library. The library
 * carries gRPC and a large protobuf surface for what is, here, two queries —
 * and the version in the URL makes an API upgrade a visible one-line change
 * rather than a dependency bump that silently alters behaviour.
 *
 * Every credential is ours. Clients are never asked for anything: their
 * accounts sit under the manager account, and one refresh token reaches all
 * of them.
 */

const API_VERSION = 'v21'
const BASE = `https://googleads.googleapis.com/${API_VERSION}`

async function secret(key: string): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key } })
    if (setting) {
      if (setting.encrypted) {
        try {
          return decrypt(setting.value)
        } catch {
          return null
        }
      }
      return setting.value
    }
  } catch {
    // fall through to env
  }
  return process.env[key] || null
}

export interface AdsCredentials {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  /** The manager account every client account sits under. Digits only. */
  loginCustomerId: string
}

export async function getAdsCredentials(): Promise<AdsCredentials | null> {
  const [developerToken, clientId, clientSecret, refreshToken, loginCustomerId] = await Promise.all([
    secret('GOOGLE_ADS_DEVELOPER_TOKEN'),
    secret('GOOGLE_ADS_CLIENT_ID'),
    secret('GOOGLE_ADS_CLIENT_SECRET'),
    secret('GOOGLE_ADS_REFRESH_TOKEN'),
    secret('GOOGLE_ADS_LOGIN_CUSTOMER_ID'),
  ])
  if (!developerToken || !clientId || !clientSecret || !refreshToken) return null
  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    loginCustomerId: (loginCustomerId || '').replace(/\D/g, ''),
  }
}

/** Access tokens last an hour; cached in module scope so a burst of checks
 *  doesn't mint one per request. */
let cachedToken: { token: string; expiresAt: number } | null = null

async function accessToken(creds: AdsCredentials): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      console.error('Google Ads token refresh failed:', data.error_description || data.error)
      return null
    }
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    return cachedToken.token
  } catch (error) {
    console.error('Google Ads token refresh threw:', error)
    return null
  }
}

async function search(
  creds: AdsCredentials,
  customerId: string,
  query: string
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }> {
  const token = await accessToken(creds)
  if (!token) return { ok: false, error: 'Could not get an access token — check the refresh token.' }

  const id = customerId.replace(/\D/g, '')
  try {
    const res = await fetch(`${BASE}/customers/${id}/googleAds:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': creds.developerToken,
        'Content-Type': 'application/json',
        // Required when the account is reached through a manager account,
        // which is every client account here.
        ...(creds.loginCustomerId ? { 'login-customer-id': creds.loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json()
    if (!res.ok) {
      const detail =
        data?.error?.details?.[0]?.errors?.[0]?.message || data?.error?.message || `HTTP ${res.status}`
      return { ok: false, error: detail }
    }
    return { ok: true, rows: data.results || [] }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Request failed' }
  }
}

export interface AdsAccount {
  customerId: string
  name: string
}

/**
 * Every account under the manager, for the admin to match to clients.
 *
 * Typing a ten-digit customer id from memory is how a client's conversions
 * end up being checked against someone else's account, so this exists to make
 * that a dropdown.
 */
export async function listManagedAccounts(): Promise<
  { ok: true; accounts: AdsAccount[] } | { ok: false; error: string }
> {
  const creds = await getAdsCredentials()
  if (!creds) return { ok: false, error: 'Google Ads credentials are not configured.' }
  if (!creds.loginCustomerId) {
    return { ok: false, error: 'Set the manager (MCC) customer ID in Settings.' }
  }

  const result = await search(
    creds,
    creds.loginCustomerId,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager
     FROM customer_client
     WHERE customer_client.status = 'ENABLED'`
  )
  if (!result.ok) return result

  const accounts = result.rows
    .map((row) => {
      const client = (row as { customerClient?: { id?: string; descriptiveName?: string; manager?: boolean } })
        .customerClient
      return client && !client.manager
        ? { customerId: String(client.id || ''), name: client.descriptiveName || String(client.id || '') }
        : null
    })
    .filter(Boolean) as AdsAccount[]

  return { ok: true, accounts: accounts.sort((a, b) => a.name.localeCompare(b.name)) }
}

export interface ConversionActionStatus {
  id: string
  name: string
  /** ENABLED, PAUSED, REMOVED, HIDDEN. */
  status: string
  /** Conversions attributed in the last 30 days. */
  conversions30d: number
  /** Every `AW-xxx/LABEL` this action's own event snippet reports to. */
  sendTo: string[]
}

const SEND_TO = /AW-\d+\/[A-Za-z0-9_-]+/g

/**
 * Every conversion action in an account, with a 30-day count.
 *
 * Deliberately two queries. Putting `segments.date` in the WHERE clause
 * silently segments the whole result by day — so a single query returns one
 * row per action per day, and an action that has never fired returns no row at
 * all. That would report a correctly-installed-but-quiet conversion as
 * "doesn't exist", which is precisely the wrong answer to give someone
 * debugging their tracking. So the actions are listed unsegmented, and the
 * counts are summed from a second, segmented query and joined on the ID.
 */
export async function listConversionActions(
  customerId: string
): Promise<{ ok: true; actions: ConversionActionStatus[] } | { ok: false; error: string }> {
  const creds = await getAdsCredentials()
  if (!creds) return { ok: false, error: 'Google Ads credentials are not configured.' }

  const listed = await search(
    creds,
    customerId,
    `SELECT conversion_action.id,
            conversion_action.name,
            conversion_action.status,
            conversion_action.tag_snippets
     FROM conversion_action`
  )
  if (!listed.ok) return listed

  // A failure here costs the counts, not the existence check, so it degrades
  // to zeroes rather than failing the whole report.
  const counted = await search(
    creds,
    customerId,
    `SELECT conversion_action.id, metrics.all_conversions
     FROM conversion_action
     WHERE segments.date DURING LAST_30_DAYS`
  )
  const totals = new Map<string, number>()
  if (counted.ok) {
    for (const row of counted.rows) {
      const id = String(
        (row as { conversionAction?: { id?: string } }).conversionAction?.id ?? ''
      )
      if (!id) continue
      const value = Number(
        (row as { metrics?: { allConversions?: number | string } }).metrics?.allConversions ?? 0
      )
      totals.set(id, (totals.get(id) ?? 0) + (Number.isFinite(value) ? value : 0))
    }
  }

  const actions = listed.rows.map((row) => {
    const action = (
      row as {
        conversionAction?: {
          id?: string
          name?: string
          status?: string
          tagSnippets?: Array<{ eventSnippet?: string }>
        }
      }
    ).conversionAction
    const id = String(action?.id ?? '')
    const sendTo = new Set<string>()
    for (const snippet of action?.tagSnippets || []) {
      for (const match of (snippet.eventSnippet || '').match(SEND_TO) || []) sendTo.add(match)
    }
    return {
      id,
      name: action?.name || id,
      status: action?.status || 'UNKNOWN',
      conversions30d: totals.get(id) ?? 0,
      sendTo: [...sendTo],
    }
  })

  return { ok: true, actions }
}

/**
 * Find the conversion action behind a `send_to` value and report on it.
 *
 * The label in the page's snippet is not the action's ID — it appears inside
 * the action's own event snippet, which is why the snippets are matched rather
 * than looked up directly.
 */
export async function findConversionAction(
  customerId: string,
  sendTo: string
): Promise<{ ok: true; action: ConversionActionStatus | null } | { ok: false; error: string }> {
  const result = await listConversionActions(customerId)
  if (!result.ok) return result
  return { ok: true, action: result.actions.find((a) => a.sendTo.includes(sendTo)) || null }
}
