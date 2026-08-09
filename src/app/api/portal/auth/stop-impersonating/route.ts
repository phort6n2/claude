import { NextResponse } from 'next/server'
import { getPortalSession, clearPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/** POST — end an impersonated portal session and return to the admin. */
export async function POST() {
  const session = await getPortalSession()
  if (session?.isImpersonating) {
    console.warn(
      `[Impersonation] END admin=${session.impersonatedBy} clientUser=${session.email} at=${new Date().toISOString()}`
    )
  }
  await clearPortalSession()
  return NextResponse.json({ ok: true })
}
