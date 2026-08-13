import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * Call tracking on Twilio: numbers that ring the shop, and recordings the
 * coaching pipeline can actually read.
 *
 * The shape is deliberately plain. A customer dials a tracking number, Twilio
 * asks this app what to do, and the answer is "record it and connect them to
 * the shop". When the call ends Twilio tells us how it went; a minute or two
 * later it tells us the recording is ready. Three webhooks, one call.
 *
 * ---------------------------------------------------------------------------
 * Two things here are not obvious and both would have failed silently
 * ---------------------------------------------------------------------------
 *
 * 1. A Twilio recording URL is NOT publicly fetchable. It needs HTTP Basic
 *    auth with the account credentials. The coaching pipeline hands Deepgram a
 *    URL to fetch, and the portal renders the same URL in an <audio> tag —
 *    both would get a 401 and neither would say why in a useful way. So the
 *    recording is copied into Blob storage and it is the copy that gets
 *    stored. That is also what makes the recording outlive Twilio's retention.
 *
 * 2. A phone number can point its voice webhook at exactly one place. Adding a
 *    number here does not make it "also" work in whatever it was configured
 *    for before — it moves it. That is a migration per number, not a parallel
 *    run, and the admin says so before anything is saved.
 */

/** Secrets come from the Setting table first, then env — same as everywhere. */
async function secret(key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (row) {
      if (row.encrypted) {
        try {
          return decrypt(row.value)
        } catch {
          return null
        }
      }
      return row.value
    }
  } catch {
    // fall through to env
  }
  return process.env[key] || null
}

export interface TwilioCreds {
  accountSid: string
  authToken: string
}

export async function twilioCreds(): Promise<TwilioCreds | null> {
  const [accountSid, authToken] = await Promise.all([
    secret('TWILIO_ACCOUNT_SID'),
    secret('TWILIO_AUTH_TOKEN'),
  ])
  if (!accountSid || !authToken) return null
  return { accountSid, authToken }
}

/**
 * The public URL Twilio signed.
 *
 * Signature validation hashes the exact URL Twilio requested. Behind a proxy
 * `request.url` can carry the internal host, and a mismatch there rejects
 * every legitimate call — the failure mode is total and looks like a
 * credentials problem. Rebuild it from the forwarded headers instead.
 */
export function publicUrl(request: Request): string {
  const url = new URL(request.url)
  const headers = request.headers
  const host = (headers.get('x-forwarded-host') || headers.get('host') || url.host)
    .split(',')[0]
    .trim()
  const proto = (headers.get('x-forwarded-proto') || url.protocol.replace(':', ''))
    .split(',')[0]
    .trim()
  return `${proto}://${host}${url.pathname}${url.search}`
}

/**
 * Is this really Twilio?
 *
 * These endpoints dial out and write leads, so an open one is both a fraud
 * route and a way to inject rubbish into a client's account. Twilio signs
 * every request with the auth token; anyone who cannot reproduce that
 * signature is not Twilio.
 *
 * Returns a reason rather than a bare false so a misconfiguration is
 * distinguishable in the logs from an attack.
 */
export async function verifyTwilioSignature(
  request: Request,
  url: string,
  params: Record<string, string>
): Promise<{ ok: boolean; reason?: string }> {
  const signature = request.headers.get('x-twilio-signature')
  if (!signature) return { ok: false, reason: 'No X-Twilio-Signature header' }

  const creds = await twilioCreds()
  if (!creds) return { ok: false, reason: 'Twilio credentials are not configured' }

  const twilio = await import('twilio')
  const valid = twilio.validateRequest(creds.authToken, signature, url, params)
  return valid ? { ok: true } : { ok: false, reason: 'Signature did not match' }
}

/** Twilio posts application/x-www-form-urlencoded. */
export async function twilioParams(request: Request): Promise<Record<string, string>> {
  const text = await request.text()
  const params: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(text)) params[key] = value
  return params
}

export function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

/** XML-escape anything interpolated into TwiML. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Copy a Twilio recording into Blob storage and return the public URL.
 *
 * Fetched with Basic auth, stored with a random suffix so the URL cannot be
 * guessed from a lead id. The recording is a conversation with a member of
 * the public, so it gets the same treatment as the photos: unguessable, and
 * never listed anywhere a client could enumerate.
 *
 * Returns null on any failure — the lead is already saved and a call without
 * coaching is a smaller loss than a webhook that 500s and gets retried.
 */
export async function storeRecording(
  recordingUrl: string,
  clientSlug: string,
  callSid: string
): Promise<string | null> {
  const creds = await twilioCreds()
  if (!creds) {
    console.error('[Twilio] Cannot fetch recording — no credentials')
    return null
  }

  try {
    // Twilio serves .mp3 or .wav from the same resource URL; ask for mp3,
    // which is an order of magnitude smaller to store and to transcribe.
    const mediaUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.error(`[Twilio] Recording fetch failed: HTTP ${res.status} for ${mediaUrl}`)
      return null
    }
    const audio = Buffer.from(await res.arrayBuffer())

    const { put } = await import('@vercel/blob')
    const blob = await put(`calls/${clientSlug}/${callSid}.mp3`, audio, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'audio/mpeg',
    })
    return blob.url
  } catch (error) {
    console.error('[Twilio] Recording copy failed:', error)
    return null
  }
}
