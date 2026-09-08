import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const PORTAL_SESSION_COOKIE = 'portal_session'

/**
 * A ROLLING session: 30 days of not using it, 90 days no matter what.
 *
 * It used to be a flat 30 days from sign-in, which expired on the same
 * schedule whether the shop opened the portal daily or never — so the people
 * who use it most were interrupted just as often as the people who do not,
 * and every interruption is an email, a link, and a shop owner wondering why
 * they have been logged out again. That friction is what pushes an operator
 * towards inventing passwords and texting them over, which is how a client
 * ends up locked out of a portal nobody can reset for them.
 *
 * The idle clock lives on `ClientUser.lastSeenAt`, NOT in the cookie. A claim
 * inside the cookie would have to be re-signed on every request — and a cookie
 * the browser is merely trusted to drop is not a timeout, it is a suggestion.
 * The server decides.
 *
 * The absolute cap is the thing a rolling session gives up, so it is short
 * enough to matter: a stolen cookie kept warm still dies inside three months.
 */
const SESSION_IDLE_DAYS = 30
const SESSION_ABSOLUTE_DAYS = 90

/** Don't write on every page view. An hour's resolution is plenty for a
 *  30-day window, and the portal calls this on every request it serves. */
const TOUCH_AFTER_MS = 60 * 60 * 1000

/**
 * Portal session cookies are HMAC-signed.
 *
 * They used to be plain base64 JSON containing the ClientUser id, which
 * getPortalSession() then trusted outright — so any client could edit their
 * own cookie to another shop's user id and read that shop's leads. The
 * signature below is what makes the id trustworthy; never read a claim out of
 * this cookie without verifying it first.
 */
function sessionSecret(): string {
  const secret =
    process.env.PORTAL_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET
  if (!secret) {
    // Fail closed: without a secret we cannot authenticate anyone.
    throw new Error('PORTAL_SESSION_SECRET (or NEXTAUTH_SECRET) must be set')
  }
  return secret
}

interface PortalSessionClaims {
  userId: string
  createdAt: number
  /** Admin impersonation — set only by the admin impersonate route. */
  imp?: boolean
  impBy?: string
  impEmail?: string
  /** Absolute expiry (ms epoch); used to give impersonation a short life. */
  exp?: number
  /**
   * Impersonate a CLIENT rather than one of its users.
   *
   * Most clients have no portal user, and viewing what they would see should
   * not require creating a login for them first — that is a real credential,
   * created for a look around, and then left behind.
   *
   * Only ever set alongside `imp`, so a session carrying it is read-only by
   * the same rule as any other impersonation, and it lives inside the HMAC so
   * it cannot be added to a genuine client session to hop tenants.
   */
  impClientId?: string
}

function signClaims(claims: PortalSessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyCookie(value: string): PortalSessionClaims | null {
  const dot = value.lastIndexOf('.')
  if (dot < 1) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as PortalSessionClaims
  } catch {
    return null
  }
}

/**
 * Generate a secure random token
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Verify email/password login
 */
export async function verifyPasswordLogin(email: string, password: string): Promise<{
  success: boolean
  error?: string
  clientUser?: {
    id: string
    email: string
    name: string | null
    clientId: string
    client: { businessName: string }
  }
}> {
  // Find client user by email
  const clientUser = await prisma.clientUser.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      client: {
        select: { id: true, businessName: true },
      },
    },
  })

  if (!clientUser) {
    return { success: false, error: 'Invalid email or password' }
  }

  if (!clientUser.isActive) {
    return { success: false, error: 'This account has been deactivated' }
  }

  if (!clientUser.passwordHash) {
    /* NOT "contact support" — the fix is a button on the screen they are
       already looking at. Most portal accounts have no password at all
       (invites create them without one), so this is the ordinary case, not an
       error, and sending them to a human for it is how a shop waits a day to
       read their own leads. */
    return {
      success: false,
      error: 'This account signs in by email link — use “Email me a sign-in link” above.',
    }
  }

  const isValid = await verifyPassword(password, clientUser.passwordHash)
  if (!isValid) {
    return { success: false, error: 'Invalid email or password' }
  }

  // Update last login
  await prisma.clientUser.update({
    where: { id: clientUser.id },
    data: { lastLoginAt: new Date(), lastSeenAt: new Date() },
  })

  return {
    success: true,
    clientUser: {
      id: clientUser.id,
      email: clientUser.email,
      name: clientUser.name,
      clientId: clientUser.clientId,
      client: { businessName: clientUser.client.businessName },
    },
  }
}

