import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * PATCH — the operator's "what's next" note for one month.
 *
 * The only free text in the report, and the only text in it a person writes.
 * Editable after sending too: the portal page renders the same note, so a
 * correction still reaches the shop even when the email has gone.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  if (typeof body?.note !== 'string') {
    return NextResponse.json({ error: 'note must be a string' }, { status: 400 })
  }
  const note = body.note.trim()

  try {
    await prisma.clientMonthlyReport.update({
      where: { id },
      // Empty means none, not an empty paragraph in the email.
      data: { note: note || null },
    })
  } catch {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
