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
  /** True when a dedicated Analytics client is configured rather than borrowed. */
  ownClient: boolean
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

  /* BOTH HALVES FROM THE SAME CLIENT, OR NEITHER.
     Falling back per field — own id, Ads secret — assembles a pair that
     belongs to no client at all, and Google answers that with the same
     "invalid_client: Unauthorized" as every other mismatch. So one of the two
     filled in is treated as an incomplete dedicated client rather than as a
     licence to mix. */
  if (ownId || ownSecret) {
    if (!ownId || !ownSecret) return null
    return { clientId: ownId, clientSecret: ownSecret, refreshToken, ownClient: true }
  }

  const [adsId, adsSecret] = await Promise.all([
    secret('GOOGLE_ADS_CLIENT_ID'),
    secret('GOOGLE_ADS_CLIENT_SECRET'),
  ])
  if (!adsId || !adsSecret) return null
  return { clientId: adsId, clientSecret: adsSecret, refreshToken, ownClient: false }
}

/**
 * Why credentials came back null, in words. The three causes are different
 * jobs and "not connected" covers all of them equally badly.
 */
export async function analyticsCredentialProblem(): Promise<string | null> {
  const [ownId, ownSecret, refreshToken] = await Promise.all([
    secret('GOOGLE_ANALYTICS_CLIENT_ID'),
    secret('GOOGLE_ANALYTICS_CLIENT_SECRET'),
    secret('GOOGLE_ANALYTICS_REFRESH_TOKEN'),
  ])
  if (!refreshToken) return 'No Analytics refresh token has been saved yet.'
  if (ownId && !ownSecret) {
    return 'An Analytics OAuth client ID is saved with no secret. Fill both, or clear both to reuse the Google Ads client.'
  }
  if (ownSecret && !ownId) {
    return 'An Analytics OAuth client secret is saved with no ID. Fill both, or clear both to reuse the Google Ads client.'
  }
  if (!ownId && !ownSecret) {
    const [adsId, adsSecret] = await Promise.all([
      secret('GOOGLE_ADS_CLIENT_ID'),
      secret('GOOGLE_ADS_CLIENT_SECRET'),
    ])
    if (!adsId || !adsSecret) {
      return 'No OAuth client to use: the Google Ads client id/secret are not saved, and no Analytics-specific pair was entered.'
    }
  }
  return null
}

/** Whether the operator has connected the account at all. */
export async function analyticsConnected(): Promise<boolean> {
  return (await analyticsCredentials()) !== null
}

/**
 * Press-a-button diagnosis for the setup, because there are four ways to get
 * this wrong and Google reports three of them as the same shrug.
 *
 * Setting it up means: a refresh token with the right scopes, three APIs
 * enabled in the Cloud project, and the account actually granted on some
 * properties. A failure in any one produces an empty picklist, and an empty
 * picklist looks exactly like "there are no properties". So this names which
 * of them it is, in the words of the step that fixes it.
 */
