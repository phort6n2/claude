// ============================================
// DIRECTORY — ADMIN AUTH (site operator)
// ============================================
// Passwordless-style admin session: the operator signs in with an allowlisted
// email + a password kept in an env var (the repo is public, so NEVER hardcode
// the password). On success we set an HMAC-signed httpOnly cookie; the admin
// tools/APIs accept that cookie so the operator doesn't retype the secret.
//
// Config:
//   DIRECTORY_ADMIN_PASSWORD  (or falls back to DIRECTORY_UPLOAD_SECRET)
//   DIRECTORY_ADMIN_EMAILS    (comma-separated; defaults to the owner's email)

import { createHmac, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE = 'wrhq_admin'

function adminEmails(): string[] {
  return (process.env.DIRECTORY_ADMIN_EMAILS || 'matt.lubbes@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function adminSecret(): string {
  return process.env.DIRECTORY_ADMIN_PASSWORD || process.env.DIRECTORY_UPLOAD_SECRET || ''
}

/** Admin sign-in is available only once a password is configured in the env. */
export function adminConfigured(): boolean {
  return !!adminSecret()
}

function sign(value: string): string {
  return createHmac('sha256', adminSecret()).update(value).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Validate an email+password login. Returns the normalized email or null. */
export function verifyAdminLogin(email: string, password: string): string | null {
  const e = email.trim().toLowerCase()
  if (!adminEmails().includes(e)) return null
  if (!adminSecret()) return null
  return safeEqual(password, adminSecret()) ? e : null
}

/** Session cookie value: base64url(email).hmac(email). */
export function makeAdminToken(email: string): string {
  const e = email.toLowerCase()
  return `${Buffer.from(e).toString('base64url')}.${sign(e)}`
}

/** Verify a session token and return the admin email, or null. */
export function verifyAdminToken(token: string | undefined | null): string | null {
  if (!token || !adminSecret()) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const encoded = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let email: string
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (!adminEmails().includes(email)) return null
  return safeEqual(sig, sign(email)) ? email : null
}

function cookieFromRequest(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return undefined
}

/**
 * Authorization for admin APIs: a valid admin session cookie, OR the legacy
 * x-upload-secret header (kept so existing tooling/scripts still work).
 */
export function isAdmin(request: Request): boolean {
  if (verifyAdminToken(cookieFromRequest(request, ADMIN_COOKIE))) return true
  const secret = process.env.DIRECTORY_UPLOAD_SECRET
  return !!secret && request.headers.get('x-upload-secret') === secret
}
