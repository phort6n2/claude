// ============================================
// DIRECTORY ↔ AGMP funnel links (shop-facing only)
// ============================================
// The one rule: covert on the demand side, transparent on the supply side.
// These are used ONLY on shop-owner-facing surfaces (claim, for-shops, owner
// dashboard) — never on consumer pages. Values are NEXT_PUBLIC_ so client
// components can read them; all have safe defaults.

/** AGMP's live audit tool (the shared handoff point). */
export const AGMP_AUDIT_URL =
  process.env.NEXT_PUBLIC_AGMP_AUDIT_URL || 'https://autoglassmarketingpros.com/audit'

export const AGMP_SITE_URL =
  process.env.NEXT_PUBLIC_AGMP_SITE_URL || 'https://autoglassmarketingpros.com'

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
