import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * The shop's OWN website, measured: Google Analytics 4 and Search Console.
 *
 * WHAT THIS IS FOR. An SEO client is paying for their main site to rank and
 * to get found, and until now the platform could show them where they sit in
 * a map grid and what has been published — but nothing about whether anybody
 * arrived. The Activity tab exists because three months pass with nothing to
 * look at; this is the other half of that answer, and it is the one a shop
 * owner asks first.
 *
 * IT REPORTS ON THEIR MAIN SITE, NOT OURS. `Client.ga4PropertyId` and
 * `Client.searchConsoleSiteUrl` point at the site they already had. The
 * landing page this platform hosts has its own conversion reporting in Google
 * Ads, and mixing the two would produce a number that answers no question.
 *
 * ONE ACCOUNT, ONE CONSENT. The credential is the OPERATOR'S — the same
 * Google account that already has these properties shared with it — not each
 * shop's. So there is exactly one refresh token to obtain, no OAuth dance to
 * walk fifteen shop owners through, and the admin picks each client's
 * property from a list of what that account can actually see. A picklist
 * rather than a typed id, because a mistyped property id reports another
 * business's traffic to this one and looks completely normal doing it.
 *
 * READ ONLY, ALWAYS. The scopes are the read-only ones and nothing here
 * writes to Google. An integration that can change a client's analytics
 * configuration is one nobody can safely run to find out what is there.
 */

/** GA4 Admin + Data, and Search Console. Read-only scopes, deliberately. */
export const ANALYTICS_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
]

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

export interface AnalyticsCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string
}

/**
 * The OAuth client is SHARED with Google Ads; only the refresh token is new.
 *
 * Both live in the same Google Cloud project behind the same consent screen,
 * so asking an operator to create a second OAuth client would be asking them
 * to redo the hardest part of a setup they have already done. The token is
 * separate because the scopes are: an Ads refresh token cannot read Analytics
 * and reusing it would fail in a way that reads as "Analytics is broken".
 */
export async function analyticsCredentials(): Promise<AnalyticsCredentials | null> {
  const [ownId, ownSecret, refreshToken] = await Promise.all([
    secret('GOOGLE_ANALYTICS_CLIENT_ID'),
    secret('GOOGLE_ANALYTICS_CLIENT_SECRET'),
    secret('GOOGLE_ANALYTICS_REFRESH_TOKEN'),
  ])
  if (!refreshToken) return null
  const [adsId, adsSecret] = await Promise.all([
    secret('GOOGLE_ADS_CLIENT_ID'),
    secret('GOOGLE_ADS_CLIENT_SECRET'),
  ])
  const clientId = ownId || adsId
  const clientSecret = ownSecret || adsSecret
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, refreshToken }
}

/** Whether the operator has connected the account at all. */
export async function analyticsConnected(): Promise<boolean> {
  return (await analyticsCredentials()) !== null
}

export class AnalyticsError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'AnalyticsError'
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  // A minute of headroom: a token that expires mid-request is a 401 on a page
  // that was working a second ago.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token
  const creds = await analyticsCredentials()
  if (!creds) throw new AnalyticsError('Google Analytics is not connected')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }
  if (!res.ok || !body.access_token) {
    throw new AnalyticsError(
      body.error_description || body.error || `Token refresh failed (${res.status})`,
      res.status
    )
  }
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  }
  return cachedToken.token
}

async function google<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await accessToken()
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    // Google's error bodies are JSON with a useful message inside; surface it
    // rather than the status alone, because "403" and "you were removed from
    // this property" need different actions from whoever is reading.
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      if (parsed.error?.message) detail = parsed.error.message
    } catch {
      // keep the raw body
    }
    throw new AnalyticsError(detail, res.status)
  }
  return (text ? JSON.parse(text) : {}) as T
}

// ---------------------------------------------------------------- picklists

export interface Ga4PropertyOption {
  /** Numeric id, e.g. "421398765". What the Data API needs. */
  propertyId: string
  /** What a human recognises, e.g. "Auto Glass Kings". */
  displayName: string
  /** The account it sits under, so two similarly named properties can be told apart. */
  accountName: string
}

/**
 * Every GA4 property the operator's account can see.
 *
 * `accountSummaries` rather than walking accounts then properties: one call,
 * already grouped, and it returns exactly what a picklist needs.
 */
