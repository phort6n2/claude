import type { Prisma } from '@prisma/client'

/**
 * Shared eligibility rules for Google Ads enhanced-conversion sync.
 *
 * Two behaviours live here so the cron, the manual bulk-sync, and the
 * "unsynced" list all agree:
 *
 * 1. Age gate — Google rejects any conversion whose click is younger than
 *    6 hours ("click too recent"). We defer the first upload until a lead is at
 *    least MIN_CONVERSION_AGE old so fresh leads don't error and get retried.
 *
 * 2. Permanent-error skip — some Google errors never succeed on retry (the
 *    click has aged past the 90-day / conversion window, or the account isn't
 *    accessible under the manager account). Leads whose last sync error matches
 *    one of these are dropped from automatic retries so we stop hammering a dead
 *    backlog. Transient or already-fixed errors (e.g. "click too recent",
 *    one-per-click, "could not be decoded") are deliberately NOT listed — those
 *    can still succeed and must keep retrying.
 */

// Substrings of Google Ads errors that will not recover on retry.
export const PERMANENT_SYNC_ERROR_MARKERS = [
  'click-through window', // "...click occurred before this conversion's click-through window"
  'too old', // identifiers / iOS URL parameters older than 90 days
  "don't have access", // wrong Google Ads account for the click
  'PERMISSION_DENIED', // manager account can't access the customer
]

export function isPermanentSyncError(message?: string | null): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return PERMANENT_SYNC_ERROR_MARKERS.some((m) => lower.includes(m.toLowerCase()))
}

// Google rejects clicks younger than 6 hours; wait 7h (6h + buffer).
export const MIN_CONVERSION_AGE_MS = 7 * 60 * 60 * 1000

/**
 * Prisma WHERE for leads eligible for automatic enhanced-conversion sync:
 * within the lookback window, not yet sent, at least MIN_CONVERSION_AGE old,
 * carrying an email or phone, and not already failed with a permanent error.
 */
export function eligibleLeadWhere(lookbackDays: number): Prisma.LeadWhereInput {
  const now = Date.now()
  const startDate = new Date(now - lookbackDays * 24 * 60 * 60 * 1000)
  const maxCreatedAt = new Date(now - MIN_CONVERSION_AGE_MS)

  return {
    createdAt: { gte: startDate, lte: maxCreatedAt },
    enhancedConversionSent: false,
    AND: [
      { OR: [{ email: { not: null } }, { phone: { not: null } }] },
      {
        NOT: {
          OR: PERMANENT_SYNC_ERROR_MARKERS.map((m) => ({
            googleSyncError: { contains: m, mode: 'insensitive' as const },
          })),
        },
      },
    ],
  }
}
