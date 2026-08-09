import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createPortalSession } from '@/lib/portal-auth'

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

    if (!clientUser) {
      return NextResponse.json(
        { error: 'This client has no portal user to view as. Add one first.' },
        { status: 404 }
      )
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