export async function listGa4Properties(): Promise<Ga4PropertyOption[]> {
  const options: Ga4PropertyOption[] = []
  let pageToken: string | undefined
  do {
    const url = new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries')
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const data = await google<{
      accountSummaries?: Array<{
        displayName?: string
        propertySummaries?: Array<{ property?: string; displayName?: string }>
      }>
      nextPageToken?: string
    }>(url.toString())
    for (const account of data.accountSummaries || []) {
      for (const property of account.propertySummaries || []) {
        // `property` arrives as "properties/421398765"; the Data API wants
        // the whole resource name, the picklist wants the number.
        const id = (property.property || '').split('/')[1]
        if (!id) continue
        options.push({
          propertyId: id,
          displayName: property.displayName || id,
          accountName: account.displayName || '',
        })
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return options.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export interface SearchConsoleSiteOption {
  /** Exactly as Search Console lists it — "sc-domain:example.com" or a URL prefix. */
  siteUrl: string
  permissionLevel: string
}

/**
 * Every Search Console property the operator's account can see.
 *
 * The siteUrl is stored VERBATIM. A domain property is "sc-domain:example.com"
 * and a prefix property is "https://example.com/" including the trailing
 * slash, and the API matches on the exact string — normalising it into
 * something tidier is how a query returns nothing at all.
 */
export async function listSearchConsoleSites(): Promise<SearchConsoleSiteOption[]> {
  const data = await google<{
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>
  }>('https://www.googleapis.com/webmasters/v3/sites')
  return (data.siteEntry || [])
    .filter((s) => !!s.siteUrl)
    // siteUnverifiedUser can list a property it cannot query, and a picklist
    // entry that fails on selection is worse than one that is not offered.
    .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
    .map((s) => ({ siteUrl: s.siteUrl as string, permissionLevel: s.permissionLevel || '' }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))
}

// ------------------------------------------------------------------ reports

/** How far back every report looks. One number, so the two agree. */
export const REPORT_DAYS = 90

export interface DayPoint {
  date: string
  value: number
}

export interface NamedCount {
  name: string
  value: number
  share: number
}

export interface TrafficReport {
  activeUsers: number
  sessions: number
  daily: DayPoint[]
  channels: NamedCount[]
  aiSources: NamedCount[]
  aiUsers: number
  topPages: Array<{ page: string; users: number; share: number; topSource: string }>
}

/**
 * Hosts that mean "an AI assistant sent them".
 *
 * NOT A DATA FEED — a lookup table, which is the whole of what a dashboard
 * badged "AI search traffic" is doing. Matched as a suffix on the session
 * source so `chatgpt.com` catches its subdomains without `notchatgpt.com`
 * matching anything.
 *
 * Read it as a floor, never a count. Most assistants send no referrer at all,
 * so those visits land in Direct and are invisible here. A number that moves
 * is the signal; the absolute value understates and always will.
 */
const AI_SOURCES: Array<{ match: string; label: string }> = [
  { match: 'chatgpt.com', label: 'ChatGPT' },
  { match: 'openai.com', label: 'ChatGPT' },
  { match: 'perplexity.ai', label: 'Perplexity' },
  { match: 'gemini.google.com', label: 'Gemini' },
  { match: 'bard.google.com', label: 'Gemini' },
  { match: 'copilot.microsoft.com', label: 'Copilot' },
  { match: 'claude.ai', label: 'Claude' },
  { match: 'you.com', label: 'You.com' },
  { match: 'phind.com', label: 'Phind' },
  { match: 'poe.com', label: 'Poe' },
]

function aiLabelFor(source: string): string | null {
  const host = source.toLowerCase().trim()
  for (const { match, label } of AI_SOURCES) {
    if (host === match || host.endsWith(`.${match}`)) return label
  }
  return null
}

function shareOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0
}

function rank(counts: Map<string, number>, total: number, limit: number): NamedCount[] {
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value, share: shareOf(value, total) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

/** ISO yyyy-mm-dd from GA4's compact yyyymmdd. */
function isoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
}

interface Ga4Response {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
}

async function runReport(propertyId: string, body: unknown): Promise<Ga4Response> {
  return google<Ga4Response>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}

/**
 * Everything the traffic page shows, in three calls rather than one per card.
 *
 * GA4 will not return unrelated breakdowns from a single report — asking for
 * date, channel, source and page together produces the cross-product, where
 * every total is wrong in a way that looks plausible. So: one report per
 * question, and the totals come from the one that has no breakdown at all.
 */
export async function fetchTraffic(propertyId: string, days = REPORT_DAYS): Promise<TrafficReport> {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }]

  const [byDate, bySource, byPage] = await Promise.all([
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 400,
    }),
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
      metrics: [{ name: 'activeUsers' }],
      limit: 500,
    }),
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 300,
    }),
  ])

  const daily: DayPoint[] = (byDate.rows || []).map((row) => ({
    date: isoDate(row.dimensionValues?.[0]?.value || ''),
    value: Number(row.metricValues?.[0]?.value || 0),
  }))
  const activeUsers = daily.reduce((sum, d) => sum + d.value, 0)
  const sessions = (byDate.rows || []).reduce(
    (sum, row) => sum + Number(row.metricValues?.[1]?.value || 0),
    0
  )

  const channels = new Map<string, number>()
  const ai = new Map<string, number>()
  for (const row of bySource.rows || []) {
    const channel = row.dimensionValues?.[0]?.value || 'Unassigned'
    const source = row.dimensionValues?.[1]?.value || ''
    const users = Number(row.metricValues?.[0]?.value || 0)
    const aiLabel = aiLabelFor(source)
    // An AI referral is a channel of its own here, and it is REMOVED from the
    // channel it would otherwise sit in — GA4 files chatgpt.com under Referral,
    // so counting it in both makes the shares add up to more than everything.
    if (aiLabel) {
      ai.set(aiLabel, (ai.get(aiLabel) || 0) + users)
      channels.set('AI Search', (channels.get('AI Search') || 0) + users)
    } else {
      channels.set(channel, (channels.get(channel) || 0) + users)
    }
  }
  const channelTotal = [...channels.values()].reduce((a, b) => a + b, 0)
  const aiUsers = [...ai.values()].reduce((a, b) => a + b, 0)

  const pageUsers = new Map<string, number>()
  const pageTopSource = new Map<string, { name: string; users: number }>()
  for (const row of byPage.rows || []) {
    const page = row.dimensionValues?.[0]?.value || '/'
    const channel = row.dimensionValues?.[1]?.value || 'Unassigned'
    const users = Number(row.metricValues?.[0]?.value || 0)
    pageUsers.set(page, (pageUsers.get(page) || 0) + users)
    const best = pageTopSource.get(page)
    if (!best || users > best.users) pageTopSource.set(page, { name: channel, users })
  }
  const pageTotal = [...pageUsers.values()].reduce((a, b) => a + b, 0)
  const topPages = [...pageUsers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([page, users]) => ({
      page,
      users,
      share: shareOf(users, pageTotal),
      topSource: pageTopSource.get(page)?.name || '—',
    }))

  return {
    activeUsers,
    sessions,
    daily,
    channels: rank(channels, channelTotal, 8),
    aiSources: rank(ai, aiUsers, 8),
    aiUsers,
    topPages,
  }
}

