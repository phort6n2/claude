import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Capability URL for a client's ranking report.
 *
 * The sales case for a geogrid is showing someone their own map before they
 * are a customer, which means a link that works with no login. Same shape as
 * the lead-outcome links: the token IS the credential, it is derived rather
 * than stored, and it grants exactly one thing — read access to one client's
 * ranking history, nothing else on the account.
 *
 * Rotating every token at once is a matter of changing the signing secret.
 */
function secret(): string {
  const key =
    process.env.LEAD_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY
  if (!key) throw new Error('No signing secret configured for rank share links')
  return key
}

function mac(clientId: string): string {
  return createHmac('sha256', secret())
    .update(`rankshare:${clientId}`)
    .digest('base64url')
    .slice(0, 22)
}

/** `{clientId}.{mac}` — self-describing, so no lookup table is needed. */
export function rankShareToken(clientId: string): string {
  return `${clientId}.${mac(clientId)}`
}

/** The client id a token authorises, or null if it authorises nothing. */
export function clientIdFromShareToken(token: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const clientId = token.slice(0, dot)
  const provided = token.slice(dot + 1)
  let expected: string
  try {
    expected = mac(clientId)
  } catch {
    return null
  }
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return clientId
}

export function rankShareUrl(origin: string, clientId: string): string {
  return `${origin.replace(/\/$/, '')}/r/${rankShareToken(clientId)}`
}
