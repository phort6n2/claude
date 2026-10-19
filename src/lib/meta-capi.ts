import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Meta's Conversions API: the server-side copy of the browser Pixel's Lead.
 *
 * WHY BOTH. The Pixel is blocked by a good share of browsers (ad blockers,
 * Safari's tracking prevention, a page closed before the script loaded), and
 * every lead it misses is a lead Meta's bidding never hears about. The server
 * cannot be blocked. Sending both with the SAME event_id is Meta's documented
 * pattern: it keeps one and drops the other, so nothing is counted twice and
 * nothing is lost when one side fails.
 *
 * WHAT IS SENT. Hashed identifiers only (SHA-256 of the normalised value, as
 * Meta specifies), plus the four things that are not hashed by design: fbc,
 * fbp, the visitor's IP and user agent. The token is decrypted at send time
 * and never written into the delivery row, a log line or the browser.
 *
 * WHAT IS NOT SENT. Anything for a visitor who opted out — the Global
 * Privacy Control signal or the site's "Do Not Sell or Share" link. California
 * treats this exact flow as "sharing", and the safe reading of the law is
 * that the opt-out has to stop it at the source, so `queueMetaLead` is never
 * called for them.
 *
 * DELIVERY is the WebhookDelivery pattern: a row, an attempt after the
 * response has been sent, and the 15-minute retry cron for anything that did
 * not land. The app runs no job queue, and a second retry mechanism for one
 * integration is a second thing to keep working.
 */

/** Graph API version. Meta supports each for about two years; bump yearly. */
export const META_GRAPH_VERSION = 'v26.0'
const MAX_ATTEMPTS = 6
const ATTEMPT_TIMEOUT_MS = 10_000
/** Meta refuses an event_time older than seven days; stop retrying well before. */
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Normalisation and hashing — exactly Meta's rules, because a hash of a
// differently-formatted value matches nobody and fails silently.
// ---------------------------------------------------------------------------

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
}

/**
 * Digits only, WITH the country code, no leading zeros or "+". A ten-digit
 * North American number gets its 1 — "(714) 555-0100" hashed as 7145550100
 * matches no Meta account, because every account stores the country code.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = (raw || '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10) d = `1${d}`
  return d.length >= 11 && d.length <= 15 ? d : null
}

export function normalizeName(raw: string | null | undefined): string | null {
  const v = (raw || '').trim().toLowerCase().replace(/[^\p{L}\p{M}'-]/gu, '')
  return v || null
}

/** US ZIP: the first five digits. Canadian postal code: lowercase, no space. */
export function normalizeZip(raw: string | null | undefined): string | null {
  const v = (raw || '').trim().toLowerCase().replace(/\s+/g, '')
  if (/^\d{5}(-?\d{4})?$/.test(v)) return v.slice(0, 5)
  if (/^[a-z]\d[a-z]\d[a-z]\d$/.test(v)) return v
  return null
}

function hashed(value: string | null): string[] | undefined {
  return value ? [sha256(value)] : undefined
}

export interface MetaLeadFacts {
  clientId: string
  leadId: string | null
  eventId: string
  eventName?: 'Lead' | 'Contact'
  /** 'phone_call' for a call or text to the Meta number; 'website' otherwise. */
  actionSource?: 'website' | 'phone_call'
  eventTime: Date
  eventSourceUrl: string | null
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  zip?: string | null
  country?: string | null
  fbc?: string | null
  fbp?: string | null
  clientIp?: string | null
  userAgent?: string | null
}

