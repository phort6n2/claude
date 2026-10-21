import { prisma } from '@/lib/db'
import { adsSearch, getAdsCredentials } from '@/lib/google-ads'
import { zoneParts } from '@/lib/tz'
import {
  HISTORY_DAYS,
  addDays,
  type CampaignReportData,
  type DayMetrics,
  type ReportAccount,
  type ReportCampaign,
} from '@/lib/campaign-report'

/**
 * Reads every account under the manager for the admin home page's campaign
 * table. See `campaign-report.ts` for the rules; this file only fetches.
 *
 * EVERY OPEN ACCOUNT UNDER THE MANAGER (enabled or suspended — a cancelled
 * account is closed and cannot serve), not only the ones bound to a client.
 * The question is "is anything I run in Google Ads broken", and an account
 * nobody bound to a client is exactly the one nothing else in this app looks
 * at. A bound account takes the client's name and links to its page.
 *
 * TWO QUERIES PER ACCOUNT, and the second is not redundant: a dated query
 * returns NO ROW for a campaign with no impressions, so an enabled campaign
 * nobody can see — the most important row on the page — would simply not be
 * in it. The undated campaign list is what proves it exists.
 */

/* A few minutes, per server instance. The page is the admin's front door and
   gets reloaded constantly; twenty-odd accounts at two queries each on every
   load is slow and spends API quota for figures Google itself refreshes on
   the order of hours. The Refresh button asks for a fresh read. */
const CACHE_MS = 3 * 60_000
let cache: { at: number; data: CampaignReportData } | null = null

/**
 * Accounts under the manager that are not part of this book and are left OFF
 * the table, at the owner's request. By customer id, never by name: a name is
 * whatever somebody typed into Google Ads and is not unique — there are two
 * Noble Glass accounts, and a name match would also hide a future client that
 * happens to share one. Not read anywhere else; the daily sweeps go by the
 * clients bound here, not by the manager's list.
 */
export const HIDDEN_ACCOUNT_IDS = new Set([
  '9840054401', // Noble Glass
  '3229860947', // Original Noble Glass
  '2592044388', // Windshield Replacement LLC
  '6429115658', // Kley's Hair Salon
  '5267563468', // Precision Window Tint
  '9538840962', // precisionwindshield
])

/** Parallel, but not all at once — the API answers bursts with RESOURCE_EXHAUSTED. */
const CONCURRENCY = 6

const n = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(x) ? x : 0
}
const s = (v: unknown): string => (v == null ? '' : String(v))
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

