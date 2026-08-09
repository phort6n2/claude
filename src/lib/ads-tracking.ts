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
  /** Full send_to value for a call click, or null when calls aren't reported here. */
  callSendTo: string | null
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
  const callSendTo = label(row.callConversionLabel)

  // An ID with no lead label can still legitimately exist — a client who only
  // reports calls from the page — but an ID with neither label has nothing to
  // report, so there is no reason to load the tag at all.
  if (!leadSendTo && !callSendTo) return null

  return {
    conversionId,
    leadSendTo,
    callSendTo,
    enhancedConversions: row.enhancedConversions,
  }
}
