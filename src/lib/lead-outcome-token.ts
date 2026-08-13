import { createHmac, timingSafeEqual } from 'crypto'

/**
 * A link that lets a shop mark a job won, without logging in.
 *
 * The whole feature depends on this being one tap. A shop owner reads the
 * alert on a phone with a car up on the lift; if recording the outcome means
 * finding the portal, remembering a password and drilling into a lead, it does
 * not get recorded — and every number the platform could show, and every
 * signal it could send back to the ads, depends on it being recorded.
 *
 * So the link carries its own authority. It is a capability URL: whoever holds
 * it can set the outcome of exactly one lead and read that lead's name,
 * vehicle and service. Nothing else — no other lead, no account, no list.
 *
 * That is a deliberate, bounded trade. The realistic exposure is a forwarded
 * email, and the worst it buys is marking one job won that wasn't. Weighed
 * against outcome data existing at all, that is not close.
 *
 * The signature is HMAC-SHA256 over the lead id and a purpose string, so a
 * token minted for one thing cannot be replayed as another if this grows a
 * second use. Verification is constant-time; a token is a secret, and
 * comparing secrets with === leaks their prefix to anyone patient.
 */

const PURPOSE = 'lead-outcome-v1'

/**
 * Stable across deploys, which rules out anything generated at boot. Falls
 * back through the secrets the app already requires rather than adding a new
 * one to forget to set — but never to a hardcoded default, because a signing
 * key with a known value is not a signing key.
 */
function signingKey(): string | null {
  return (
    process.env.LEAD_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    null
  )
}

export function outcomeTokenFor(leadId: string): string | null {
  const key = signingKey()
  if (!key) return null
  const mac = createHmac('sha256', key).update(`${PURPOSE}:${leadId}`).digest('base64url')
  // The lead id travels in the token so the page needs no second parameter,
  // and a truncated MAC keeps the URL short enough to survive an email client
  // wrapping it. 128 bits is far beyond guessing.
  return `${leadId}.${mac.slice(0, 22)}`
}

export function leadIdFromToken(token: string): string | null {
  const key = signingKey()
  if (!key) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const leadId = token.slice(0, dot)
  const given = token.slice(dot + 1)

  const expected = createHmac('sha256', key)
    .update(`${PURPOSE}:${leadId}`)
    .digest('base64url')
    .slice(0, 22)

  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? leadId : null
}

/** The full link to put in an alert. Null when no signing key is configured. */
export function outcomeUrlFor(leadId: string): string | null {
  const token = outcomeTokenFor(leadId)
  if (!token) return null
  const base = process.env.APP_URL || 'https://glassleads.app'
  return `${base}/o/${token}`
}