/**
 * Create a magic link token for a client user
 */
export async function createMagicLink(email: string): Promise<{
  success: boolean
  token?: string
  error?: string
  clientUser?: { id: string; name: string | null; client: { businessName: string } }
}> {
  // Find client user by email
  const clientUser = await prisma.clientUser.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      client: {
        select: { id: true, businessName: true },
      },
    },
  })

  if (!clientUser) {
    return { success: false, error: 'No account found with this email' }
  }

  if (!clientUser.isActive) {
    return { success: false, error: 'This account has been deactivated' }
  }

  // Generate token and set expiry (24 hours)
  const token = generateToken()
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.clientUser.update({
    where: { id: clientUser.id },
    data: {
      magicLinkToken: token,
      magicLinkExpiry: expiry,
    },
  })

  return {
    success: true,
    token,
    clientUser: {
      id: clientUser.id,
      name: clientUser.name,
      client: { businessName: clientUser.client.businessName },
    },
  }
}

/**
 * Verify a magic link token and create a session
 */
export async function verifyMagicLink(token: string): Promise<{
  success: boolean
  error?: string
  clientUser?: {
    id: string
    email: string
    name: string | null
    clientId: string
    client: { businessName: string }
  }
}> {
  const clientUser = await prisma.clientUser.findUnique({
    where: { magicLinkToken: token },
    include: {
      client: {
        select: { id: true, businessName: true },
      },
    },
  })

  if (!clientUser) {
    return { success: false, error: 'Invalid or expired link' }
  }

  if (!clientUser.magicLinkExpiry || clientUser.magicLinkExpiry < new Date()) {
    return { success: false, error: 'This link has expired. Please request a new one.' }
  }

  if (!clientUser.isActive) {
    return { success: false, error: 'This account has been deactivated' }
  }

  // Clear the magic link token and update last login
  await prisma.clientUser.update({
    where: { id: clientUser.id },
    data: {
      magicLinkToken: null,
      magicLinkExpiry: null,
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
    },
  })

  return {
    success: true,
    clientUser: {
      id: clientUser.id,
      email: clientUser.email,
      name: clientUser.name,
      clientId: clientUser.clientId,
      client: { businessName: clientUser.client.businessName },
    },
  }
}

/**
 * Create a session cookie for the client user
 */
export async function createPortalSession(
  clientUserId: string,
  options?: { impersonatedBy?: string; adminEmail?: string; ttlMinutes?: number }
): Promise<string> {
  const cookieStore = await cookies()
  const now = Date.now()
  const claims: PortalSessionClaims = {
    userId: clientUserId,
    createdAt: now,
    ...(options?.impersonatedBy
      ? {
          imp: true,
          impBy: options.impersonatedBy,
          impEmail: options.adminEmail,
          exp: now + (options.ttlMinutes ?? 30) * 60 * 1000,
        }
      : {}),
  }
  const value = signClaims(claims)

  cookieStore.set(PORTAL_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: options?.impersonatedBy
      ? (options.ttlMinutes ?? 30) * 60
      : SESSION_ABSOLUTE_DAYS * 24 * 60 * 60,
    path: '/',
  })

  return value
}

/**
 * Get the current portal session
 */
