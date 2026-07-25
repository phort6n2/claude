// ============================================
// DIRECTORY ↔ AGMP funnel links (shop-facing only)
// ============================================
// The one rule: covert on the demand side, transparent on the supply side.
// These are used ONLY on shop-owner-facing surfaces (claim, for-shops, owner
// dashboard) — never on consumer pages. Values are NEXT_PUBLIC_ so client
// components can read them; all have safe defaults.

export const AGMP_SITE_URL =
  process.env.NEXT_PUBLIC_AGMP_SITE_URL || 'https://autoglassmarketingpros.com'

/**
 * AGMP's bare audit tool. Prefer AGMP_RANK_URL / rankUrl() for anything with
 * rank context — /rank continues the rank-reveal narrative and then hands off
 * to the audit, where linking /audit directly restarts the pitch.
 */
export const AGMP_AUDIT_URL =
  process.env.NEXT_PUBLIC_AGMP_AUDIT_URL || `${AGMP_SITE_URL}/audit`

/**
 * AGMP's dedicated landing page for WRHQ traffic. This is THE handoff point for
 * every "improve my ranking" CTA. It adapts to the rank we pass (top-3 =
 * retention angle, 4+ = the wedge, no params = generic fallback) and carries
 * utm_source=windshieldrepairhq through to the audit, so AGMP can attribute
 * conversions back to the directory.
 */
export const AGMP_RANK_URL =
  process.env.NEXT_PUBLIC_AGMP_RANK_URL || `${AGMP_SITE_URL}/rank`

/** AGMP's methodology page — a trust asset for owners researching the approach. */
export const AGMP_FRAMEWORK_URL = `${AGMP_SITE_URL}/framework`

/** AGMP's "Directory Placement" service page — what Featured actually gets you. */
export const AGMP_DIRECTORY_SERVICE_URL = `${AGMP_SITE_URL}/services/directory`

/**
 * Build the AGMP /rank handoff for a specific shop. Every param is optional —
 * a bare link still renders AGMP's generic fallback — but passing rank/city
 * personalizes the headline and is what makes the handoff feel continuous.
 */
export function rankUrl(opts?: {
  rank?: number
  of?: number
  city?: string
  shop?: string
}): string {
  const u = new URL(AGMP_RANK_URL)
  if (opts?.rank != null) u.searchParams.set('rank', String(opts.rank))
  if (opts?.of != null) u.searchParams.set('of', String(opts.of))
  if (opts?.city) u.searchParams.set('city', opts.city)
  if (opts?.shop) u.searchParams.set('shop', opts.shop)
  return u.toString()
}

/**
 * Deep-link to the Framework stage matching a shop's position, per the brief:
 * unranked → invisible, rank 4+ → visible, top 3 → growing.
 */
export function frameworkStageUrl(rank?: number): string {
  if (rank == null) return `${AGMP_FRAMEWORK_URL}#invisible`
  if (rank > 3) return `${AGMP_FRAMEWORK_URL}#visible`
  return `${AGMP_FRAMEWORK_URL}#growing`
}

/** "Text Matt" contact for the upsell CTAs. */
export const AGMP_PHONE_DISPLAY = '(855) 712-8500'
export const AGMP_PHONE_TEL = '+18557128500'

export const FEATURED_PRICE_DISPLAY = '$7/mo'

/**
 * Stripe Payment Link for the $7/mo Featured tier. Empty until the operator
 * sets NEXT_PUBLIC_STRIPE_FEATURED_LINK — callers fall back to a "Text Matt"
 * CTA so nothing looks broken before Stripe is connected.
 */
const STRIPE_FEATURED_LINK = process.env.NEXT_PUBLIC_STRIPE_FEATURED_LINK || ''

export function featuredEnabled(): boolean {
  return !!STRIPE_FEATURED_LINK
}

/**
 * Build the Stripe checkout URL for a specific shop. `client_reference_id`
 * carries the shop slug through to the webhook (which grants Featured);
 * `prefilled_email` pre-fills the buyer's email. Returns null if no link is set.
 */
export function featuredCheckoutUrl(slug: string, email?: string): string | null {
  if (!STRIPE_FEATURED_LINK) return null
  const u = new URL(STRIPE_FEATURED_LINK)
  if (slug) u.searchParams.set('client_reference_id', slug)
  if (email) u.searchParams.set('prefilled_email', email)
  return u.toString()
}
