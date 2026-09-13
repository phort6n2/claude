import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'

// Mark a shop signal dealt with, or put it back.
//
// DISMISSED, never deleted: the history is who has been circling. A shop that
// claimed a listing in March and slipped in rank in May is one conversation,
// and the second event is far more useful with the first still visible.
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const status = body?.status === 'NEW' ? 'NEW' : 'DISMISSED'

  const row = await prisma.directorySignal
    .update({
      where: { id },
      data: { status, dismissedAt: status === 'DISMISSED' ? new Date() : null },
      select: { id: true, status: true },
    })
    .catch(() => null)
  if (!row) return NextResponse.json({ error: 'Signal not found' }, { status: 404 })

  return NextResponse.json({ ok: true, ...row })
}