/** The event exactly as Meta's /events endpoint takes it, minus the token. */
export function buildMetaEvent(facts: MetaLeadFacts): Record<string, unknown> {
  const userData: Record<string, unknown> = {}
  const em = hashed(normalizeEmail(facts.email))
  const ph = hashed(normalizePhone(facts.phone))
  const fn = hashed(normalizeName(facts.firstName))
  const ln = hashed(normalizeName(facts.lastName))
  const zp = hashed(normalizeZip(facts.zip))
  const country = facts.country && /^[a-z]{2}$/i.test(facts.country) ? hashed(facts.country.toLowerCase()) : undefined
  if (em) userData.em = em
  if (ph) userData.ph = ph
  if (fn) userData.fn = fn
  if (ln) userData.ln = ln
  if (zp) userData.zp = zp
  if (country) userData.country = country
  // Our own lead id, hashed: lets Meta tie this event to a later offline
  // upload of the same lead without the id meaning anything to them.
  if (facts.leadId) userData.external_id = [sha256(facts.leadId)]
  if (facts.fbc) userData.fbc = facts.fbc
  if (facts.fbp) userData.fbp = facts.fbp
  if (facts.clientIp) userData.client_ip_address = facts.clientIp
  if (facts.userAgent) userData.client_user_agent = facts.userAgent

  const event: Record<string, unknown> = {
    event_name: facts.eventName || 'Lead',
    event_time: Math.floor(facts.eventTime.getTime() / 1000),
    event_id: facts.eventId,
    action_source: facts.actionSource || 'website',
    user_data: userData,
  }
  if (facts.eventSourceUrl) event.event_source_url = facts.eventSourceUrl
  return event
}

interface MetaConfig {
  pixelId: string
  token: string
  testEventCode: string | null
}

/** Null when this client has no Pixel, no token, or the token cannot be read. */
export async function metaConfigFor(clientId: string): Promise<MetaConfig | null> {
  try {
    const row = await prisma.clientAdsTracking.findUnique({
      where: { clientId },
      select: { metaPixelId: true, metaCapiToken: true, metaTestEventCode: true },
    })
    if (!row?.metaPixelId || !row.metaCapiToken) return null
    const token = decrypt(row.metaCapiToken)
    if (!token) return null
    return { pixelId: row.metaPixelId, token, testEventCode: row.metaTestEventCode?.trim() || null }
  } catch {
    return null
  }
}

export interface MetaSendResult {
  ok: boolean
  status: number | null
  error: string | null
  response: Record<string, unknown> | null
}

/** One POST to Meta. Shared by deliveries and the dry-run test path. */
export async function postMetaEvent(
  config: { pixelId: string; token: string },
  event: Record<string, unknown>,
  testEventCode: string | null
): Promise<MetaSendResult> {
  const body: Record<string, unknown> = { data: [event], access_token: config.token }
  if (testEventCode) body.test_event_code = testEventCode
  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(config.pixelId)}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      }
    )
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.ok) return { ok: true, status: res.status, error: null, response: json }
    // Meta's error object says which field it refused; that sentence is the
    // whole diagnosis, so it is kept rather than reduced to "HTTP 400".
    const err = (json?.error || {}) as Record<string, unknown>
    const message = [err.message, err.error_user_msg].filter(Boolean).join(' — ') || `HTTP ${res.status}`
    return { ok: false, status: res.status, error: String(message).slice(0, 500), response: json }
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : 'Request failed', response: null }
  }
}

/**
 * Create the delivery row for a lead. Returns its id, or null when this client
 * has no Conversions API configured (the normal case) or the row could not be
 * written — never throws, because the lead is already saved and Meta is
 * strictly additive to it.
 */
export async function queueMetaLead(facts: MetaLeadFacts): Promise<string | null> {
  const config = await metaConfigFor(facts.clientId)
  if (!config) return null
  try {
    const row = await prisma.metaEventDelivery.create({
      data: {
        clientId: facts.clientId,
        leadId: facts.leadId,
        eventId: facts.eventId,
        eventName: facts.eventName || 'Lead',
        payload: buildMetaEvent(facts) as Prisma.InputJsonValue,
        testEventCode: config.testEventCode,
      },
      select: { id: true },
    })
    return row.id
  } catch (e) {
    // P2002: the same event id was queued already (a retried post). Meta
    // would have deduped it anyway; not queuing it twice is the cleaner half.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null
    console.error('[Meta CAPI] Could not queue event:', e)
    return null
  }
}

