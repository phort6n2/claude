import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Per-client secret for the local-rank webhook URL.
 *
 * LocalDominator posts a plain webhook with no documented signing scheme, so
 * the URL itself has to carry the authorisation. The token is derived from a
 * server secret and the client id — never stored, so there is nothing extra
 * to leak, and a client id on its own is not enough to write scan rows.
 *
 * Same key-fallback chain as the lead-outcome links, so a deployment that
 * can mint one can mint the other.
 */
function secret(): string {
  const key =
    process.env.LEAD_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY
  if (!key) throw new Error('No signing secret configured for rank webhooks')
  return key
}

function sign(clientId: string): string {
  return createHmac('sha256', secret())
    .update(`localrank:${clientId}`)
    .digest('base64url')
    .slice(0, 22)
}

export const rankWebhookToken = {
  create(clientId: string): string {
    return sign(clientId)
  },
  verify(clientId: string, token: string): boolean {
    if (!token) return false
    let expected: string
    try {
      expected = sign(clientId)
    } catch {
      return false
    }
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  },
}

/** The absolute URL handed to LocalDominator when a campaign is created. */
export function rankWebhookUrl(origin: string, clientId: string): string {
  return `${origin.replace(/\/$/, '')}/api/webhooks/localdominator/${clientId}?t=${rankWebhookToken.create(clientId)}`
}
