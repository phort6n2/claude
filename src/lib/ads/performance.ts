/**
 * Campaign-performance / ROAS engine.
 *
 * The edge here is truth: Google reports its own conversions and
 * conversionsValue, but that's Google grading its own homework. For each client
 * we pull live campaign performance from the Google Ads API AND join the real
 * outcomes we've booked in our own database (canonical leads, SOLD leads, and
 * summed sale revenue). That lets us compute a TRUE ROAS — real booked revenue
 * over ad spend — alongside Google's self-reported figures, plus honest
 * cost-per-lead and cost-per-sale.
 *
 * Everything is read-only. DB-derived fields always populate; the Google Ads
 * API call degrades gracefully — if it errors for one client we still return
 * that client with `apiError` set and every DB-derived field intact, so one
 * broken account never breaks the whole dashboard.
 */

import { prisma } from '@/lib/db'
import { getCampaignPerformance } from '@/lib/google-ads'

/** How a campaign is constrained on the search network, from impression share. */
export type CampaignConstraint = 'budget-limited' | 'rank-limited' | 'ok'

export interface CampaignPerformance {
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
  /** budget-limited if losing >10% IS to budget; else rank-limited if >20% to rank. */
  constraint: CampaignConstraint
}

export interface ClientPerformance {
  clientId: string
  clientName: string
  slug: string
  customerId: string | null
  connected: boolean

  // Spend + Google-reported outcomes (from the Ads API)
  spend: number
  googleConversions: number
  googleConversionsValue: number

  // Real outcomes booked in our own database (last 30 days)
  realLeads: number
  realSales: number
  realRevenue: number

  // Derived efficiency metrics
  costPerLead: number
  costPerSale: number
  /** TRUE ROAS = real booked revenue / spend. The number that actually matters. */
  trueRoas: number

  campaigns: CampaignPerformance[]
  apiError?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

// Impression-share loss thresholds (values are 0..1 fractions from the API).
const BUDGET_LOST_THRESHOLD = 0.1
const RANK_LOST_THRESHOLD = 0.2

function classifyConstraint(
  searchBudgetLostIS: number,
  searchRankLostIS: number
): CampaignConstraint {
  if (searchBudgetLostIS > BUDGET_LOST_THRESHOLD) return 'budget-limited'
  if (searchRankLostIS > RANK_LOST_THRESHOLD) return 'rank-limited'
  return 'ok'
}

interface ClientGoogleAdsWithClient {
  clientId: string
  customerId: string
  client: { businessName: string; slug: string }
}

/**
 * Build the performance summary for a single client's Google Ads config.
 */
async function buildClientPerformance(
  config: ClientGoogleAdsWithClient
): Promise<ClientPerformance> {
  const since30 = daysAgo(30)

  // ---- Real outcomes from our own database (always available) --------------
  const [realLeads, soldAgg] = await Promise.all([
    prisma.lead.count({
      where: {
        clientId: config.clientId,
        duplicateOfLeadId: null,
        createdAt: { gte: since30 },
      },
    }),
    prisma.lead.aggregate({
      where: {
        clientId: config.clientId,
        status: 'SOLD',
        saleDate: { gte: since30 },
      },
      _count: { id: true },
      _sum: { saleValue: true },
    }),
  ])

  const realSales = soldAgg._count.id
  const realRevenue = soldAgg._sum.saleValue || 0

  // ---- Live campaign performance from Google Ads (best-effort) -------------
  const perfRes = await getCampaignPerformance(config.customerId).catch((e) => ({
    success: false as const,
    error: e instanceof Error ? e.message : 'Unknown error',
  }))

  let campaigns: CampaignPerformance[] = []
  let apiError: string | undefined
  let spend = 0
  let googleConversions = 0
  let googleConversionsValue = 0

  if (perfRes.success && 'campaigns' in perfRes && perfRes.campaigns) {
    campaigns = perfRes.campaigns.map((c) => ({
      ...c,
      constraint: classifyConstraint(c.searchBudgetLostIS, c.searchRankLostIS),
    }))
    for (const c of campaigns) {
      spend += c.cost
      googleConversions += c.conversions
      googleConversionsValue += c.conversionsValue
    }
  } else {
    apiError = ('error' in perfRes && perfRes.error) || 'Could not read campaign performance from Google Ads.'
  }

  return {
    clientId: config.clientId,
    clientName: config.client.businessName,
    slug: config.client.slug,
    customerId: config.customerId,
    connected: true,
    spend,
    googleConversions,
    googleConversionsValue,
    realLeads,
    realSales,
    realRevenue,
    costPerLead: realLeads > 0 ? spend / realLeads : 0,
    costPerSale: realSales > 0 ? spend / realSales : 0,
    trueRoas: spend > 0 ? realRevenue / spend : 0,
    campaigns,
    apiError,
  }
}

/**
 * Build the performance summary across every client with a Google Ads config
 * (or a single client when `clientId` is provided). Sorted by spend, desc.
 */
export async function getClientPerformance(clientId?: string): Promise<ClientPerformance[]> {
  const configs = await prisma.clientGoogleAds.findMany({
    where: clientId ? { clientId } : { isActive: true },
    include: { client: { select: { businessName: true, slug: true } } },
  })

  const results = await Promise.all(
    configs.map((c) =>
      buildClientPerformance(c as unknown as ClientGoogleAdsWithClient).catch((e) => ({
        clientId: c.clientId,
        clientName: c.client.businessName,
        slug: c.client.slug,
        customerId: c.customerId,
        connected: false,
        spend: 0,
        googleConversions: 0,
        googleConversionsValue: 0,
        realLeads: 0,
        realSales: 0,
        realRevenue: 0,
        costPerLead: 0,
        costPerSale: 0,
        trueRoas: 0,
        campaigns: [],
        apiError: e instanceof Error ? e.message : 'Failed to load performance',
      }))
    )
  )

  // Biggest spenders first — the accounts with the most on the line float up.
  return results.sort((a, b) => b.spend - a.spend)
}
