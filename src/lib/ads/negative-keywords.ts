/**
 * Negative-keyword suggestion engine.
 *
 * Mines each client's search-terms report for two kinds of budget leaks and
 * suggests negatives (read-only — the admin adds them manually):
 *   1. Wasted spend — terms that spent real money with zero conversions.
 *   2. Irrelevant intent — terms matching an auto-glass irrelevance dictionary
 *      (tinting, body work, DIY, jobs, salvage, …) that shouldn't trigger ads.
 *
 * Terms already covered by an existing negative are skipped. Suggestions only
 * fire above small spend/click floors so we never recommend pruning on noise.
 */

import { prisma } from '@/lib/db'
import { getSearchTermsReport, getNegativeKeywordTexts } from '@/lib/google-ads'

// Spend/click floors so we don't suggest cutting a term on 1 click of noise.
const WASTED_SPEND_MIN = 15 // dollars, 0 conversions
const WASTED_CLICKS_MIN = 3
const IRRELEVANT_SPEND_MIN = 1 // any real spend on clearly-irrelevant intent

/**
 * Auto-glass irrelevance dictionary. Multi-word entries match as substrings;
 * single words match on word boundaries to avoid false positives. Each entry is
 * intent an auto-glass shop does NOT want to pay for.
 */
const IRRELEVANT_TRIGGERS = [
  'tint',
  'tinting',
  'body shop',
  'body work',
  'bodywork',
  'dent',
  'bumper',
  'fender',
  'paint',
  'upholstery',
  'vinyl wrap',
  'detailing',
  'diy',
  'how to',
  'do it yourself',
  'repair kit',
  'resin kit',
  'junkyard',
  'salvage',
  'u pull',
  'pick n pull',
  'jobs',
  'hiring',
  'salary',
  'career',
  'apprentice',
  'used windshield',
]

function matchIrrelevant(term: string): string | null {
  const t = term.toLowerCase()
  for (const trigger of IRRELEVANT_TRIGGERS) {
    if (trigger.includes(' ')) {
      if (t.includes(trigger)) return trigger
    } else {
      if (new RegExp(`\\b${trigger}\\b`).test(t)) return trigger
    }
  }
  return null
}

export type SuggestionConfidence = 'high' | 'medium'

export interface NegativeSuggestion {
  term: string
  campaignName: string
  adGroupName: string
  clicks: number
  cost: number
  conversions: number
  reason: string
  trigger: string
  confidence: SuggestionConfidence
}

export interface ClientNegatives {
  clientId: string
  clientName: string
  slug: string
  customerId: string | null
  connected: boolean
  wastedSpend: number
  suggestions: NegativeSuggestion[]
  apiError?: string
}

interface ClientGoogleAdsWithClient {
  clientId: string
  customerId: string
  client: { businessName: string; slug: string }
}

async function analyzeClient(config: ClientGoogleAdsWithClient): Promise<ClientNegatives> {
  const [termsRes, negativesRes] = await Promise.all([
    getSearchTermsReport(config.customerId).catch((e) => ({
      success: false as const,
      error: e instanceof Error ? e.message : 'Unknown error',
    })),
    getNegativeKeywordTexts(config.customerId).catch((e) => ({
      success: false as const,
      error: e instanceof Error ? e.message : 'Unknown error',
    })),
  ])

  const base = {
    clientId: config.clientId,
    clientName: config.client.businessName,
    slug: config.client.slug,
    customerId: config.customerId,
  }

  if (!termsRes.success || !('terms' in termsRes) || !termsRes.terms) {
    return {
      ...base,
      connected: true,
      wastedSpend: 0,
      suggestions: [],
      apiError: ('error' in termsRes && termsRes.error) || 'Could not read search terms',
    }
  }

  const existingNegatives =
    negativesRes.success && 'negatives' in negativesRes && negativesRes.negatives
      ? negativesRes.negatives
      : new Set<string>()

  const suggestions: NegativeSuggestion[] = []

  for (const t of termsRes.terms) {
    const lower = t.term.toLowerCase()
    if (existingNegatives.has(lower)) continue // already excluded

    const irrelevantTrigger = matchIrrelevant(t.term)

    if (irrelevantTrigger && t.cost >= IRRELEVANT_SPEND_MIN) {
      suggestions.push({
        term: t.term,
        campaignName: t.campaignName,
        adGroupName: t.adGroupName,
        clicks: t.clicks,
        cost: t.cost,
        conversions: t.conversions,
        reason: `Matches irrelevant intent "${irrelevantTrigger}" — not glass repair/replacement.`,
        trigger: irrelevantTrigger,
        confidence: 'high',
      })
      continue
    }

    if (t.conversions === 0 && t.cost >= WASTED_SPEND_MIN && t.clicks >= WASTED_CLICKS_MIN) {
      suggestions.push({
        term: t.term,
        campaignName: t.campaignName,
        adGroupName: t.adGroupName,
        clicks: t.clicks,
        cost: t.cost,
        conversions: t.conversions,
        reason: `Spent $${t.cost.toFixed(2)} over ${t.clicks} clicks with 0 conversions (30d).`,
        trigger: 'no-conversions',
        confidence: 'medium',
      })
    }
  }

  suggestions.sort((a, b) => b.cost - a.cost)
  const wastedSpend = suggestions.reduce((s, x) => s + x.cost, 0)

  return { ...base, connected: true, wastedSpend, suggestions }
}

/**
 * Run negative-keyword analysis across all clients (or one).
 */
export async function getNegativeSuggestions(clientId?: string): Promise<ClientNegatives[]> {
  const configs = await prisma.clientGoogleAds.findMany({
    where: clientId ? { clientId } : { isActive: true },
    include: { client: { select: { businessName: true, slug: true } } },
  })

  const results = await Promise.all(
    configs.map((c) =>
      analyzeClient(c as unknown as ClientGoogleAdsWithClient).catch((e) => ({
        clientId: c.clientId,
        clientName: c.client.businessName,
        slug: c.client.slug,
        customerId: c.customerId,
        connected: false,
        wastedSpend: 0,
        suggestions: [],
        apiError: e instanceof Error ? e.message : 'Analysis failed',
      }))
    )
  )

  // Most wasted spend first.
  return results.sort((a, b) => b.wastedSpend - a.wastedSpend)
}
