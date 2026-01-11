import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const PORTAL_SESSION_COOKIE = 'portal_session'
const SESSION_DURATION_DAYS = 30

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
    return { success: false, error: 'Password not set. Please contact support.' }
  }

  const isValid = await verifyPassword(password, clientUser.passwordHash)
  if (!isValid) {
    return { success: false, error: 'Invalid email or password' }
  }

  // Update last login
  await prisma.clientUser.update({
    where: { id: clientUser.id },
    data: { lastLoginAt: new Date() },
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
export async function createPortalSession(clientUserId: string): Promise<string> {
  const sessionToken = generateToken()

  // Store session token (we could use a Session table, but for simplicity we'll encode in cookie)
  // In production, you'd want a proper session store
  const cookieStore = await cookies()
  const sessionData = JSON.stringify({
    userId: clientUserId,
    token: sessionToken,
    createdAt: Date.now(),
  })

  // Base64 encode the session data
  const encoded = Buffer.from(sessionData).toString('base64')

  cookieStore.set(PORTAL_SESSION_COOKIE, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: '/',
  })

  return sessionToken
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
} | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE)

  if (!sessionCookie?.value) {
    return null
  }

  try {
    const decoded = Buffer.from(sessionCookie.value, 'base64').toString('utf-8')
    const sessionData = JSON.parse(decoded)

    // Check session age
    const sessionAge = Date.now() - sessionData.createdAt
    const maxAge = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    if (sessionAge > maxAge) {
      return null
    }

    // Fetch user data
    const clientUser = await prisma.clientUser.findUnique({
      where: { id: sessionData.userId },
      include: {
        client: {
          select: { id: true, businessName: true, timezone: true, logoUrl: true },
        },
      },
    })

    if (!clientUser || !clientUser.isActive) {
      return null
    }

    return {
      userId: clientUser.id,
      clientId: clientUser.clientId,
      email: clientUser.email,
      name: clientUser.name,
      businessName: clientUser.client.businessName,
      timezone: clientUser.client.timezone,
      logoUrl: clientUser.client.logoUrl,
    }
  } catch {
    return null
  }
}

/**
 * Clear the portal session
 */
export async function clearPortalSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(PORTAL_SESSION_COOKIE)
}