export interface SearchReport {
  clicks: number
  impressions: number
  /** Weighted by impressions, which is how Search Console itself computes it. */
  averagePosition: number
  daily: Array<{ date: string; clicks: number; impressions: number; position: number }>
  countries: NamedCount[]
  topPages: Array<{
    page: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>
}

interface GscResponse {
  rows?: Array<{
    keys?: string[]
    clicks?: number
    impressions?: number
    ctr?: number
    position?: number
  }>
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function searchQuery(
  siteUrl: string,
  body: Record<string, unknown>
): Promise<GscResponse> {
  // The site URL is a path segment and domain properties contain a colon, so
  // it has to be encoded — "sc-domain:example.com" unencoded is a different
  // route.
  return google<GscResponse>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}

export async function fetchSearchPerformance(
  siteUrl: string,
  days = REPORT_DAYS
): Promise<SearchReport> {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  // Search Console runs two to three days behind. The range still ends today
  // — asking for less would just hide the lag — but the page says so, because
  // "the last two days look dead" is otherwise a support call every week.
  const range = { startDate: ymd(start), endDate: ymd(end) }

  const [byDate, byCountry, byPage, byQuery] = await Promise.all([
    searchQuery(siteUrl, { ...range, dimensions: ['date'], rowLimit: 500 }),
    searchQuery(siteUrl, { ...range, dimensions: ['country'], rowLimit: 25 }),
    searchQuery(siteUrl, { ...range, dimensions: ['page'], rowLimit: 25 }),
    searchQuery(siteUrl, { ...range, dimensions: ['query'], rowLimit: 25 }),
  ])

  const daily = (byDate.rows || []).map((row) => ({
    date: row.keys?.[0] || '',
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    position: Math.round((row.position || 0) * 10) / 10,
  }))
  const clicks = daily.reduce((sum, d) => sum + d.clicks, 0)
  const impressions = daily.reduce((sum, d) => sum + d.impressions, 0)
  // IMPRESSION-WEIGHTED, not the mean of the daily averages. A quiet Sunday
  // where the site showed twice at position 2 would otherwise pull the
  // quarter's average down as hard as a weekday with four thousand
  // impressions.
  const weighted = daily.reduce((sum, d) => sum + d.position * d.impressions, 0)
  const averagePosition = impressions > 0 ? Math.round((weighted / impressions) * 10) / 10 : 0

  const countryClicks = new Map<string, number>()
  for (const row of byCountry.rows || []) {
    countryClicks.set((row.keys?.[0] || '').toUpperCase(), row.clicks || 0)
  }

  return {
    clicks,
    impressions,
    averagePosition,
    daily,
    countries: rank(countryClicks, clicks, 8),
    topPages: (byPage.rows || []).map((row) => ({
      page: row.keys?.[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: Math.round((row.ctr || 0) * 1000) / 10,
      position: Math.round((row.position || 0) * 10) / 10,
    })),
    topQueries: (byQuery.rows || []).map((row) => ({
      query: row.keys?.[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      position: Math.round((row.position || 0) * 10) / 10,
    })),
  }
}

// ------------------------------------------------------------------- refresh

/** How stale a snapshot may be before a page view refreshes it. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000

export interface SiteAnalytics {
  traffic: TrafficReport | null
  search: SearchReport | null
  fetchedAt: string | null
  error: string | null
}

/**
 * Refresh one client's snapshot from Google. Never throws.
 *
 * A FAILED REFRESH DOES NOT WIPE THE LAST GOOD ONE. The error is stored
 * beside the data, and the page shows both: last week's numbers with "this
 * stopped updating on Tuesday" is more use to everyone than an empty page,
 * and it is the only way an operator finds out that a property was
 * un-shared with us.
 */
export async function refreshSiteAnalytics(clientId: string): Promise<SiteAnalytics> {
  const client = await prisma.client
    .findUnique({
      where: { id: clientId },
      select: { ga4PropertyId: true, searchConsoleSiteUrl: true },
    })
    .catch(() => null)
  if (!client) return { traffic: null, search: null, fetchedAt: null, error: 'Client not found' }
  if (!client.ga4PropertyId && !client.searchConsoleSiteUrl) {
    return { traffic: null, search: null, fetchedAt: null, error: null }
  }

  const errors: string[] = []
  let traffic: TrafficReport | null = null
  let search: SearchReport | null = null

  if (client.ga4PropertyId) {
    try {
      traffic = await fetchTraffic(client.ga4PropertyId)
    } catch (err) {
      errors.push(`Analytics: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }
  if (client.searchConsoleSiteUrl) {
    try {
      search = await fetchSearchPerformance(client.searchConsoleSiteUrl)
    } catch (err) {
      errors.push(`Search Console: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }

  const error = errors.length ? errors.join(' · ') : null
  const fetchedAt = new Date()
  try {
    // Only overwrite the half that actually came back — a Search Console
    // outage must not blank out working Analytics numbers.
    const existing = await prisma.siteTrafficSnapshot.findUnique({ where: { clientId } })
    const data = {
      fetchedAt,
      traffic: (traffic ?? existing?.traffic ?? null) as object | null,
      search: (search ?? existing?.search ?? null) as object | null,
      error,
    }
    await prisma.siteTrafficSnapshot.upsert({
      where: { clientId },
      create: { clientId, ...data } as never,
      update: data as never,
    })
  } catch (err) {
    console.error('[Site analytics] Could not store snapshot:', err)
  }

  return {
    traffic,
    search,
    fetchedAt: fetchedAt.toISOString(),
    error,
  }
}

/**
 * What the page renders: the stored snapshot, refreshed if it has gone stale.
 *
 * Reading is never allowed to fail the page. A Google outage, a revoked
 * token, a property removed from the account — all of them degrade to
 * whatever was last stored plus an error line.
 */
export async function getSiteAnalytics(clientId: string): Promise<SiteAnalytics> {
  const snapshot = await prisma.siteTrafficSnapshot
    .findUnique({ where: { clientId } })
    .catch(() => null)

  const fresh =
    snapshot && Date.now() - new Date(snapshot.fetchedAt).getTime() < STALE_AFTER_MS
  if (fresh) {
    return {
      traffic: (snapshot.traffic as unknown as TrafficReport) ?? null,
      search: (snapshot.search as unknown as SearchReport) ?? null,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      error: snapshot.error,
    }
  }

  const refreshed = await refreshSiteAnalytics(clientId).catch((err) => ({
    traffic: null,
    search: null,
    fetchedAt: null,
    error: err instanceof Error ? err.message : 'Refresh failed',
  }))
  // A refresh that produced nothing falls back to whatever was stored, so a
  // transient failure does not empty a page that worked an hour ago.
  if (!refreshed.traffic && !refreshed.search && snapshot) {
    return {
      traffic: (snapshot.traffic as unknown as TrafficReport) ?? null,
      search: (snapshot.search as unknown as SearchReport) ?? null,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      error: refreshed.error || snapshot.error,
    }
  }
  return refreshed
}