export async function testAnalyticsConnection(): Promise<{
  success: boolean
  message: string
}> {
  const creds = await analyticsCredentials()
  if (!creds) {
    return {
      success: false,
      message: (await analyticsCredentialProblem()) || 'Not configured.',
    }
  }

  // 1. Does the token still exchange?
  let token: string
  try {
    cachedToken = null
    token = await accessToken()
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'failed'
    if (/invalid_grant|expired|revoked/i.test(detail)) {
      return {
        success: false,
        message: `Google rejected the refresh token (${detail}). The usual cause is a token minted while the OAuth app was still in "Testing" — those expire after 7 days. Publish the app, then generate a new one.`,
      }
    }
    if (/invalid_client|unauthorized_client|^Unauthorized/i.test(detail)) {
      /* The commonest failure, and the one that reads as something else.
         "invalid_client: Unauthorized" means the client id and secret sent
         with the refresh token are not the pair the token was minted for —
         usually because "Use your own OAuth credentials" was left unticked in
         the OAuth Playground, or a new client secret was added in Google and
         this app still holds the old one. Naming the id's leading
         number — the part that distinguishes one client from another, and the
         half Google itself calls not-a-secret — makes that checkable against
         the console without putting the secret on screen. */
      return {
        success: false,
        message: `Google rejected the OAuth client (${detail}). The refresh token must be generated with the SAME client id and secret this app has saved — the ${creds.ownClient ? 'one saved in the two Analytics fields above' : 'GOOGLE ADS pair, which this is borrowing'} \u2014 id starting "${creds.clientId.split('-')[0]}". In the OAuth Playground, use the gear icon → "Use your own OAuth credentials" and paste THAT client\u2019s id and secret before authorising.`,
      }
    }
    return { success: false, message: detail }
  }

  // 2. Are the APIs enabled, and does the token carry the scopes? Both halves
  //    are checked because the two are enabled separately and a working
  //    Analytics half tells you nothing about Search Console.
  const problems: string[] = []
  let propertyCount = 0
  let siteCount = 0

  try {
    const properties = await listGa4Properties()
    propertyCount = properties.length
    /* THE DATA API IS A SEPARATE SWITCH, and this is the gap that let a setup
       test green while every report came back empty. Listing properties uses
       the ADMIN API; the numbers come from the DATA API, enabled separately in
       the same console. With one on and the other off the picklist fills, the
       association saves, and the client's page says "still connecting"
       forever. So the test asks the Data API a real question. */
    if (properties[0]) {
      await runReport(properties[0].propertyId, {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
        limit: 1,
      })
    }
  } catch (err) {
    const which = /analyticsdata/.test(String(err)) ? 'Google Analytics Data API' : 'Google Analytics Admin API'
    problems.push(`Analytics — ${explain(err, which)}`)
  }

  try {
    const data = await google<{ siteEntry?: unknown[] }>(
      'https://www.googleapis.com/webmasters/v3/sites'
    )
    siteCount = (data.siteEntry || []).length
  } catch (err) {
    problems.push(`Search Console — ${explain(err, 'Google Search Console API')}`)
  }

  if (problems.length) return { success: false, message: problems.join(' · ') }

  // 3. Connected, but granted nothing. Worth saying out loud: the picklists
  //    will be empty and that is a sharing problem, not a setup one.
  if (!propertyCount && !siteCount) {
    return {
      success: false,
      message:
        'Connected, but this Google account can see no Analytics properties and no Search Console sites. Share the clients’ properties with it (Viewer is enough).',
    }
  }

  void token
  return {
    success: true,
    message: `Connected. ${propertyCount ? 'Analytics is readable' : 'No Analytics properties shared'}; ${siteCount ? `${siteCount} Search Console ${siteCount === 1 ? 'site' : 'sites'}` : 'no Search Console sites shared'}.`,
  }
}

