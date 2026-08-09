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
}

/** "AW-123456789" — anything else is a typo we refuse to emit. */
function isConversionId(value: string): boolean {
  return /^AW-[0-9]+$/.test(value.trim())
}

export async function getAdsTracking(clientId: string): Promise<AdsTracking | null> {
  // The table ships as hand-run SQL; a missing table means no tracking, not a
  // broken page.
  const row = await prisma.clientAdsTracking.findUnique({ where: { clientId } }).catch(() => null)
  if (!row?.conversionId) return null

  const conversionId = row.conversionId.trim()
  if (!isConversionId(conversionId)) return null

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
  if (!leadSendTo && !callSendTo) return null

  return {
    conversionId,
    leadSendTo,
    leadValue: row.leadValue,
    leadCurrency: row.leadCurrency,
    callSendTo,
    callPhoneNumber: callSendTo ? row.callPhoneNumber : null,
    enhancedConversions: row.enhancedConversions,
  }
}
