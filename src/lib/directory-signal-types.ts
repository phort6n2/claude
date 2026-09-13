// ============================================
// DIRECTORY SIGNALS — the names and what they mean
// ============================================
// A LEAF MODULE, imported by both the server library and the admin list.
//
// It exists for the same reason google-ads-conversion-setup.ts does:
// directory-signals.ts reaches Prisma and node:crypto, and a client component
// cannot import that. Without this split the list would either pull server
// code into the browser bundle or, more likely, grow its own second copy of
// these labels — and a copy is how the email and the screen end up describing
// the same event differently.

export const SIGNAL_TYPES = [
  'shop.claimed',
  'shop.listing_submitted',
  'shop.published',
  'shop.featured',
  'shop.rank_dropped',
  'shop.audit_click',
] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

/**
 * How each event reads in a list, and whether it is worth interrupting someone.
 *
 * HOT means a human took an action that costs them something — money, or the
 * effort of filling in a form with their phone number on it. WARM is a
 * condition that changed around them. The distinction is what keeps the email
 * meaning something: a rank slipping one place at 3am is not a reason to look
 * at your phone, and a shop paying for Featured is.
 */
export const SIGNAL_META: Record<SignalType, { label: string; hot: boolean; why: string }> = {
  'shop.claimed': {
    label: 'Claimed their listing',
    hot: true,
    why: 'They filled in a form with their name and number on it. The warmest signal the directory produces.',
  },
  'shop.featured': {
    label: 'Bought Featured',
    hot: true,
    why: 'They have just paid for directory visibility, so the budget and the intent both exist.',
  },
  'shop.audit_click': {
    label: 'Asked for an audit',
    hot: true,
    why: 'They followed the audit link from their own dashboard.',
  },
  'shop.listing_submitted': {
    label: 'Submitted a listing',
    hot: false,
    why: 'They added themselves to the directory — interested, but they have not spent anything yet.',
  },
  'shop.published': {
    label: 'Listing went live',
    hot: false,
    why: 'Their submitted listing was approved and published.',
  },
  'shop.rank_dropped': {
    label: 'Lost ground in their city',
    hot: false,
    why: 'Somebody overtook them. A reason to call, but they have not asked for anything.',
  },
}

export function signalLabel(type: string): string {
  return SIGNAL_META[type as SignalType]?.label ?? type
}
export function signalIsHot(type: string): boolean {
  return SIGNAL_META[type as SignalType]?.hot ?? false
}