/** Turn a Google error into the step that fixes it. */
function explain(err: unknown, apiName: string): string {
  const detail = err instanceof Error ? err.message : 'failed'
  if (/has not been used in project|is disabled|SERVICE_DISABLED|not enabled/i.test(detail)) {
    return `the ${apiName} is not enabled in the Cloud project. Enable it, then wait a minute and test again.`
  }
  if (/insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(detail)) {
    return `the token was granted without this scope. Generate it again with BOTH scopes pasted into the playground at once.`
  }
  if (/permission|forbidden|403/i.test(detail)) {
    return `this Google account has no access. Share the property with it, or sign in as the account that owns it. (${detail})`
  }
  return detail
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
    /* BOTH FIELDS, CODE FIRST. Google's token endpoint answers a mismatched
       OAuth client with { error: "invalid_client", error_description:
       "Unauthorized" } — and the description alone is the single least
       helpful word it could have chosen. Rendered on its own beside a
       credential it reads as "your admin session expired", which is a
       different problem entirely and cost an afternoon. The machine-readable
       code is what the caller matches on. */
    throw new AnalyticsError(
      [body.error, body.error_description].filter(Boolean).join(': ') ||
        `Token refresh failed (${res.status})`,
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

/**
 * The windows the report can be asked for.
 *
 * ONE LIST, used by the picker, the fetchers and the cache key, so a range
 * offered in the UI cannot be one the fetcher does not understand.
 *
 * "All time" is bounded by what each API will actually answer for, which is
 * not the same on both: Search Console keeps 16 months and refuses older
 * dates outright. So it is a LONG range, not an unlimited one, and the page
 * says so rather than presenting a 16-month figure as a lifetime total.
 */
export const RANGES = [
  { key: '1d', label: 'Last 1 day', days: 1 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '12m', label: 'Last 12 months', days: 365 },
  { key: 'all', label: 'All time', days: 1825 },
] as const

export type RangeKey = (typeof RANGES)[number]['key']
export const DEFAULT_RANGE: RangeKey = '90d'

/** A range key from anything — a query string included. Never throws. */
export function rangeFrom(value: unknown): RangeKey {
  const key = typeof value === 'string' ? value : ''
  return (RANGES.find((r) => r.key === key)?.key ?? DEFAULT_RANGE) as RangeKey
}

export function rangeDays(key: RangeKey): number {
  return RANGES.find((r) => r.key === key)?.days ?? 90
}

/**
 * The shop's own site as an address a person recognises.
 *
 * Search Console stores "sc-domain:example.com" for a domain property and a
 * full URL with a trailing slash for a prefix one; neither is what anybody
 * calls their website.
 */
export function siteLabelFrom(searchConsoleSiteUrl: string | null | undefined): string | null {
  if (!searchConsoleSiteUrl) return null
  const raw = searchConsoleSiteUrl.trim()
  if (!raw) return null
  if (raw.startsWith('sc-domain:')) return raw.slice('sc-domain:'.length)
  try {
    const url = new URL(raw)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return raw
  }
}

export function rangeLabel(key: RangeKey): string {
  return RANGES.find((r) => r.key === key)?.label ?? 'Last 90 days'
}

/**
 * Search Console will not answer past 16 months and errors rather than
 * clamping, so the long ranges are clamped here instead.
 */
const GSC_MAX_DAYS = 480

export interface DayPoint {
  date: string
  value: number
}

/**
 * The chart's data: one row per bucket, one value per series.
 *
 * BUCKETED WHEN THE RANGE IS LONG. 365 daily points in an 800px chart is
 * three days to a pixel — a shape nobody can read and a tooltip nobody can
 * aim at. Past a threshold the points are summed into weeks, and `bucket`
 * says which it is so the tooltip can name the week rather than implying a
 * day.
 */
export interface TrafficSeries {
  bucket: 'day' | 'week'
  /** Series names, in the order every point's `values` array follows. */
  names: string[]
  points: Array<{ date: string; endDate?: string; values: number[] }>
}

export interface NamedCount {
  name: string
  value: number
  share: number
}

export interface TrafficReport {
  activeUsers: number
  sessions: number
  /** Total per bucket, for anything that wants one line. */
  daily: DayPoint[]
  /** Per channel per bucket, for the chart and its tooltip. */
  series: TrafficSeries
  channels: NamedCount[]
  aiSources: NamedCount[]
  aiUsers: number
  aiSessions: number
  /** Per AI assistant per bucket — the AI tab's own chart. */
  aiSeries: TrafficSeries
  /** Which pages the assistants land people on, and which one sends most. */
  aiTopPages: Array<{ page: string; users: number; share: number; topModel: string }>
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
/** Every host in AI_SOURCES, for GA4's exact-match inList filter. */
const AI_HOSTS = AI_SOURCES.map((s) => s.match)

/**
 * Sum daily rows into weeks once there are too many to draw.
 *
 * The threshold is about readability, not data volume: past roughly a
 * hundred points an 800px chart gives each one under eight pixels, which is
 * narrower than a fingertip and finer than anyone can read a trend from.
 */
function bucketPoints(
  points: Array<{ date: string; values: number[] }>,
  names: string[]
): TrafficSeries {
  if (points.length <= 100) return { bucket: 'day', names, points }
  const weeks: Array<{ date: string; endDate?: string; values: number[] }> = []
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7)
    const values = names.map((_, n) => chunk.reduce((sum, p) => sum + (p.values[n] || 0), 0))
    weeks.push({ date: chunk[0].date, endDate: chunk[chunk.length - 1].date, values })
  }
  return { bucket: 'week', names, points: weeks }
}

export async function fetchTraffic(
  propertyId: string,
  range: RangeKey = DEFAULT_RANGE
): Promise<TrafficReport> {
  const days = rangeDays(range)
  // `1daysAgo` to today is two days of data, which is not what "Last 1 day"
  // offers. The window is exclusive of today's partial day for the short
  // ranges and inclusive after that, matching how the label reads.
  const dateRanges = [{ startDate: `${Math.max(days - 1, 0)}daysAgo`, endDate: 'today' }]

  const [byDate, byDateChannel, byAiDate, bySource, byAiSourceDate, byPage, byAiPage] =
    await Promise.all([
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 2000,
    }),
    // The chart. One row per day per channel, which is what a tooltip listing
    // every channel for one day needs and what a single total cannot give.
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'activeUsers' }],
      limit: 20000,
    }),
    // The same again, restricted to AI referrers — so "AI Search" can be its
    // own line AND be subtracted from the channel GA4 filed it under, per
    // day, instead of being double counted or guessed at.
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'activeUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'sessionSource', inListFilter: { values: AI_HOSTS } },
      },
      limit: 20000,
    }),
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      limit: 5000,
    }),
    // Which assistant, day by day. The totals alone answer "is anyone coming
    // from AI"; a shop watching that number grow wants to know when it
    // started and which one moved.
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'date' }, { name: 'sessionSource' }],
      metrics: [{ name: 'activeUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'sessionSource', inListFilter: { values: AI_HOSTS } },
      },
      limit: 20000,
    }),
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 300,
    }),
    // The same question for AI only. It cannot be sliced out of the table
    // above — that one has no source dimension, so an AI visit is
    // indistinguishable from any other Referral in it.
    runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'sessionSource' }],
      metrics: [{ name: 'activeUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'sessionSource', inListFilter: { values: AI_HOSTS } },
      },
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

  // --- totals, and the AI split -------------------------------------------
  const channels = new Map<string, number>()
  const ai = new Map<string, number>()
  let aiSessions = 0
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
      aiSessions += Number(row.metricValues?.[1]?.value || 0)
    } else {
      channels.set(channel, (channels.get(channel) || 0) + users)
    }
  }
  const channelTotal = [...channels.values()].reduce((a, b) => a + b, 0)
  const aiUsers = [...ai.values()].reduce((a, b) => a + b, 0)

  // --- the chart's grid ----------------------------------------------------
  const AI_NAME = 'AI Search'
  const perDate = new Map<string, Map<string, number>>()
  const cell = (date: string) => {
    let row = perDate.get(date)
    if (!row) perDate.set(date, (row = new Map()))
    return row
  }
  for (const row of byDateChannel.rows || []) {
    const date = isoDate(row.dimensionValues?.[0]?.value || '')
    const channel = row.dimensionValues?.[1]?.value || 'Unassigned'
    const users = Number(row.metricValues?.[0]?.value || 0)
    cell(date).set(channel, (cell(date).get(channel) || 0) + users)
  }
  for (const row of byAiDate.rows || []) {
    const date = isoDate(row.dimensionValues?.[0]?.value || '')
    const channel = row.dimensionValues?.[1]?.value || 'Unassigned'
    const users = Number(row.metricValues?.[0]?.value || 0)
    const day = cell(date)
    // Moved, not added: out of whatever GA4 filed it under, into AI Search.
    day.set(channel, Math.max(0, (day.get(channel) || 0) - users))
    day.set(AI_NAME, (day.get(AI_NAME) || 0) + users)
  }

  // Series order follows the range's own totals, so the biggest channel is
  // first in the legend and in every tooltip.
  const names = [...channels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 6)
  const dates = [...perDate.keys()].sort()
  const points = dates.map((date) => ({
    date,
    values: names.map((name) => perDate.get(date)?.get(name) || 0),
  }))

  // --- the AI tab's grid ---------------------------------------------------
  // Keyed by LABEL, not by host: openai.com and chatgpt.com are one assistant
  // to the person reading it, and two lines with the same name is a bug.
  const aiPerDate = new Map<string, Map<string, number>>()
  for (const row of byAiSourceDate.rows || []) {
    const date = isoDate(row.dimensionValues?.[0]?.value || '')
    const model = aiLabelFor(row.dimensionValues?.[1]?.value || '')
    if (!model) continue
    const users = Number(row.metricValues?.[0]?.value || 0)
    let day = aiPerDate.get(date)
    if (!day) aiPerDate.set(date, (day = new Map()))
    day.set(model, (day.get(model) || 0) + users)
  }
  const aiNames = [...ai.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 6)
  // The SAME date axis as the channel chart, not just the days AI appeared —
  // a series drawn only on its non-zero days is a chart with no gaps in it,
  // which reads as constant traffic.
  const aiPoints = dates.map((date) => ({
    date,
    values: aiNames.map((name) => aiPerDate.get(date)?.get(name) || 0),
  }))

  // --- pages ---------------------------------------------------------------
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

  const aiPageUsers = new Map<string, number>()
  const aiPageTop = new Map<string, { name: string; users: number }>()
  for (const row of byAiPage.rows || []) {
    const page = row.dimensionValues?.[0]?.value || '/'
    const model = aiLabelFor(row.dimensionValues?.[1]?.value || '')
    if (!model) continue
    const users = Number(row.metricValues?.[0]?.value || 0)
    aiPageUsers.set(page, (aiPageUsers.get(page) || 0) + users)
    const best = aiPageTop.get(page)
    if (!best || users > best.users) aiPageTop.set(page, { name: model, users })
  }
  const aiPageTotal = [...aiPageUsers.values()].reduce((a, b) => a + b, 0)
  const aiTopPages = [...aiPageUsers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([page, users]) => ({
      page,
      users,
      share: shareOf(users, aiPageTotal),
      topModel: aiPageTop.get(page)?.name || '—',
    }))

  return {
    activeUsers,
    sessions,
    daily,
    series: bucketPoints(points, names),
    channels: rank(channels, channelTotal, 8),
    aiSources: rank(ai, aiUsers, 8),
    aiUsers,
    aiSessions,
    aiSeries: bucketPoints(aiPoints, aiNames),
    aiTopPages,
    topPages,
  }
}

