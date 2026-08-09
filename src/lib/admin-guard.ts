import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * Guard for admin-only API routes.
 *
 * Returns a response to send back when the caller isn't a signed-in admin,
 * or null when they are. Use it as the first line of every route under the
 * admin surface:
 *
 *   const denied = await requireAdmin()
 *   if (denied) return denied
 *
 * It checks `session?.user`, not `session`. That distinction is not
 * pedantry: auth() can hand back a truthy session-shaped object with no user
 * on it, and `if (!session)` waves that straight through.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/** Fields never worth returning over the wire, for any caller. */
export const CLIENT_SECRET_FIELDS = ['portalPassword'] as const

/** Strip secrets from a client record before it leaves the server. */
export function scrubClient<T extends Record<string, unknown>>(client: T): Omit<T, 'portalPassword'> {
  const copy = { ...client }
  for (const field of CLIENT_SECRET_FIELDS) delete copy[field]
  return copy
}
