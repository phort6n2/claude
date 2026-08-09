import { NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'

type PortalSession = NonNullable<Awaited<ReturnType<typeof getPortalSession>>>

/**
 * Guard for portal API routes.
 *
 * `mutating: true` additionally refuses impersonated sessions: an admin
 * troubleshooting a client's account must be able to SEE everything and
 * change nothing — no status edits, no notes, no push subscriptions bound to
 * the admin's browser, no emails sent to the real client.
 */
export async function requirePortalSession(
  options?: { mutating?: boolean }
): Promise<{ session: PortalSession } | { response: NextResponse }> {
  const session = await getPortalSession()
  if (!session) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (options?.mutating && session.isImpersonating) {
    console.warn(
      `[Portal] Blocked mutating request while impersonating ${session.email} (admin: ${session.impersonatedBy})`
    )
    return {
      response: NextResponse.json(
        { error: 'Read-only while viewing as this client. Exit impersonation to make changes.' },
        { status: 403 }
      ),
    }
  }
  return { session }
}
