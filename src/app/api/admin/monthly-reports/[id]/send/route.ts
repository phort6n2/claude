import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { sendMonthlyReport } from '@/lib/monthly-report-email'

export const dynamic = 'force-dynamic'

/**
 * POST — email one stored report to the shop's portal logins.
 *
 * THE DELIBERATE HUMAN STEP. The cron builds on the 1st and stops here; this
 * is the press that reaches fifteen real business owners, and it cannot be
 * taken back. So it refuses a report that has already gone rather than
 * silently sending a second copy — `force: true` re-sends, and is in no UI.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const existing = await prisma.clientMonthlyReport
    .findUnique({ where: { id }, select: { sentAt: true, sentTo: true } })
    .catch(() => null)
  if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  if (existing.sentAt && body?.force !== true) {
    return NextResponse.json(
      {
        error: `Already sent ${existing.sentAt.toISOString().slice(0, 10)} to ${
          existing.sentTo.join(', ') || 'nobody recorded'
        }. Sending again would be a second copy of the same month.`,
      },
      { status: 409 }
    )
  }

  const result = await sendMonthlyReport(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json({
    ok: true,
    sentTo: result.sentTo,
    message: `Sent to ${result.sentTo?.join(', ')}.`,
  })
}
