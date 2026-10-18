import { createHmac, timingSafeEqual } from 'crypto'

/**
 * A DRY-RUN LINK: test a live site's lead path without a lead.
 *
 * Verifying attribution end to end means submitting the real form on the real
 * site — and every submission there writes a Lead, emails and texts the shop,
 * forwards to their CRM and, with Meta configured, reports a conversion. A
 * fake lead reaching a shop is the thing that cannot happen, so testing used
 * to mean stopping the request in the browser, which also stops it proving
 * anything about the server.
 *
 * So an admin mints a link (`?gl_test=<token>`) good for one client for a
 * couple of hours. The widget carries the token on its submission and the
 * intake, seeing a valid one, does everything EXCEPT the consequences: it
 * works out exactly what it would store and answers with it, writes no row,
 * alerts nobody, forwards nothing, and sends the Meta event only to Events
 * Manager's Test Events tab — never to the live dataset, and not at all when
 * no test event code is set.
 *
 * The token is an HMAC over the client id and an expiry, in the same shape
 * and with the same key as the lead-outcome links: it cannot be forged, cannot
 * be moved to another client, and stops working on its own.
 */

const PURPOSE = 'lead-dry-run-v1'
export const TEST_TOKEN_PARAM = 'gl_test'
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000

function signingKey(): string | null {
  return (
    process.env.LEAD_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    null
  )
}

function mac(key: string, clientId: string, exp: number): string {
  return createHmac('sha256', key).update(`${PURPOSE}:${clientId}:${exp}`).digest('base64url').slice(0, 22)
}

export function mintTestToken(clientId: string, ttlMs = DEFAULT_TTL_MS, now = Date.now()): string | null {
  const key = signingKey()
  if (!key) return null
  const exp = Math.floor((now + ttlMs) / 1000)
  return `${exp}.${mac(key, clientId, exp)}`
}

/** True only for an unexpired token minted for THIS client. */
export function isValidTestToken(token: unknown, clientId: string, now = Date.now()): boolean {
  if (typeof token !== 'string' || token.length > 64) return false
  const key = signingKey()
  if (!key) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const exp = Number(token.slice(0, dot))
  if (!Number.isFinite(exp) || exp * 1000 < now) return false
  const a = Buffer.from(token.slice(dot + 1))
  const b = Buffer.from(mac(key, clientId, exp))
  return a.length === b.length && timingSafeEqual(a, b)
}
