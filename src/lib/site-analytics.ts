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
  /** `partial` marks a bucket covering fewer days than the rest. */
  points: Array<{ date: string; endDate?: string; values: number[]; partial?: boolean }>
}

/** The same figures for the immediately preceding window of equal length. */
export interface TrafficPrevious {
  activeUsers: number
  sessions: number
  organicUsers: number
  aiUsers: number
  /** False when the property has less history than the comparison window. */
  comparable: boolean
}

export interface NamedCount {
  name: string
  value: number
  share: number
}

export interface TrafficReport {
  activeUsers: number
  sessions: number
  /** Users whose session Google filed as Organic Search — the SEO number. */
  organicUsers: number
  /** Same window, one period earlier. Null when there is nothing to compare. */
  previous: TrafficPrevious | null
  /** Days the window actually covered, for the "N days" line. */
  windowDays: number
  /** Total per bucket, for anything that wants one line. */
  daily: DayPoint[]
  /** Per channel per bucket, for the chart and its tooltip. */
  series: TrafficSeries
  channels: NamedCount[]
  /** Who actually sent them, by name — yelp.com, facebook.com, google. */
  topSources: NamedCount[]
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

/**
 * GA4's own words for "nobody told us".
 *
 * `(direct)` is what it stores when a visit carried no referrer at all, and
 * `(not set)` when it could not work one out. Printed raw in a list headed
 * "who sent people to your site" they read as faults in our product.
 */
function sourceLabel(source: string): string {
  const raw = (source || '').trim().toLowerCase()
  if (!raw || raw === '(direct)' || raw === '(none)') return 'Typed in, or a saved link'
  if (raw === '(not set)') return "Couldn't be identified"
  return raw
}

/**
 * Google's channel vocabulary, in a shop owner's words.
 *
 * `sessionDefaultChannelGroup` is written for analysts: "Organic Search",
 * "Cross-network", "Unassigned". An auto glass owner does not know what any
 * of those mean, "Unassigned" reads as a fault in our product, and "Direct" —
 * often the biggest bar — is the one that most needs explaining, because it
 * is where the AI referrals the floor caveat mentions actually land.
 *
 * The LABEL only. Every number is untouched, and anything unmapped falls
 * through as Google wrote it.
 */
const CHANNEL_LABELS: Record<string, string> = {
  'Organic Search': 'Google & other search',
  'Paid Search': 'Paid ads',
  'Direct': 'Typed in, or a saved link',
  'Referral': 'Links on other sites',
  'Organic Social': 'Social posts',
  'Paid Social': 'Paid social ads',
  'Organic Video': 'Video',
  'Email': 'Email',
  'Display': 'Display ads',
  'Cross-network': 'Google ads across sites',
  'Unassigned': "Couldn't be identified",
  'AI Search': 'AI assistants',
}

export function channelLabel(name: string): string {
  return CHANNEL_LABELS[name] ?? name
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
  /* BUCKETED FROM THE END, not the start.
     Chunking forward leaves the remainder at the RIGHT-HAND EDGE, so a
     365-day range ends in a bucket holding a single day drawn at full-week
     scale — a near-vertical drop to nothing that reads as "our traffic just
     collapsed". Nobody reads a date range off a cliff. Running backwards puts
     the short bucket at the start, where it is the oldest data rather than
     the newest, and it is flagged so the chart can mark it. */
  const weeks: TrafficSeries['points'] = []
  for (let end = points.length; end > 0; end -= 7) {
    const chunk = points.slice(Math.max(0, end - 7), end)
    weeks.unshift({
      date: chunk[0].date,
      endDate: chunk[chunk.length - 1].date,
      values: names.map((_, n) => chunk.reduce((sum, p) => sum + (p.values[n] || 0), 0)),
      ...(chunk.length < 7 ? { partial: true } : {}),
    })
  }
  return { bucket: 'week', names, points: weeks }
}

/** Every ISO date from start to end inclusive. */
function dateSpan(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const cursor = new Date(`${startISO}T12:00:00Z`)
  const last = new Date(`${endISO}T12:00:00Z`)
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/**
 * Fill in the days the API did not return.
 *
 * NEITHER API SENDS A ROW FOR A DAY WITH NO TRAFFIC. Plotting only the rows
 * that came back spaces them evenly, so a fortnight's silence renders the
 * same width as a day's, and week buckets built by counting rows drift out of
 * phase with the calendar — two adjacent "weeks" spanning nine days and
 * twelve, drawn identically. A zero day is data.
 */
function densify(
  rows: Map<string, number[]>,
  dates: string[],
  width: number
): Array<{ date: string; values: number[] }> {
  return dates.map((date) => ({ date, values: rows.get(date) ?? new Array(width).fill(0) }))
}

/**
 * A GA4 dimension filter matching the same hosts `aiLabelFor` matches.
 *
 * BUILT FROM THE SAME RULE AS THE CLASSIFIER, deliberately. These were an
 * exact-match `inListFilter` over ten apex hosts while the totals used a
 * suffix match — so `chat.openai.com` and `www.perplexity.ai` counted in the
 * tile and vanished from the chart and the table underneath it. "Sent by AI:
 * 41" above a flat-zero chart reads as a broken page, and it was.
 */
const AI_SOURCE_FILTER = {
  orGroup: {
    expressions: AI_SOURCES.flatMap((s) => [
      { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: s.match } } },
      {
        filter: {
          fieldName: 'sessionSource',
          stringFilter: { matchType: 'ENDS_WITH', value: `.${s.match}` },
        },
      },
    ]),
  },
}

