import { prisma } from '@/lib/db'

/**
 * Google Ads conversion tracking for a client's hosted site.
 *
 * The rule everything here follows: no configured conversion ID means no tag.
 * We do not load gtag "just in case", we do not fall back to a platform-level
 * account, and a half-configured row (ID but no lead label) reports nothing —
 * a conversion fired at the wrong action pollutes the bidding data it was
 * supposed to inform, and that is harder to notice and to undo than silence.
 */

export interface AdsTracking {
  conversionId: string
  /** Full send_to value for a form lead, or null when unconfigured. */
  leadSendTo: string | null
  /** Value to report with a lead, when the action defines one. */
  leadValue: number | null
  leadCurrency: string | null
  /**
   * "Calls from a website": Google swaps this number on the page for a
   * forwarding number and reports the calls itself. Null when calls are
   * reported somewhere else (HighLevel), which is a normal configuration.
   */
  callSendTo: string | null
  callPhoneNumber: string | null
  enhancedConversions: boolean
  /** Microsoft Advertising UET tag id, when Bing is configured. */
  bingUetTagId: string | null
  /** Event goal action name that Microsoft matches the lead against. */
  bingLeadEventAction: string | null
}

/** "AW-123456789" — anything else is a typo we refuse to emit. */
function isConversionId(value: string): boolean {
  return /^AW-[0-9]+$/.test(value.trim())
}

export async function getAdsTracking(clientId: string): Promise<AdsTracking | null> {
  // The table ships as hand-run SQL; a missing table means no tracking, not a
  // broken page.
  const row = await prisma.clientAdsTracking.findUnique({ where: { clientId } }).catch(() => null)
  if (!row) return null

  // Microsoft stands alone: a client can run Bing without Google, so this is
  // resolved independently of the Google block below.
  const bingUetTagId = /^\d{6,12}$/.test((row.bingUetTagId || '').trim())
    ? (row.bingUetTagId as string).trim()
    : null
  const bingLeadEventAction = bingUetTagId
    ? (row.bingLeadEventAction || '').trim() || 'submit_lead_form'
    : null

  const empty = {
    conversionId: '',
    leadSendTo: null,
    leadValue: null,
    leadCurrency: null,
    callSendTo: null,
    callPhoneNumber: null,
    enhancedConversions: row.enhancedConversions,
    bingUetTagId,
    bingLeadEventAction,
  }

  if (!row.conversionId) return bingUetTagId ? empty : null

  const conversionId = row.conversionId.trim()
  if (!isConversionId(conversionId)) return bingUetTagId ? empty : null

  const label = (value: string | null) => {
    const trimmed = (value || '').trim()
    return trimmed ? `${conversionId}/${trimmed}` : null
  }

  const leadSendTo = label(row.leadConversionLabel)
  // A call action without its number cannot swap anything, so it is treated
  // as unconfigured rather than emitted half-formed.
  const callSendTo = row.callPhoneNumber ? label(row.callConversionLabel) : null

  // An ID with no lead label can still legitimately exist — a client who only
  // reports calls from the page — but an ID with neither has nothing to
  // report, so there is no reason to load the tag at all.
  if (!leadSendTo && !callSendTo) return bingUetTagId ? empty : null

  return {
    conversionId,
    leadSendTo,
    leadValue: row.leadValue,
    leadCurrency: row.leadCurrency,
    callSendTo,
    callPhoneNumber: callSendTo ? row.callPhoneNumber : null,
    enhancedConversions: row.enhancedConversions,
    bingUetTagId,
    bingLeadEventAction,
  }
}
