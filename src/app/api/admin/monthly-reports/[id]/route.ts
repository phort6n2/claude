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

/**
 * DELETE — throw away a report that was built and never sent.
 *
 * For a month nobody wants reported (August 2026, built by hand after
 * reporting shipped mid-September) or a build that came out wrong. A report
 * already SENT is refused: the shop has that email, and the stored copy is
 * the record of what they were told — the same rule that stops it being
 * rebuilt.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const existing = await prisma.clientMonthlyReport
    .findUnique({ where: { id }, select: { sentAt: true } })
    .catch(() => null)
  if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  if (existing.sentAt) {
    return NextResponse.json(
      { error: 'This report has been sent, so it stays: the shop has that email.' },
      { status: 409 }
    )
  }
  await prisma.clientMonthlyReport.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