export async function getPortalSession(): Promise<{
  userId: string
  clientId: string
  email: string
  name: string | null
  businessName: string
  timezone: string
  logoUrl: string | null
  primaryColor: string | null
  isImpersonating: boolean
  impersonatedBy?: string
  impersonationExpiresAt?: number
} | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE)

  if (!sessionCookie?.value) {
    return null
  }

  try {
    // Signature first — an unsigned or tampered cookie is not a session.
    const sessionData = verifyCookie(sessionCookie.value)
    if (!sessionData) return null

    // The absolute cap — how long a session may live at all, however busy.
    const sessionAge = Date.now() - sessionData.createdAt
    if (sessionAge > SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000) {
      return null
    }
    // Impersonation sessions carry a short absolute expiry.
    if (sessionData.exp && Date.now() > sessionData.exp) {
      return null
    }

    // Impersonating a client that has no portal user. There is no ClientUser
    // to load, so the client itself supplies everything the portal needs.
    if (sessionData.imp && sessionData.impClientId) {
      const client = await prisma.client.findUnique({
        where: { id: sessionData.impClientId },
        select: {
          id: true,
          businessName: true,
          timezone: true,
          logoUrl: true,
          primaryColor: true,
        },
      })
      if (!client) return null
      return {
        // Empty rather than faked. Nothing can write during impersonation, so
        // no code path needs a user id — and an invented one could end up
        // stamped on a record as if a real person had done it.
        userId: '',
        clientId: client.id,
        email: sessionData.impEmail || 'admin',
        name: 'Admin preview',
        businessName: client.businessName,
        timezone: client.timezone,
        logoUrl: client.logoUrl,
        primaryColor: client.primaryColor,
        isImpersonating: true,
        impersonatedBy: sessionData.impEmail,
        impersonationExpiresAt: sessionData.exp,
      }
    }

    // Fetch user data
    const clientUser = await prisma.clientUser.findUnique({
      where: { id: sessionData.userId },
      include: {
        client: {
          select: { id: true, businessName: true, timezone: true, logoUrl: true, primaryColor: true },
        },
      },
    })

    if (!clientUser || !clientUser.isActive) {
      return null
    }

    /* THE IDLE HALF, and it is only about real users.
       An impersonating admin must not keep a shop's session alive by looking
       around in it — that would silently extend a credential belonging to
       somebody who has not touched the portal in months. Falls back to the
       session's own createdAt so accounts that predate this column are not
       all logged out by the deploy that added it. */
    if (!sessionData.imp) {
      const lastSeen = clientUser.lastSeenAt?.getTime() ?? sessionData.createdAt
      if (Date.now() - lastSeen > SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000) {
        return null
      }
      if (Date.now() - lastSeen > TOUCH_AFTER_MS) {
        // Never awaited into the failure path: a database having a bad minute
        // must not log a shop out of a session that is perfectly valid.
        prisma.clientUser
          .update({ where: { id: clientUser.id }, data: { lastSeenAt: new Date() } })
          .catch(() => {})
      }
    }

    return {
      userId: clientUser.id,
      clientId: clientUser.clientId,
      email: clientUser.email,
      name: clientUser.name,
      businessName: clientUser.client.businessName,
      timezone: clientUser.client.timezone,
      logoUrl: clientUser.client.logoUrl,
      primaryColor: clientUser.client.primaryColor,
      isImpersonating: !!sessionData.imp,
      impersonatedBy: sessionData.impEmail,
      impersonationExpiresAt: sessionData.exp,
    }
  } catch {
    return null
  }
}

/**
 * Clear the portal session
 */
/**
 * Start a read-only look at a client that has no portal user.
 *
 * Separate from createPortalSession so the client-level claim can only ever
 * be minted here, and only ever alongside the impersonation flag.
 */
export async function createClientPreviewSession(
  clientId: string,
  options: { impersonatedBy: string; adminEmail: string; ttlMinutes?: number }
): Promise<void> {
  const cookieStore = await cookies()
  const now = Date.now()
  const claims: PortalSessionClaims = {
    userId: '',
    createdAt: now,
    imp: true,
    impBy: options.impersonatedBy,
    impEmail: options.adminEmail,
    impClientId: clientId,
    exp: now + (options.ttlMinutes ?? 30) * 60 * 1000,
  }
  cookieStore.set(PORTAL_SESSION_COOKIE, signClaims(claims), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: (options.ttlMinutes ?? 30) * 60,
  })
}

export async function clearPortalSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(PORTAL_SESSION_COOKIE)
}