/** GA4 windows: N COMPLETE days, ending yesterday. */
function ga4Window(days: number) {
  // `endDate: 'today'` put a partial day on the end of every range — always
  // low, always the last point on the chart, and on the All traffic tab with
  // no lag disclosure to explain it. "Last 1 day" meant "however much of today
  // has happened", served for up to six hours from the cache.
  return { startDate: `${days}daysAgo`, endDate: 'yesterday' }
}

export async function fetchTraffic(
  propertyId: string,
  range: RangeKey = DEFAULT_RANGE
): Promise<TrafficReport> {
  const days = rangeDays(range)
  /* TWO WINDOWS IN ONE REQUEST. GA4 accepts up to four dateRanges and returns
     a `dateRange` dimension naming which one each row belongs to, so the
     comparison costs no extra call. The previous window is the equal-length
     one immediately before, which is the only comparison a shop owner can
     check against their own memory. */
  const current = ga4Window(days)
  const previous = { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }
  const dateRanges = [
    { ...current, name: 'current' },
    { ...previous, name: 'previous' },
  ]
  const oneRange = [current]

  const [totals, byDate, byDateChannel, byAiDate, bySource, byAiSourceDate, byPage, byAiPage] =
    await Promise.all([
      /* THE HEADLINE, FROM A REPORT WITH NO BREAKDOWN.
         activeUsers is de-duplicated WITHIN each row, so summing 90 daily
         rows counts a returning visitor once per day they came back — a shop
         with 200 real people read as 500. It is person-days, and it was
         printed under "People on your site" on a page whose subtitle promises
         nothing is estimated. Only a report with no dimensions gives unique
         users for the period; sessions are additive either way. */
      runReport(propertyId, {
        dateRanges,
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      }),
      runReport(propertyId, {
        dateRanges: oneRange,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 2000,
      }),
      // The chart, on SESSIONS. activeUsers cannot be partitioned: subtracting
      // a de-duplicated metric from another is not arithmetic, which is why
      // the AI subtraction below needed a clamp at zero to stay positive.
      // Sessions are session-scoped and split cleanly under a session filter.
      runReport(propertyId, {
        dateRanges: oneRange,
        dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 50000,
      }),
      runReport(propertyId, {
        dateRanges: oneRange,
        dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: AI_SOURCE_FILTER,
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 50000,
      }),
      // Totals by channel and source, both windows, for the breakdown and the
      // organic/AI comparison figures.
      runReport(propertyId, {
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        limit: 20000,
      }),
      runReport(propertyId, {
        dateRanges: oneRange,
        dimensions: [{ name: 'date' }, { name: 'sessionSource' }],
        metrics: [{ name: 'activeUsers' }],
        dimensionFilter: AI_SOURCE_FILTER,
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 50000,
      }),
      // Which page BROUGHT THEM IN, not every page anyone scrolled to. The
      // panel has always been titled "which pages bring the most people in";
      // pagePath answered a different question.
      runReport(propertyId, {
        dateRanges: oneRange,
        dimensions: [{ name: 'landingPagePlusQueryString' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 300,
      }),
      runReport(propertyId, {
        dateRanges: oneRange,
        dimensions: [{ name: 'landingPagePlusQueryString' }, { name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: AI_SOURCE_FILTER,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 300,
      }),
    ])

  // --- headline totals, per window ----------------------------------------
  // With two dateRanges GA4 appends a `dateRange` dimension value naming the
  // window, so the rows have to be told apart rather than summed.
  const totalFor = (name: string) => {
    const row = (totals.rows || []).find(
      (r) => (r.dimensionValues?.[0]?.value ?? 'date_range_0') === name
    )
    return {
      activeUsers: Number(row?.metricValues?.[0]?.value || 0),
      sessions: Number(row?.metricValues?.[1]?.value || 0),
    }
  }
  const now = totalFor('current')
  const before = totalFor('previous')

  const daily: DayPoint[] = (byDate.rows || []).map((row) => ({
    date: isoDate(row.dimensionValues?.[0]?.value || ''),
    value: Number(row.metricValues?.[0]?.value || 0),
  }))

  // --- breakdown, and the same figures one window earlier ------------------
  const channels = new Map<string, number>()
  const sources = new Map<string, number>()
  const ai = new Map<string, number>()
  let aiSessions = 0
  let organicUsers = 0
  let prevOrganicUsers = 0
  let prevAiUsers = 0
  for (const row of bySource.rows || []) {
    const window = row.dimensionValues?.[2]?.value ?? 'current'
    const channel = row.dimensionValues?.[0]?.value || 'Unassigned'
    const source = row.dimensionValues?.[1]?.value || ''
    const users = Number(row.metricValues?.[0]?.value || 0)
    const aiLabel = aiLabelFor(source)
    if (window === 'previous') {
      if (aiLabel) prevAiUsers += users
      else if (channel === 'Organic Search') prevOrganicUsers += users
      continue
    }
    // An AI referral is a channel of its own here, and it is REMOVED from the
    // channel it would otherwise sit in — GA4 files chatgpt.com under Referral,
    // so counting it in both makes the shares add up to more than everything.
    if (aiLabel) {
      ai.set(aiLabel, (ai.get(aiLabel) || 0) + users)
      channels.set('AI Search', (channels.get('AI Search') || 0) + users)
      aiSessions += Number(row.metricValues?.[1]?.value || 0)
    } else {
      channels.set(channel, (channels.get(channel) || 0) + users)
      if (channel === 'Organic Search') organicUsers += users
    }
    /* WHO SENT THEM, BY NAME. "Referral: 415" is a bucket; "yelp.com 120,
       facebook.com 88" is a list of places the shop can recognise and act on
       — the same reason the lead alert prints the tagged link verbatim rather
       than title-casing it. Free: this row was already fetched for the
       channel breakdown. */
    sources.set(sourceLabel(source), (sources.get(sourceLabel(source)) || 0) + users)
  }
  const channelTotal = [...channels.values()].reduce((a, b) => a + b, 0)
  const aiUsers = [...ai.values()].reduce((a, b) => a + b, 0)

  // --- the chart's grid ----------------------------------------------------
  const AI_NAME = 'AI Search'
  const OTHER_NAME = 'Everything else'
  const perDate = new Map<string, Map<string, number>>()
  const cell = (date: string) => {
    let row = perDate.get(date)
    if (!row) perDate.set(date, (row = new Map()))
    return row
  }
  for (const row of byDateChannel.rows || []) {
    const date = isoDate(row.dimensionValues?.[0]?.value || '')
    const channel = row.dimensionValues?.[1]?.value || 'Unassigned'
    cell(date).set(channel, (cell(date).get(channel) || 0) + Number(row.metricValues?.[0]?.value || 0))
  }
  for (const row of byAiDate.rows || []) {
    const date = isoDate(row.dimensionValues?.[0]?.value || '')
    const channel = row.dimensionValues?.[1]?.value || 'Unassigned'
    const visits = Number(row.metricValues?.[0]?.value || 0)
    const day = cell(date)
    // Moved, not added: out of whatever GA4 filed it under, into AI Search.
    day.set(channel, Math.max(0, (day.get(channel) || 0) - visits))
    day.set(AI_NAME, (day.get(AI_NAME) || 0) + visits)
  }

  // Six named series plus a real "Everything else", so the tooltip's total is
  // the day's total rather than the total of whatever happens to be drawn.
  const ranked = [...channels.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  const named = ranked.slice(0, 6)
  const rest = new Set(ranked.slice(6))
  const hasRest = rest.size > 0
  const names = hasRest ? [...named, OTHER_NAME] : named

  const span = dateSpan(
    daily[0]?.date ?? [...perDate.keys()].sort()[0] ?? '',
    daily[daily.length - 1]?.date ?? [...perDate.keys()].sort().pop() ?? ''
  )
  const grid = new Map<string, number[]>()
  for (const [date, row] of perDate) {
    const values = names.map((name) =>
      name === OTHER_NAME
        ? [...row.entries()].reduce((sum, [k, v]) => (rest.has(k) ? sum + v : sum), 0)
        : row.get(name) || 0
    )
    grid.set(date, values)
  }
  const points = densify(grid, span.length ? span : [...perDate.keys()].sort(), names.length)

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
  const aiGrid = new Map<string, number[]>()
  for (const [date, row] of aiPerDate) {
    aiGrid.set(date, aiNames.map((name) => row.get(name) || 0))
  }
  // The SAME date axis as the channel chart — a series drawn only on the days
  // it appeared has no gaps in it, which reads as constant traffic.
  const aiPoints = densify(aiGrid, span.length ? span : [...perDate.keys()].sort(), aiNames.length)

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
  /* SHARE OF THE PERIOD'S VISITS, not of the listed rows. The denominator
     used to be the sum of the top 300 page rows, so it was neither visitors
     nor page views nor anything a reader could name, and the listed shares
     could not add to 100 by construction. Landing-page sessions do sum to the
     period's sessions, so this share means what the column header says. */
  const topPages = [...pageUsers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([page, users]) => ({
      page,
      users,
      share: shareOf(users, now.sessions),
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

  /* NO COMPARISON AGAINST A WINDOW THE SITE DID NOT EXIST FOR. A property
     with three months of history compared against the three months before it
     would report a triumphant increase over zero. Nothing at all in the
     previous window is treated as "no comparison" rather than "up 100%". */
  const comparable = before.activeUsers > 0 || before.sessions > 0

  return {
    activeUsers: now.activeUsers,
    sessions: now.sessions,
    organicUsers,
    windowDays: days,
    previous: comparable
      ? {
          activeUsers: before.activeUsers,
          sessions: before.sessions,
          organicUsers: prevOrganicUsers,
          aiUsers: prevAiUsers,
          comparable: true,
        }
      : null,
    daily,
    series: bucketPoints(points, names),
    channels: rank(channels, channelTotal, 8),
    topSources: rank(sources, [...sources.values()].reduce((a, b) => a + b, 0), 10),
    aiSources: rank(ai, aiUsers, 8),
    aiUsers,
    aiSessions,
    aiSeries: bucketPoints(aiPoints, aiNames),
    aiTopPages,
    topPages,
  }
}

// ------------------------------------------------- searching for them BY NAME

/**
 * Words that belong to the TRADE, not to a business.
 *
 * The branded/non-branded split lives or dies on this list. Almost every
 * client is "<something> Auto Glass", so treating each word of the name as a
 * brand term would file "auto glass near me" as a branded search and report
 * that nobody new ever finds them — the exact opposite of the truth, in the
 * one figure the whole panel exists to produce.
 *
 * Generic business suffixes are here for the same reason: "Auto Glass Now"
 * would otherwise make "windshield repair now" a branded search.
 */
const TRADE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'of', 'for', 'to', 'my', 'your',
  'auto', 'autos', 'automotive', 'car', 'cars', 'truck', 'trucks', 'vehicle',
  'glass', 'windshield', 'windshields', 'windscreen', 'window', 'windows',
  'repair', 'repairs', 'replacement', 'replace', 'calibration', 'tint', 'tinting',
  'mobile', 'shop', 'shops', 'store', 'center', 'centre', 'centers', 'garage',
  'service', 'services', 'company', 'co', 'inc', 'llc', 'ltd', 'corp', 'group',
  'solutions', 'specialist', 'specialists', 'expert', 'experts', 'pro', 'pros',
  'plus', 'now', 'one', 'best', 'top', 'quality', 'affordable', 'cheap',
  'discount', 'local', 'fast', 'quick', 'same', 'day', 'usa', 'us', 'inc',
])

/**
 * A term or a query, reduced to the letters and digits in it.
 *
 * MATCHED ON THE FOLDED FORM, deliberately. A shop called "A-1 Auto Glass" is
 * typed "a1 auto glass", "a 1 autoglass" and "a-1 autoglass" by real people,
 * and "Bob's" loses its apostrophe about half the time. Comparing the raw
 * strings misses all of those, and a MISSED brand term is the dangerous
 * direction: it files a search for the shop's own name as a stranger finding
 * them, which flatters the service. Folding can over-match instead (a term
 * "kings" inside "parkings"), and that understates the win, which is the error
 * worth making.
 */
export function foldTerm(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * What "they searched for this shop by name" means when nobody has said.
 *
 * The whole business name, plus each of its DISTINCTIVE words — the ones that
 * are not trade vocabulary — plus the domain label, because people search a
 * business by its web address. An operator can replace the lot; this is only
 * the starting point, and it is shown to them rather than applied invisibly.
 */
export function defaultBrandTerms(
  businessName: string | null | undefined,
  siteLabel?: string | null
): string[] {
  const terms = new Set<string>()
  const name = (businessName || '').trim()
  if (name) terms.add(name.toLowerCase())
  /* SPLIT ON SPACES, THEN FOLD — not the other way round. Splitting on every
     non-letter makes "Bob's" into "bob" and "s", and a three-letter fragment
     is dropped by the length floor below, so the only term left was the whole
     phrase and a search for "bob's windshield" read as a stranger. An
     apostrophe is punctuation inside a word, not a word boundary. */
  for (const word of name.toLowerCase().split(/\s+/)) {
    const token = foldTerm(word)
    // Four characters, so an initial or a house number cannot become the rule
    // that decides half the panel.
    if (token.length >= 4 && !TRADE_WORDS.has(token)) terms.add(token)
  }
  const host = (siteLabel || '').replace(/^www\./, '').split('.')[0]
  if (host && host.length >= 4 && !TRADE_WORDS.has(host)) terms.add(host)
  return [...terms]
}

/** The stored value, or the derived default when it is empty. Never empty. */
export function brandTermsFor(
  stored: string | null | undefined,
  businessName: string | null | undefined,
  siteLabel?: string | null
): string[] {
  const typed = (stored || '')
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  return typed.length ? typed : defaultBrandTerms(businessName, siteLabel)
}

/** Does this search contain the shop's name? */
export function isBrandedQuery(query: string, terms: string[]): boolean {
  const folded = foldTerm(query)
  if (!folded) return false
  return terms.some((term) => {
    const t = foldTerm(term)
    return !!t && folded.includes(t)
  })
}

export interface SearchPrevious {
  clicks: number
  impressions: number
  averagePosition: number
}

export interface BrandSplit {
  /** The terms that decided it, so the reader can check the rule. */
  terms: string[]
  brandedClicks: number
  brandedImpressions: number
  nonBrandedClicks: number
  nonBrandedImpressions: number
  /** The same window, one period earlier. Null when there is nothing before. */
  previousNonBrandedClicks: number | null
  /** How many distinct searches were on each side. */
  brandedQueries: number
  nonBrandedQueries: number
}

/**
 * How many searches the site sits in each band of the results page.
 *
 * A BETTER HEADLINE THAN AVERAGE POSITION, which gets WORSE as a site starts
 * ranking for more things — a winning month reads as a losing one. A count of
 * page-one terms only moves one way.
 */
export interface PositionBand {
  label: string
  /** Plain words for what the band is, since "1–3" is jargon on its own. */
  hint: string
  count: number
  previousCount: number | null
}

export interface QueryMove {
  query: string
  clicks: number
  before: number
  impressions: number
  position: number
}

export interface QueryMovers {
  gained: QueryMove[]
  lost: QueryMove[]
  /** Searches with no impressions at all in the previous window. */
  fresh: Array<{ query: string; clicks: number; impressions: number; position: number }>
  /** True when a previous window was actually fetched and had rows. */
  comparable: boolean
}

export interface SearchReport {
  /** Days actually queried — below the range asked for when Search Console's
   *  16-month limit clamped it. */
  days?: number
  clamped?: boolean
  /** Days that came back with data. Google runs 2-3 days behind, so a 7-day
   *  window routinely covers 4 — and the tiles said "Last 7 days" anyway. */
  coveredDays?: number
  previous?: SearchPrevious | null
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
  /** Strangers vs people who already knew the name. */
  brand?: BrandSplit | null
  /** Page-one counts, which move the way the work does. */
  bands?: PositionBand[]
  /** What changed against the previous window, search by search. */
  movers?: QueryMovers | null
  /** Distinct searches Google named, and their share of all clicks. The three
   *  sections above are computed over these rows, not over the site total —
   *  Google withholds rare queries, so they do not add up to it. */
  namedQueries?: number
  namedClicks?: number
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

/**
 * How many query rows to ask for.
 *
 * The panels underneath — branded vs not, the position bands, what moved —
 * are all arithmetic over the SAME rows, so one big fetch answers three
 * questions that would otherwise be six filtered calls. An auto glass shop
 * ranks for a few hundred terms; 5000 is headroom, not an expectation.
 */
const QUERY_ROWS = 5000

/**
 * Where on the results page a search sits, in bands somebody can act on.
 *
 * The boundaries are the ones people already think in — the top three
 * results, the rest of page one, page two, and past that.
 */
const BANDS: Array<{ label: string; hint: string; max: number }> = [
  { label: 'Top 3', hint: 'the first three results', max: 3.5 },
  { label: 'Rest of page one', hint: 'still on the first page', max: 10.5 },
  { label: 'Page two', hint: 'one scroll further', max: 20.5 },
  { label: 'Page three or worse', hint: 'almost nobody looks here', max: Infinity },
]

function bandIndex(position: number): number {
  return BANDS.findIndex((b) => position <= b.max)
}

export async function fetchSearchPerformance(
  siteUrl: string,
  range: RangeKey = DEFAULT_RANGE,
  brandTerms: string[] = []
): Promise<SearchReport> {
  /* CLAMPED, NOT PASSED THROUGH. Search Console keeps 16 months and answers a
     longer window with an error rather than with what it has, so "All time"
     asked of it verbatim returns nothing at all — an empty half of the page
     with no explanation. The report says which window it actually got. */
  const days = Math.min(rangeDays(range), GSC_MAX_DAYS)
  const end = new Date()
  const start = new Date(end.getTime() - Math.max(days - 1, 0) * 86400000)
  const window = { startDate: ymd(start), endDate: ymd(end) }
  // The equal-length window immediately before this one.
  const prevEnd = new Date(start.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - Math.max(days - 1, 0) * 86400000)
  const prevWindow = { startDate: ymd(prevStart), endDate: ymd(prevEnd) }

  const [summary, prevSummary, byDate, byCountry, byPage, byQuery, prevByQuery] = await Promise.all([
    /* THE TOTALS AS SEARCH CONSOLE ITSELF COMPUTES THEM. Deriving the average
       position from the daily rows meant weighting values that had already
       been rounded to one decimal for display, so the tile could disagree
       with Google's own by a tenth — on a page whose whole claim is that the
       numbers are Google's. A dimensionless query answers it exactly. */
    searchQuery(siteUrl, { ...window }),
    searchQuery(siteUrl, { ...prevWindow }),
    searchQuery(siteUrl, { ...window, dimensions: ['date'], rowLimit: 1000 }),
    searchQuery(siteUrl, { ...window, dimensions: ['country'], rowLimit: 25 }),
    searchQuery(siteUrl, { ...window, dimensions: ['page'], rowLimit: 25 }),
    /* EVERY QUERY, not the top 25. Four panels read these rows and none of
       them can be answered from a leaderboard: the branded split needs the
       long tail (that IS the non-branded half), the position bands are a
       census, and "what moved" needs the searches that are not yet big enough
       to chart. One call, four answers. */
    searchQuery(siteUrl, { ...window, dimensions: ['query'], rowLimit: QUERY_ROWS }),
    searchQuery(siteUrl, { ...prevWindow, dimensions: ['query'], rowLimit: QUERY_ROWS }),
  ])

  const total = summary.rows?.[0]
  const clicks = total?.clicks ?? 0
  const impressions = total?.impressions ?? 0
  const averagePosition = Math.round((total?.position ?? 0) * 10) / 10

  const prevTotal = prevSummary.rows?.[0]
  const previous =
    prevTotal && (prevTotal.clicks || prevTotal.impressions)
      ? {
          clicks: prevTotal.clicks ?? 0,
          impressions: prevTotal.impressions ?? 0,
          averagePosition: Math.round((prevTotal.position ?? 0) * 10) / 10,
        }
      : null

  const daily = (byDate.rows || []).map((row) => ({
    date: row.keys?.[0] || '',
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    position: Math.round((row.position || 0) * 10) / 10,
  }))

  const countryClicks = new Map<string, number>()
  for (const row of byCountry.rows || []) {
    countryClicks.set((row.keys?.[0] || '').toUpperCase(), row.clicks || 0)
  }

  /* Impressions dwarf clicks — a 90-day window here is 1,667 against
     246,713 — so on one axis the clicks line is flat along the bottom. Both
     are in the series because the tooltip should read out both; the tab hides
     impressions by default so the line that matters is the one drawn. */
  // --- everything that reads the query census ------------------------------
  interface Q {
    query: string
    clicks: number
    impressions: number
    position: number
  }
  const asQueries = (res: GscResponse): Q[] =>
    (res.rows || [])
      .map((row) => ({
        query: row.keys?.[0] || '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        position: row.position || 0,
      }))
      .filter((q) => !!q.query)

  const queries = asQueries(byQuery)
  const prevQueries = asQueries(prevByQuery)
  const namedClicks = queries.reduce((sum, q) => sum + q.clicks, 0)

  const terms = brandTerms.filter(Boolean)
  let brand: BrandSplit | null = null
  if (terms.length && queries.length) {
    const split = { b: [0, 0, 0], n: [0, 0, 0] }
    for (const q of queries) {
      const side = isBrandedQuery(q.query, terms) ? split.b : split.n
      side[0] += q.clicks
      side[1] += q.impressions
      side[2] += 1
    }
    const prevNonBranded = prevQueries.length
      ? prevQueries.reduce(
          (sum, q) => (isBrandedQuery(q.query, terms) ? sum : sum + q.clicks),
          0
        )
      : null
    brand = {
      terms,
      brandedClicks: split.b[0],
      brandedImpressions: split.b[1],
      brandedQueries: split.b[2],
      nonBrandedClicks: split.n[0],
      nonBrandedImpressions: split.n[1],
      nonBrandedQueries: split.n[2],
      previousNonBrandedClicks: prevNonBranded,
    }
  }

  const countBands = (rows: Q[]): number[] => {
    const counts = new Array(BANDS.length).fill(0)
    for (const q of rows) {
      const i = bandIndex(q.position)
      if (i >= 0) counts[i] += 1
    }
    return counts
  }
  const nowBands = countBands(queries)
  const beforeBands = prevQueries.length ? countBands(prevQueries) : null
  const bands: PositionBand[] = BANDS.map((b, i) => ({
    label: b.label,
    hint: b.hint,
    count: nowBands[i],
    previousCount: beforeBands ? beforeBands[i] : null,
  }))

  /* WHAT MOVED, which is the closest thing to proof of work on this page.
     Matched on the query string itself — the only key Search Console gives —
     so a search that changed wording is a new one and an old one at once.
     That is a property of the data, not a bug to paper over. */
  const before = new Map(prevQueries.map((q) => [q.query, q]))
  const changes = queries
    .map((q) => ({ ...q, before: before.get(q.query)?.clicks ?? 0 }))
    .filter((q) => q.clicks !== q.before)
  const movers: QueryMovers | null = prevQueries.length
    ? {
        gained: changes
          .filter((q) => q.clicks > q.before)
          .sort((a, b) => b.clicks - b.before - (a.clicks - a.before))
          .slice(0, 10)
          .map((q) => ({
            query: q.query,
            clicks: q.clicks,
            before: q.before,
            impressions: q.impressions,
            position: Math.round(q.position * 10) / 10,
          })),
        /* THE LOSSES TOO. A panel that only ever shows gains is one a shop
           stops believing the first time they notice it never shows anything
           else — the same reason the monthly report prints an empty month
           rather than skipping it. Drawn from the same rows, so it costs
           nothing but the nerve. */
        lost: changes
          .filter((q) => q.clicks < q.before)
          .sort((a, b) => a.clicks - a.before - (b.clicks - b.before))
          .slice(0, 5)
          .map((q) => ({
            query: q.query,
            clicks: q.clicks,
            before: q.before,
            impressions: q.impressions,
            position: Math.round(q.position * 10) / 10,
          })),
        /* NEW SEARCHES NEED A FLOOR. A single impression is as likely to be
           one person's typo as a term the site has started ranking for, and a
           list of those reads as noise beside the ones that matter. */
        fresh: queries
          .filter((q) => !before.has(q.query) && (q.clicks > 0 || q.impressions >= 5))
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
          .slice(0, 10)
          .map((q) => ({
            query: q.query,
            clicks: q.clicks,
            impressions: q.impressions,
            position: Math.round(q.position * 10) / 10,
          })),
        comparable: true,
      }
    : null

  const dense = daily.length
    ? densify(
        new Map(daily.map((d) => [d.date, [d.clicks, d.impressions]])),
        dateSpan(daily[0].date, daily[daily.length - 1].date),
        2
      )
    : []
  const searchSeries = bucketPoints(dense, ['Clicks', 'Impressions'])

  return {
    days,
    clamped: days < rangeDays(range),
    coveredDays: daily.length,
    previous,
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
    // Sliced from the census rather than fetched again — the API orders by
    // clicks already, but slicing here keeps the leaderboard and the panels
    // underneath it reading the same rows.
    topQueries: [...queries]
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 25)
      .map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        position: Math.round(q.position * 10) / 10,
      })),
    brand,
    bands,
    movers,
    namedQueries: queries.length,
    namedClicks,
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
const SNAPSHOT_VERSION = 3

/**
 * The fields the current renderer actually reads.
 *
 * BELT AND BRACES BESIDE THE VERSION NUMBER, because the version number is
 * hand-maintained and was forgotten within the hour of being introduced.
 * `organicUsers` and `previous` shipped under version 2, so every stored row
 * kept passing as current and the page printed a confident "0" under "From
 * Google search" for a figure nobody had measured — on a page whose subtitle
 * promises nothing is estimated. A missing number reading as zero is worse
 * than a missing number reading as missing.
 *
 * A shape check cannot be forgotten: add a field, and any row without it is
 * refetched on the next read. Presence, not truthiness — `brand: null` is a
 * measured answer.
 */
const REQUIRED_TRAFFIC_KEYS = [
  'activeUsers',
  'sessions',
  'organicUsers',
  'previous',
  'series',
  'channels',
  'topSources',
  'topPages',
  'aiSeries',
  'aiTopPages',
] as const

const REQUIRED_SEARCH_KEYS = [
  'clicks',
  'impressions',
  'series',
  'topQueries',
  'topPages',
  'brand',
  'bands',
  'movers',
] as const

function hasShape(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object') return false
  return keys.every((key) => key in (value as Record<string, unknown>))
}

/** Is this stored row the shape the code reading it expects? */
function snapshotIsCurrent(snapshot: {
  version?: number | null
  traffic?: unknown
  search?: unknown
}): boolean {
  if ((snapshot.version ?? 1) !== SNAPSHOT_VERSION) return false
  // A null half is "we have nothing", not "we have an old shape".
  if (snapshot.traffic && !hasShape(snapshot.traffic, REQUIRED_TRAFFIC_KEYS)) return false
  if (snapshot.search && !hasShape(snapshot.search, REQUIRED_SEARCH_KEYS)) return false
  return true
}

export interface SiteAnalytics {
  /** The older of the two halves — what the staleness banner should report. */
  oldestFetchedAt?: string | null
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
      select: {
        ga4PropertyId: true,
        searchConsoleSiteUrl: true,
        brandTerms: true,
        businessName: true,
      },
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
      search = await fetchSearchPerformance(
        client.searchConsoleSiteUrl,
        range,
        brandTermsFor(
          client.brandTerms,
          client.businessName,
          siteLabelFrom(client.searchConsoleSiteUrl)
        )
      )
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
    const keep = !!existing && snapshotIsCurrent(existing)
    /* A HALF WITH NO PROPERTY BEHIND IT IS DROPPED, not carried.
       When ga4PropertyId is cleared, fetchTraffic is never called, `traffic`
       stays null, and the old merge kept the previous JSON forever — a
       disconnected property reporting indefinitely. Carrying it forward is
       only ever right while the association still exists. */
    const carryTraffic = keep && !!client.ga4PropertyId
    const carrySearch = keep && !!client.searchConsoleSiteUrl
    const data = {
      fetchedAt,
      version: SNAPSHOT_VERSION,
      traffic: (traffic ?? (carryTraffic ? existing?.traffic : null) ?? null) as object | null,
      search: (search ?? (carrySearch ? existing?.search : null) ?? null) as object | null,
      /* ONE TIMESTAMP PER HALF. A single fetchedAt was rewritten on every run
         even when only one side succeeded, so a banner reading "these numbers
         stopped updating, last read today" sat above five-day-old traffic —
         reporting the age of the half that still worked. */
      trafficFetchedAt: traffic ? fetchedAt : carryTraffic ? (existing?.trafficFetchedAt ?? null) : null,
      searchFetchedAt: search ? fetchedAt : carrySearch ? (existing?.searchFetchedAt ?? null) : null,
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
    oldestFetchedAt: fetchedAt.toISOString(),
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
/** The age of the STALEST half, which is what a "stopped updating" line means. */
function oldestOf(snapshot: {
  fetchedAt: Date
  trafficFetchedAt: Date | null
  searchFetchedAt: Date | null
}): string {
  const stamps = [snapshot.trafficFetchedAt, snapshot.searchFetchedAt].filter(
    (d): d is Date => !!d
  )
  if (!stamps.length) return new Date(snapshot.fetchedAt).toISOString()
  return new Date(Math.min(...stamps.map((d) => d.getTime()))).toISOString()
}

export async function getSiteAnalytics(
  clientId: string,
  range: RangeKey = DEFAULT_RANGE
): Promise<SiteAnalytics> {
  const snapshot = await prisma.siteTrafficSnapshot
    .findUnique({ where: { clientId_range: { clientId, range } } })
    .catch(() => null)

  const currentShape = !!snapshot && snapshotIsCurrent(snapshot)
  const fresh =
    snapshot &&
    currentShape &&
    Date.now() - new Date(snapshot.fetchedAt).getTime() < STALE_AFTER_MS
  if (fresh) {
    return {
      traffic: (snapshot.traffic as unknown as TrafficReport) ?? null,
      search: (snapshot.search as unknown as SearchReport) ?? null,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      oldestFetchedAt: oldestOf(snapshot),
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
      oldestFetchedAt: oldestOf(snapshot),
      error: refreshed.error || snapshot.error,
    }
  }
  return refreshed
}
