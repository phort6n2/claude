// ============================================
// DIRECTORY — OWNER ACCESS (passwordless, DB-free)
// ============================================
// A shop owner proves ownership with an opaque access key that the agency
// issues when the listing is claimed. The key is an HMAC of the shop slug, so
// it needs no database, no email round-trip, and cannot be forged without the
// server secret. Owners paste the key (or follow an access link that carries
// it) to sign in; the same key is stored in an httpOnly cookie as the session.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const OWNER_COOKIE = 'wrhq_owner'

// Falls back to the upload secret so a single env var gets everything working,
// but a dedicated DIRECTORY_OWNER_SECRET is preferred in production.
function secret(): string {
  return process.env.DIRECTORY_OWNER_SECRET || process.env.DIRECTORY_UPLOAD_SECRET || ''
}

export function ownerAuthConfigured(): boolean {
  return !!secret()
}

function sign(slug: string): string {
  return createHmac('sha256', secret()).update(slug).digest('base64url')
}

/** Opaque access key for a shop: base64url(slug).hmac(slug). */
export function makeOwnerKey(slug: string): string {
  return `${Buffer.from(slug).toString('base64url')}.${sign(slug)}`
}

/** Verify an access key and return the shop slug it authorizes, or null. */
export function verifyOwnerKey(key: string | undefined | null): string | null {
  if (!key || !secret()) return null
  const dot = key.indexOf('.')
  if (dot < 1) return null
  const encoded = key.slice(0, dot)
  const sig = key.slice(dot + 1)
  let slug: string
  try {
    slug = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (!slug) return null
  const expected = sign(slug)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? slug : null
}
