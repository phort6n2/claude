/**
 * Account-hygiene audit engine.
 *
 * For each client with a Google Ads account, this runs a set of checks that
 * answer "is this account set up so that Smart Bidding can actually work?" It
 * covers two things:
 *   - SETUP correctness  (conversion actions mapped + live, Customer Match,
 *                          GA4 link — the levers the Google rep flagged)
 *   - SIGNAL quality      (are we capturing gclids, sending enhanced + offline
 *                          conversions, and are the sale VALUES real and varied)
 *
 * Everything is read-only. DB-derived checks always run; Google Ads API checks
 * degrade to `unknown` if the API errors for an account, so one broken account
 * never fails the whole audit.
 */

import { prisma } from '@/lib/db'
import {
  getConversionActionSettings,
  listCustomerMatchLists,
  getAccountMetrics,
} from '@/lib/google-ads'

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'unknown'
export type CheckCategory = 'setup' | 'signal' | 'bidding'

export interface HygieneCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
  recommendation?: string
  category: CheckCategory
}

export interface ClientHygiene {
  clientId: string
  clientName: string
  slug: string
  customerId: string | null
  connected: boolean
  score: number // 0-100, weighted across pass/warn/fail checks
  checks: HygieneCheck[]
  apiError?: string
}

// Smart Bidding volume thresholds (conversions / 30 days). Sourced from Google
// guidance: target-based strategies need meaningful data before they help.
const TCPA_MIN_CONVERSIONS = 15
const TROAS_MIN_CONVERSIONS = 50

// gclid capture: below this share of leads carrying a Google click id, tracking
// is probably misconfigured (or traffic is largely non-paid — hence a warn, not
// a hard fail).
const GCLID_CAPTURE_WARN = 0.5
const GCLID_CAPTURE_FAIL = 0.25

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

