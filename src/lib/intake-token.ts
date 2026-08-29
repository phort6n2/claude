import { createHmac, timingSafeEqual } from 'crypto'

/**
 * The link in a new shop's welcome email.
 *
 * Same shape as the lead-outcome token and for the same reason: the person
 * who has to fill this in does not have an account yet, and requiring one
 * before they can tell us their opening hours is how onboarding stalls on
 * day one. So the link carries its own authority.
 *
 * What it buys whoever holds it is bounded: read and write the answers of
 * exactly ONE intake, and nothing else. No client record, no leads, no list
 * of other intakes — the intake is not a Client until an admin approves it,
 * so there is nothing live behind this link to damage. The realistic exposure
 * is a forwarded email, and the worst it buys is somebody else typing a
 * shop's hours into a draft a human then reads.
 *
 * The purpose string is part of the signature, so a token minted here can
 * never be replayed against the lead-outcome route or anything added later.
 */

const PURPOSE = 'client-intake-v1'

function signingKey(): string | null {
  return (
    process.env.LEAD_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    null
  )
}

export function intakeTokenFor(intakeId: string): string | null {
  const key = signingKey()
  if (!key) return null
  const mac = createHmac('sha256', key).update(`${PURPOSE}:${intakeId}`).digest('base64url')
  return `${intakeId}.${mac.slice(0, 22)}`
}

export function intakeIdFromToken(token: string): string | null {
  const key = signingKey()
  if (!key) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const intakeId = token.slice(0, dot)
  const given = token.slice(dot + 1)

  const expected = createHmac('sha256', key)
    .update(`${PURPOSE}:${intakeId}`)
    .digest('base64url')
    .slice(0, 22)

  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  // Constant-time, because comparing secrets with === leaks their prefix to
  // anyone patient enough to measure it.
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? intakeId : null
}

/** The full link for the welcome email. Null when no signing key is set. */
export function intakeUrlFor(intakeId: string): string | null {
  const token = intakeTokenFor(intakeId)
  if (!token) return null
  const base = process.env.APP_URL || 'https://glassleads.app'
  return `${base}/welcome/${token}`
}
