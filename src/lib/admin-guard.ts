import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
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

/**
 * The same gate, for a server-rendered PAGE rather than an API route.
 *
 * This exists because the API routes were guarded and the pages were not, and
 * `/admin/clients` was consequently serving every client's business name,
 * email and phone number to anyone who typed the URL. Guarding the fetch and
 * leaving the render open is an easy gap to leave: the page "looks" empty
 * when you are logged out only if its data arrives over one of those guarded
 * fetches, and the moment a page reads the database directly it stops looking
 * empty and nobody notices.
 *
 * Called per page, not only in the layout. A Next.js layout does not re-run on
 * every client-side navigation between sibling routes, so a layout-only check
 * protects the first load and not necessarily what comes after it.
 */
export async function requireAdminPage(): Promise<void> {
  const session = await auth()
  if (!session?.user) redirect('/login')
}