export interface SearchReport {
  /** Days actually queried — below the range asked for when Search Console's
   *  16-month limit clamped it. */
  days?: number
  clamped?: boolean
  clicks: number
  impressions: number
  /** Weighted by impressions, which is how Search Console itself computes it. */
  averagePosition: number
  daily: Array<{ date: string; clicks: number; impressions: number; position: number }>
  /** Clicks and impressions per bucket, for the Google tab's chart. */
  series: TrafficSeries
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
  range: RangeKey = DEFAULT_RANGE
): Promise<SearchReport> {
  /* CLAMPED, NOT PASSED THROUGH. Search Console keeps 16 months and answers a
     longer window with an error rather than with what it has, so "All time"
     asked of it verbatim returns nothing at all — an empty half of the page
     with no explanation. The report says which window it actually got. */
  const days = Math.min(rangeDays(range), GSC_MAX_DAYS)
  const end = new Date()
  const start = new Date(end.getTime() - Math.max(days - 1, 0) * 86400000)
  // Search Console runs two to three days behind. The range still ends today
  // — asking for less would just hide the lag — but the page says so, because
  // "the last two days look dead" is otherwise a support call every week.
  const window = { startDate: ymd(start), endDate: ymd(end) }

  const [byDate, byCountry, byPage, byQuery] = await Promise.all([
    searchQuery(siteUrl, { ...window, dimensions: ['date'], rowLimit: 1000 }),
    searchQuery(siteUrl, { ...window, dimensions: ['country'], rowLimit: 25 }),
    searchQuery(siteUrl, { ...window, dimensions: ['page'], rowLimit: 25 }),
    searchQuery(siteUrl, { ...window, dimensions: ['query'], rowLimit: 25 }),
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

  /* Impressions dwarf clicks — a 90-day window here is 1,667 against
     246,713 — so on one axis the clicks line is flat along the bottom. Both
     are in the series because the tooltip should read out both; the tab hides
     impressions by default so the line that matters is the one drawn. */
  const searchSeries = bucketPoints(
    daily.map((d) => ({ date: d.date, values: [d.clicks, d.impressions] })),
    ['Clicks', 'Impressions']
  )

  return {
    days,
    clamped: days < rangeDays(range),
    clicks,
    impressions,
    averagePosition,
    daily,
    series: searchSeries,
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

/**
 * The SHAPE of what gets stored. Bump it whenever a field is added, removed
 * or given a different meaning.
 *
 * WHY THIS EXISTS. The report is cached as JSON for six hours, so a deploy
 * that adds a field is followed by six hours of stored rows that do not have
 * it — and the page renders from the row, not from the code that wrote it.
 * Adding the per-channel series did exactly that: every cached row still held
 * the old shape, the chart destructured a field that was not there, and the
 * admin page went blank with a client-side exception. A stale row is a
 * refetch; an out-of-date row was an outage.
 *
 * Old rows are treated as stale rather than deleted, so a Google outage on
 * the day of a deploy still leaves something to show.
 */
const SNAPSHOT_VERSION = 2

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
export async function refreshSiteAnalytics(
  clientId: string,
  range: RangeKey = DEFAULT_RANGE
): Promise<SiteAnalytics> {
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
      traffic = await fetchTraffic(client.ga4PropertyId, range)
    } catch (err) {
      errors.push(`Analytics: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }
  if (client.searchConsoleSiteUrl) {
    try {
      search = await fetchSearchPerformance(client.searchConsoleSiteUrl, range)
    } catch (err) {
      errors.push(`Search Console: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }

  const error = errors.length ? errors.join(' · ') : null
  const fetchedAt = new Date()
  try {
    // Only overwrite the half that actually came back — a Search Console
    // outage must not blank out working Analytics numbers.
    /* ONE ROW PER CLIENT PER RANGE. The alternative — refetching all six on
       every refresh — spends six times the quota to warm windows nobody
       opened, and a single row keyed by client alone would serve last week's
       question to whoever asked this week's. */
    const existing = await prisma.siteTrafficSnapshot.findUnique({
      where: { clientId_range: { clientId, range } },
    })
    // The half that failed keeps its previous value ONLY if that value is the
    // current shape; otherwise it is dropped, because carrying an old-shaped
    // half forward under a current-shape stamp is the original bug wearing a
    // version number.
    const keep = (existing?.version ?? 1) === SNAPSHOT_VERSION
    const data = {
      fetchedAt,
      version: SNAPSHOT_VERSION,
      traffic: (traffic ?? (keep ? existing?.traffic : null) ?? null) as object | null,
      search: (search ?? (keep ? existing?.search : null) ?? null) as object | null,
      error,
    }
    await prisma.siteTrafficSnapshot.upsert({
      where: { clientId_range: { clientId, range } },
      create: { clientId, range, ...data } as never,
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
export async function getSiteAnalytics(
  clientId: string,
  range: RangeKey = DEFAULT_RANGE
): Promise<SiteAnalytics> {
  const snapshot = await prisma.siteTrafficSnapshot
    .findUnique({ where: { clientId_range: { clientId, range } } })
    .catch(() => null)

  const currentShape = (snapshot?.version ?? 1) === SNAPSHOT_VERSION
  const fresh =
    snapshot &&
    currentShape &&
    Date.now() - new Date(snapshot.fetchedAt).getTime() < STALE_AFTER_MS
  if (fresh) {
    return {
      traffic: (snapshot.traffic as unknown as TrafficReport) ?? null,
      search: (snapshot.search as unknown as SearchReport) ?? null,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      error: snapshot.error,
    }
  }

  const refreshed = await refreshSiteAnalytics(clientId, range).catch((err) => ({
    traffic: null,
    search: null,
    fetchedAt: null,
    error: err instanceof Error ? err.message : 'Refresh failed',
  }))
  // A refresh that produced nothing falls back to whatever was stored, so a
  // transient failure does not empty a page that worked an hour ago.
  if (!refreshed.traffic && !refreshed.search && snapshot && currentShape) {
    return {
      traffic: (snapshot.traffic as unknown as TrafficReport) ?? null,
      search: (snapshot.search as unknown as SearchReport) ?? null,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      error: refreshed.error || snapshot.error,
    }
  }
  return refreshed
}