/**
 * A call or text to the META tracking number, as a Meta Lead.
 *
 * WHY. That number is shown only to visitors Meta's ads sent (site-phone.ts),
 * so a call to it is a Meta lead by construction — and before this Meta never
 * heard about one. The Pixel sees a TAP on the number (`Contact`); it cannot
 * see somebody who read the number off the page and dialled it, nor whether
 * the call happened at all. So the server reports the call itself, with
 * `action_source: 'phone_call'`.
 *
 * MATCHING IS BY THE CALLER'S NUMBER ALONE, hashed. A call carries no fbc,
 * fbp or IP, so Meta can credit the ad only when that number is on the
 * caller's own Meta account. Many will not match; they still count in our
 * own reporting, which is the complete record. The event id is the
 * CallSid/MessageSid, so a retried webhook cannot report one call twice.
 *
 * ONCE PER PERSON PER DAY — the caller decides that (`earliestSameDayContact`,
 * the rule the alerts use): a form submission followed by a call is one
 * enquiry, and the form already sent its own Lead.
 *
 * NEVER FOR AN OPTED-OUT VISITOR, because such a visitor is never shown this
 * number (`numberSourceAfterOptOut`).
 *
 * Never throws: the lead is already saved and Meta is strictly additive.
 * Outside a request `after()` is unavailable, and the 15-minute retry cron
 * sends the queued row instead.
 */
export async function queueMetaPhoneLead(facts: {
  clientId: string
  leadId: string
  /** Twilio's CallSid (CA…) or MessageSid (SM…/MM…): unique, and stable across retries. */
  sid: string
  phone: string
  at?: Date
}): Promise<void> {
  try {
    const id = await queueMetaLead({
      clientId: facts.clientId,
      leadId: facts.leadId,
      eventId: `phone-${facts.sid}`,
      eventName: 'Lead',
      actionSource: 'phone_call',
      eventTime: facts.at ?? new Date(),
      eventSourceUrl: null,
      phone: facts.phone,
    })
    if (!id) return
    try {
      const { after } = await import('next/server')
      after(async () => {
        await attemptMetaDelivery(id)
      })
    } catch {
      // Not inside a request: the retry cron picks the row up.
    }
  } catch (e) {
    console.error('[Meta CAPI] Could not queue phone lead:', e)
  }
}

export async function attemptMetaDelivery(id: string): Promise<boolean> {
  try {
    const row = await prisma.metaEventDelivery.findUnique({ where: { id } })
    if (!row || row.status === 'SUCCESS') return true
    const config = await metaConfigFor(row.clientId)
    if (!config) {
      await prisma.metaEventDelivery.update({
        where: { id },
        data: { status: 'FAILED', lastError: 'Meta Pixel or Conversions API token is no longer configured' },
      })
      console.warn(`[Meta CAPI] ${row.eventName} ${row.eventId} not sent — client has no Conversions API configured`)
      return false
    }
    const result = await postMetaEvent(config, row.payload as Record<string, unknown>, row.testEventCode)
    await prisma.metaEventDelivery.update({
      where: { id },
      data: {
        status: result.ok ? 'SUCCESS' : 'FAILED',
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        responseStatus: result.status,
        lastError: result.error,
        response: (result.response ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    if (result.ok) {
      console.log(
        `[Meta CAPI] Sent ${row.eventName} ${row.eventId} for lead ${row.leadId ?? '-'}${
          row.testEventCode ? ' (Test Events)' : ''
        }: ${JSON.stringify(result.response)}`
      )
    } else {
      console.error(
        `[Meta CAPI] FAILED ${row.eventName} ${row.eventId} for lead ${row.leadId ?? '-'} (attempt ${
          row.attempts + 1
        }): ${result.status ?? 'no response'} ${result.error}`
      )
    }
    return result.ok
  } catch (e) {
    console.error(`[Meta CAPI] Attempt crashed for ${id}:`, e)
    return false
  }
}

/** Swept by the same 15-minute cron as webhook forwarding. */
export async function retryPendingMetaDeliveries(limit = 20): Promise<{ attempted: number; succeeded: number }> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000)
  const cutoff = new Date(Date.now() - RETRY_WINDOW_MS)
  const rows = await prisma.metaEventDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      attempts: { lt: MAX_ATTEMPTS },
      updatedAt: { lt: staleBefore },
      createdAt: { gt: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  })
  let succeeded = 0
  for (const row of rows) if (await attemptMetaDelivery(row.id)) succeeded++
  return { attempted: rows.length, succeeded }
}

/**
 * The visitor's IP as the platform saw it. Vercel puts the client first in
 * x-forwarded-for; anything after it is a proxy.
 */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = xff || headers.get('x-real-ip')?.trim() || null
  return ip && /^[0-9a-f:.]+$/i.test(ip) ? ip : null
}