function pct(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

/** Weighted score: pass=1, warn=0.5, fail=0. info/unknown are excluded. */
function scoreChecks(checks: HygieneCheck[]): number {
  const scored = checks.filter((c) =>
    c.status === 'pass' || c.status === 'warn' || c.status === 'fail'
  )
  if (scored.length === 0) return 0
  const total = scored.reduce((sum, c) => {
    if (c.status === 'pass') return sum + 1
    if (c.status === 'warn') return sum + 0.5
    return sum
  }, 0)
  return Math.round((total / scored.length) * 100)
}

interface ClientGoogleAdsWithClient {
  clientId: string
  customerId: string
  formConversionActionId: string | null
  callConversionActionId: string | null
  saleConversionActionId: string | null
  lastSyncAt: Date | null
  lastError: string | null
  client: { businessName: string; slug: string }
}

/**
 * Run the full audit for a single client's Google Ads config.
 */
export async function auditClient(
  config: ClientGoogleAdsWithClient
): Promise<ClientHygiene> {
  const checks: HygieneCheck[] = []
  const since30 = daysAgo(30)
  const since90 = daysAgo(90)

  // ---- DB-derived lead/signal aggregates (always available) ----------------
  const clickIdFilter = {
    OR: [
      { gclid: { not: null } },
      { gbraid: { not: null } },
      { wbraid: { not: null } },
    ],
  }

  const [
    leads30,
    leadsWithClickId30,
    leadsWithContact30,
    enhancedSent30,
    soldLeads90,
    unsentSales,
  ] = await Promise.all([
    prisma.lead.count({
      where: { clientId: config.clientId, duplicateOfLeadId: null, createdAt: { gte: since30 } },
    }),
    prisma.lead.count({
      where: {
        clientId: config.clientId,
        duplicateOfLeadId: null,
        createdAt: { gte: since30 },
        ...clickIdFilter,
      },
    }),
    prisma.lead.count({
      where: {
        clientId: config.clientId,
        duplicateOfLeadId: null,
        createdAt: { gte: since30 },
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      },
    }),
    prisma.lead.count({
      where: {
        clientId: config.clientId,
        createdAt: { gte: since30 },
        enhancedConversionSent: true,
      },
    }),
    prisma.lead.findMany({
      where: {
        clientId: config.clientId,
        status: 'SOLD',
        saleValue: { not: null },
        saleDate: { gte: since90 },
      },
      select: { saleValue: true, offlineConversionSent: true },
    }),
    prisma.lead.count({
      where: {
        clientId: config.clientId,
        status: 'SOLD',
        saleValue: { gt: 0 },
        offlineConversionSent: false,
      },
    }),
  ])

  // ---- Check: conversion actions mapped ------------------------------------
  const hasLeadAction = !!(config.formConversionActionId || config.callConversionActionId)
  const hasSaleAction = !!config.saleConversionActionId
  checks.push({
    id: 'conversion_actions_mapped',
    label: 'Conversion actions mapped',
    category: 'setup',
    status: hasLeadAction && hasSaleAction ? 'pass' : hasLeadAction || hasSaleAction ? 'warn' : 'fail',
    detail:
      `Form/call action: ${hasLeadAction ? 'set' : 'missing'} · ` +
      `Sale action: ${hasSaleAction ? 'set' : 'missing'}`,
    recommendation:
      hasLeadAction && hasSaleAction
        ? undefined
        : 'Map form/call and sale conversion actions for this client so leads and offline sales import into Google Ads.',
  })

  // ---- Check: gclid / click-id capture -------------------------------------
  const clickRate = pct(leadsWithClickId30, leads30)
  checks.push({
    id: 'gclid_capture',
    label: 'Google click ID capture',
    category: 'signal',
    status:
      leads30 === 0
        ? 'info'
        : clickRate >= GCLID_CAPTURE_WARN
          ? 'pass'
          : clickRate >= GCLID_CAPTURE_FAIL
            ? 'warn'
            : 'fail',
    detail:
      leads30 === 0
        ? 'No leads in the last 30 days.'
        : `${leadsWithClickId30}/${leads30} leads (${Math.round(clickRate * 100)}%) captured a gclid/gbraid/wbraid.`,
    recommendation:
      leads30 > 0 && clickRate < GCLID_CAPTURE_WARN
        ? 'Low click-ID capture can mean the tracking template or website tags are broken — offline conversions need the gclid. Verify the Google Ads tracking template and site tracking.'
        : undefined,
  })

  // ---- Check: enhanced-conversion data (contactability) --------------------
  const contactRate = pct(leadsWithContact30, leads30)
  checks.push({
    id: 'enhanced_conversion_data',
    label: 'Enhanced-conversion data (email/phone)',
    category: 'signal',
    status: leads30 === 0 ? 'info' : contactRate >= 0.8 ? 'pass' : contactRate >= 0.5 ? 'warn' : 'fail',
    detail:
      leads30 === 0
        ? 'No leads in the last 30 days.'
        : `${leadsWithContact30}/${leads30} leads (${Math.round(contactRate * 100)}%) have an email or phone; ${enhancedSent30} enhanced conversions sent.`,
    recommendation:
      leads30 > 0 && contactRate < 0.8
        ? 'Capture email or phone on more leads — enhanced conversions hash these to recover conversions lost to cookie limits.'
        : undefined,
  })

  // ---- Check: offline conversion sync health -------------------------------
  const soldCount = soldLeads90.length
  const syncedCount = soldLeads90.filter((l) => l.offlineConversionSent).length
  checks.push({
    id: 'offline_conversion_sync',
    label: 'Offline conversion sync',
    category: 'signal',
    status:
      soldCount === 0
        ? 'info'
        : config.lastError
          ? 'fail'
          : unsentSales > 0
            ? 'warn'
            : 'pass',
    detail:
      soldCount === 0
        ? 'No sales recorded in the last 90 days.'
        : `${syncedCount}/${soldCount} sales synced to Google` +
          (unsentSales > 0 ? ` · ${unsentSales} unsent` : '') +
          (config.lastSyncAt ? ` · last sync ${config.lastSyncAt.toISOString().slice(0, 10)}` : '') +
          (config.lastError ? ` · error: ${config.lastError.slice(0, 120)}` : ''),
    recommendation:
      config.lastError
        ? 'The last conversion sync errored — resolve it so sale values reach Smart Bidding.'
        : unsentSales > 0
          ? 'Some sales have not been uploaded as offline conversions yet.'
          : undefined,
  })

  // ---- Check: conversion VALUE quality (research lever #1) ------------------
  const saleValues = soldLeads90.map((l) => l.saleValue as number).filter((v) => v > 0)
  const distinctValues = new Set(saleValues).size
  const zeroValueCount = soldLeads90.length - saleValues.length
  checks.push({
    id: 'conversion_value_quality',
    label: 'Conversion value quality',
    category: 'signal',
    status:
      soldCount === 0
        ? 'info'
        : zeroValueCount > 0 || distinctValues <= 1
          ? 'warn'
          : 'pass',
    detail:
      soldCount === 0
        ? 'No sales recorded in the last 90 days.'
        : `${saleValues.length} sales with value · ${distinctValues} distinct value(s)` +
          (zeroValueCount > 0 ? ` · ${zeroValueCount} zero/blank` : ''),
    recommendation:
      soldCount > 0 && (zeroValueCount > 0 || distinctValues <= 1)
        ? 'Value-based bidding needs multiple distinct, non-zero conversion values. Upload true sale amounts and assign a proxy value to qualified calls (e.g. avg job value × close rate).'
        : undefined,
  })

  // ---- Google Ads API checks (best-effort; degrade to unknown) -------------
  let apiError: string | undefined

  const [actionsRes, matchRes, metricsRes] = await Promise.all([
    getConversionActionSettings(config.customerId).catch((e) => ({
      success: false as const,
      error: e instanceof Error ? e.message : 'Unknown error',
    })),
    listCustomerMatchLists(config.customerId).catch((e) => ({
      success: false as const,
      error: e instanceof Error ? e.message : 'Unknown error',
    })),
    getAccountMetrics(config.customerId, 'LAST_30_DAYS').catch((e) => ({
      success: false as const,
      error: e instanceof Error ? e.message : 'Unknown error',
    })),
  ])

  // Check: sale conversion action live + tracks value
  if (actionsRes.success && 'actions' in actionsRes && actionsRes.actions) {
    const actions = actionsRes.actions
    const saleAction = config.saleConversionActionId
      ? actions.find((a) => a.id === config.saleConversionActionId)
      : undefined
    const anyEnabledValueAction = actions.some(
      (a) => a.status === 'ENABLED' && !a.alwaysUseDefaultValue
    )
    checks.push({
      id: 'sale_action_tracks_value',
      label: 'Sale action live & value-tracking',
      category: 'setup',
      status: !hasSaleAction
        ? 'info'
        : saleAction
          ? saleAction.status === 'ENABLED' && !saleAction.alwaysUseDefaultValue
            ? 'pass'
            : 'warn'
          : 'fail',
      detail: !hasSaleAction
        ? 'No sale conversion action mapped to check.'
        : saleAction
          ? `Status ${saleAction.status}` +
            (saleAction.alwaysUseDefaultValue ? ' · uses a fixed default value' : ' · uses variable value')
          : `Mapped sale action ${config.saleConversionActionId} not found in this account` +
            (anyEnabledValueAction ? ' (a value-tracking action does exist — remap it).' : '.'),
      recommendation:
        hasSaleAction && (!saleAction || saleAction.alwaysUseDefaultValue)
          ? 'Point the sale conversion action at one that accepts variable values, so real sale amounts drive bidding.'
          : undefined,
    })
  } else {
    apiError = ('error' in actionsRes && actionsRes.error) || apiError
    checks.push({
      id: 'sale_action_tracks_value',
      label: 'Sale action live & value-tracking',
      category: 'setup',
      status: 'unknown',
      detail: 'Could not read conversion actions from Google Ads.',
    })
  }

  // Check: Customer Match list present
  if (matchRes.success && 'lists' in matchRes && matchRes.lists) {
    const lists = matchRes.lists
    const sized = lists.filter((l) => l.sizeForSearch > 0)
    checks.push({
      id: 'customer_match',
      label: 'Customer Match audience',
      category: 'setup',
      status: sized.length > 0 ? 'pass' : lists.length > 0 ? 'warn' : 'fail',
      detail:
        lists.length === 0
          ? 'No Customer Match lists found.'
          : `${lists.length} list(s); ${sized.length} with searchable size.`,
      recommendation:
        sized.length === 0
          ? 'Upload historical customers as a Customer Match list to help Smart Bidding find similar high-value users (a lever your Google rep recommended).'
          : undefined,
    })
  } else {
    checks.push({
      id: 'customer_match',
      label: 'Customer Match audience',
      category: 'setup',
      status: 'unknown',
      detail: 'Could not read audience lists from Google Ads.',
    })
  }

  // Check: Smart Bidding readiness (informational, research lever #2)
  if (metricsRes.success && 'metrics' in metricsRes && metricsRes.metrics) {
    const conv = metricsRes.metrics.conversions
    const readiness =
      conv >= TROAS_MIN_CONVERSIONS
        ? 'Enough volume for value-based (tROAS) bidding, if values are clean.'
        : conv >= TCPA_MIN_CONVERSIONS
          ? 'Enough volume for tCPA / Maximize Conversion Value. Hold tROAS targets until ~50 conv/30d.'
          : 'Below ~15 conv/30d — stay on Maximize Conversions and focus on signal quality, not target-based bidding yet.'
    checks.push({
      id: 'smart_bidding_readiness',
      label: 'Smart Bidding readiness',
      category: 'bidding',
      status: 'info',
      detail: `${conv.toFixed(1)} conversions in the last 30 days. ${readiness}`,
    })
  } else {
    apiError = ('error' in metricsRes && metricsRes.error) || apiError
    checks.push({
      id: 'smart_bidding_readiness',
      label: 'Smart Bidding readiness',
      category: 'bidding',
      status: 'unknown',
      detail: 'Could not read 30-day conversion volume from Google Ads.',
    })
  }

  // Check: GA4 link — not detectable via GAQL, surfaced as a manual verification
  checks.push({
    id: 'ga4_linked',
    label: 'GA4 linked (manual check)',
    category: 'setup',
    status: 'info',
    detail: 'GA4 ↔ Google Ads linking can\'t be verified via the API.',
    recommendation:
      'Confirm this account is linked to GA4 — the Google rep flagged this as a key efficiency lever.',
  })

  return {
    clientId: config.clientId,
    clientName: config.client.businessName,
    slug: config.client.slug,
    customerId: config.customerId,
    connected: true,
    score: scoreChecks(checks),
    checks,
    apiError,
  }
}

/**
 * Run the audit across every client with a Google Ads config.
 */
export async function auditAllClients(clientId?: string): Promise<ClientHygiene[]> {
  const configs = await prisma.clientGoogleAds.findMany({
    where: clientId ? { clientId } : { isActive: true },
    include: { client: { select: { businessName: true, slug: true } } },
  })

  const results = await Promise.all(
    configs.map((c) =>
      auditClient(c as unknown as ClientGoogleAdsWithClient).catch((e) => ({
        clientId: c.clientId,
        clientName: c.client.businessName,
        slug: c.client.slug,
        customerId: c.customerId,
        connected: false,
        score: 0,
        checks: [],
        apiError: e instanceof Error ? e.message : 'Audit failed',
      }))
    )
  )

  // Worst scores first — the accounts that need attention float to the top.
  return results.sort((a, b) => a.score - b.score)
}
