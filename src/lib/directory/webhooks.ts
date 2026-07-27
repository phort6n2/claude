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

/**
 * Send a clearly-marked test event and REPORT what happened.
 *
 * Deliberate exception to the swallow-failures rule above: a real claim must
 * never fail because AGMP is down, but a test whose whole job is to tell you
 * whether the wiring works has to surface the receiver's actual answer. A
 * mistyped URL otherwise fails completely silently.
 */
export async function sendTestLeadEvent(): Promise<{
  ok: boolean
  status?: number
  body?: string
  error?: string
  signed: boolean
}> {
  const url = process.env.AGMP_WEBHOOK_URL
  const signed = !!process.env.AGMP_WEBHOOK_SECRET
  if (!url) return { ok: false, error: 'AGMP_WEBHOOK_URL is not set in Vercel.', signed }

  const payload: LeadEvent = {
    type: 'shop.claimed',
    slug: 'test-shop',
    name: 'TEST — Windshield Repair HQ wiring check',
    email: 'test@windshieldrepairhq.com',
    phone: '(555) 010-0000',
    city: 'Testville',
    state: 'TX',
    rank: 4,
    total: 11,
    wantsMarketingHelp: true,
    occurredAt: new Date().toISOString(),
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
        // Lets the receiving workflow filter test traffic out of real nurture.
        'X-WRHQ-Test': '1',
        ...(signature ? { 'X-WRHQ-Signature': signature } : {}),
      },
      body,
      signal: AbortSignal.timeout(10000),
    })
    const text = (await res.text().catch(() => '')).slice(0, 500)
    return { ok: res.ok, status: res.status, body: text, signed }
  } catch (e) {
    // Node's fetch reports a bare "fetch failed"; the useful part (ENOTFOUND on
    // a typo'd host, ECONNREFUSED, TimeoutError) lives on the cause.
    const cause = (e as { cause?: { code?: string } })?.cause?.code
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: cause ? `${msg} (${cause})` : msg, signed }
  }
}
