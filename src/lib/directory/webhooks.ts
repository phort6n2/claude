// ============================================
// DIRECTORY → AGMP LEAD EVENTS (webhooks)
// ============================================
// Pushes shop-side lifecycle events to AGMP so their Day 0–10 nurture can start
// the moment a shop raises its hand, instead of waiting for a nightly export.
//
// IMPORTANT — what this does NOT send: consumer lead data. Directory quote
// requests belong to the one shop they were sent to; never resold, never shared
// between shops, never forwarded to the agency as a prospect list. That promise
// is a genuine differentiator, so these events carry SHOP (business) data only.
//
// Config:
//   AGMP_WEBHOOK_URL     the endpoint to POST to (absent → silent no-op)
//   AGMP_WEBHOOK_SECRET  optional; adds an HMAC-SHA256 signature header so AGMP
//                        can verify the payload really came from WRHQ
//
// Delivery is best-effort and never blocks the user-facing request: a failure is
// logged and swallowed, because a shop's claim must succeed even if AGMP is down.

import { createHmac } from 'node:crypto'

export type LeadEventType =
  | 'shop.claimed'
  | 'shop.listing_submitted'
  | 'shop.published'
  | 'shop.featured'
  | 'shop.rank_dropped'
  | 'shop.audit_click'

export interface LeadEvent {
  type: LeadEventType
  /** Shop slug, when the shop already exists in the directory. */
  slug?: string
  name: string
  email?: string
  phone?: string
  city?: string
  state?: string
  website?: string
  services?: string[]
  /** City position at the time of the event. */
  rank?: number
  total?: number
  /** Sales intel captured on the claim form. */
  monthlyVolume?: string
  frustration?: string
  smsConsent?: boolean
  wantsMarketingHelp?: boolean
  /** Who overtook them (rank_dropped only). */
  passedBy?: string[]
  previousRank?: number
  occurredAt: string
  source: 'windshieldrepairhq'
}

export function webhooksEnabled(): boolean {
  return !!process.env.AGMP_WEBHOOK_URL
}

function sign(body: string): string | null {
  const secret = process.env.AGMP_WEBHOOK_SECRET
  if (!secret) return null
  return createHmac('sha256', secret).update(body).digest('hex')
}

/**
 * Fire a lead event at AGMP. Always resolves — callers can await it without
 * risking the request they're serving.
 */
export async function sendLeadEvent(
  event: Omit<LeadEvent, 'occurredAt' | 'source'> & { occurredAt?: string }
): Promise<boolean> {
  const url = process.env.AGMP_WEBHOOK_URL
  if (!url) return false

  const payload: LeadEvent = {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    source: 'windshieldrepairhq',
  }
  const body = JSON.stringify(payload)
  const signature = sign(body)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WRHQ-Event': payload.type,
        ...(signature ? { 'X-WRHQ-Signature': signature } : {}),
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error('[directory:webhook] AGMP returned', res.status, await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('[directory:webhook] send failed', e)
    return false
  }
}
