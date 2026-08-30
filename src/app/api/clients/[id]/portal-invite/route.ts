import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { sendPortalInvite } from '@/lib/portal-invite'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — send (or re-send) the portal invite for this client, by hand.
 *
 * The one email that opens the portal to the shop, and it fires only from
 * an admin pressing the button — approval deliberately does not send it.
 * Re-sending is the same call: it mints a fresh magic link for the same
 * account, which is also the recovery when the first one expired unread.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!email) {
    return NextResponse.json({ error: 'An email address is required.' }, { status: 400 })
  }

  const result = await sendPortalInvite(id, email, name || null)
  if (!result.emailed) {
    return NextResponse.json({ error: result.note || 'The invite did not send.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to: result.to })
}