export function todayIn(timeZone: string): string {
  try {
    const { year, month, day } = zoneParts(new Date(), timeZone)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

interface ManagedAccount {
  customerId: string
  name: string
  currency: string
  timeZone: string
  status: string
}

async function listAccounts(): Promise<{ ok: true; accounts: ManagedAccount[] } | { ok: false; error: string }> {
  const creds = await getAdsCredentials()
  if (!creds) return { ok: false, error: 'Google Ads credentials are not configured.' }
  if (!creds.loginCustomerId) return { ok: false, error: 'Set the manager (MCC) customer ID in Settings.' }
  const res = await adsSearch(
    creds.loginCustomerId,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager,
            customer_client.time_zone, customer_client.currency_code, customer_client.status
     FROM customer_client
     WHERE customer_client.status IN ('ENABLED', 'SUSPENDED') AND customer_client.manager = false`
  )
  if (!res.ok) return res
  const accounts = res.rows
    .map((row) => obj(obj(row).customerClient))
    .filter((c) => c.id && !c.manager && !HIDDEN_ACCOUNT_IDS.has(s(c.id)))
    .map((c) => ({
      customerId: s(c.id),
      name: s(c.descriptiveName) || s(c.id),
      currency: s(c.currencyCode) || 'USD',
      timeZone: s(c.timeZone) || 'America/Denver',
      status: s(c.status) || 'ENABLED',
    }))
  return { ok: true, accounts }
}

async function readAccount(
  account: ManagedAccount,
  client: { id: string; businessName: string } | undefined
): Promise<ReportAccount> {
  const today = todayIn(account.timeZone)
  const base: ReportAccount = {
    customerId: account.customerId,
    name: client?.businessName || account.name,
    clientId: client?.id ?? null,
    currency: account.currency,
    timeZone: account.timeZone,
    status: account.status,
    today,
    campaigns: [],
    error: null,
  }

  const [list, metrics] = await Promise.all([
    adsSearch(
      account.customerId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status,
              campaign.primary_status_reasons, campaign.advertising_channel_type,
              campaign_budget.id, campaign_budget.amount_micros, campaign_budget.explicitly_shared
       FROM campaign
       WHERE campaign.status != 'REMOVED'`
    ),
    // No status filter: a campaign removed mid-window still spent, and the
    // account's total has to be explained by the rows under it.
    adsSearch(
      account.customerId,
      `SELECT campaign.id, campaign.name, campaign.status, segments.date,
              metrics.cost_micros, metrics.impressions, metrics.clicks,
              metrics.interactions, metrics.conversions, metrics.phone_calls
       FROM campaign
       WHERE segments.date BETWEEN '${addDays(today, -HISTORY_DAYS)}' AND '${today}'`
    ),
  ])
  if (!list.ok) return { ...base, error: list.error }
  if (!metrics.ok) return { ...base, error: metrics.error }

  const byId = new Map<string, ReportCampaign>()
  for (const row of list.rows) {
    const c = obj(obj(row).campaign)
    const b = obj(obj(row).campaignBudget)
    const id = s(c.id)
    if (!id) continue
    byId.set(id, {
      id,
      name: s(c.name) || id,
      status: s(c.status) || 'UNKNOWN',
      primaryStatus: s(c.primaryStatus) || null,
      reasons: Array.isArray(c.primaryStatusReasons) ? c.primaryStatusReasons.map(s) : [],
      channel: s(c.advertisingChannelType) || null,
      budgetId: s(b.id) || null,
      // int64 arrives as a string; an absent budget stays absent, not $0.
      budgetMicros: b.amountMicros == null ? null : n(b.amountMicros),
      // Omitted when false — the protobuf rule `biddable` already taught us.
      budgetShared: b.explicitlyShared === true,
      days: {},
    })
  }

  for (const row of metrics.rows) {
    const r = obj(row)
    const c = obj(r.campaign)
    const m = obj(r.metrics)
    const id = s(c.id)
    const date = s(obj(r.segments).date)
    if (!id || !date) continue
    let campaign = byId.get(id)
    if (!campaign) {
      campaign = {
        id,
        name: s(c.name) || id,
        status: s(c.status) || 'REMOVED',
        primaryStatus: null,
        reasons: [],
        channel: null,
        budgetId: null,
        budgetMicros: null,
        budgetShared: false,
        days: {},
      }
      byId.set(id, campaign)
    }
    const day: DayMetrics = [
      n(m.costMicros),
      n(m.impressions),
      n(m.clicks),
      n(m.interactions),
      n(m.conversions),
      n(m.phoneCalls),
    ]
    campaign.days[date] = day
  }

  return { ...base, campaigns: [...byId.values()] }
}

/** customer id → the client bound to that Ads account, for its name and page. */
export async function clientsByCustomerId(): Promise<Map<string, { id: string; businessName: string }>> {
  const bound = await prisma.clientAdsTracking.findMany({
    where: { googleAdsCustomerId: { not: null } },
    select: { googleAdsCustomerId: true, client: { select: { id: true, businessName: true } } },
  })
  const clientFor = new Map<string, { id: string; businessName: string }>()
  for (const b of bound) {
    const id = (b.googleAdsCustomerId || '').replace(/\D/g, '')
    if (id && b.client) clientFor.set(id, b.client)
  }
  return clientFor
}

export async function getCampaignReport(opts: { fresh?: boolean } = {}): Promise<CampaignReportData> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data

  const listed = await listAccounts()
  if (!listed.ok) {
    return { builtAt: new Date().toISOString(), accounts: [], error: listed.error }
  }

  const clientFor = await clientsByCustomerId()
  const accounts = await pool(listed.accounts, CONCURRENCY, (a) => readAccount(a, clientFor.get(a.customerId)))
  accounts.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

  const data: CampaignReportData = { builtAt: new Date().toISOString(), accounts, error: null }
  cache = { at: Date.now(), data }
  return data
}
