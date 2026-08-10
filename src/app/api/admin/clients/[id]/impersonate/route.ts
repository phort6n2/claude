import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createPortalSession, createClientPreviewSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

/**
 * POST — start viewing the client portal as one of this client's users.
 *
 * Mints a short-lived, signed portal session flagged as impersonation. The
 * flag lives inside the HMAC, so it cannot be stripped to escalate into a
 * full client session, and portal-guard refuses every mutating request while
 * it is set. Admin only; every start is logged.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const clientUser = body.clientUserId
      ? await prisma.clientUser.findFirst({ where: { id: body.clientUserId, clientId: id } })
      : await prisma.clientUser.findFirst({
          where: { clientId: id, isActive: true },
          orderBy: { createdAt: 'asc' },
        })

    // No portal user is the normal case, not an error. Most clients never get
    // a login, and "add a real credential before you can look" is a bad price
    // for a read-only preview — the credential outlives the look.
    if (!clientUser) {
      const client = await prisma.client.findUnique({ where: { id }, select: { businessName: true } })
      if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

      await createClientPreviewSession(id, {
        impersonatedBy: session.user.id,
        adminEmail: session.user.email || 'admin',
        ttlMinutes: 30,
      })
      console.warn(
        `[Impersonation] START admin=${session.user.email} clientId=${id} clientUser=(none) at=${new Date().toISOString()}`
      )
      return NextResponse.json({ ok: true, email: null, businessName: client.businessName })
    }

    await createPortalSession(clientUser.id, {
      impersonatedBy: session.user.id,
      adminEmail: session.user.email || 'admin',
      ttlMinutes: 30,
    })

    // Audit trail: who viewed whose portal, and when.
    console.warn(
      `[Impersonation] START admin=${session.user.email} clientId=${id} clientUser=${clientUser.email} at=${new Date().toISOString()}`
    )

    return NextResponse.json({ ok: true, email: clientUser.email })
  } catch (error) {
    console.error('Failed to start impersonation:', error)
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 })
  }
}
