import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { leadIdFromToken } from '@/lib/lead-outcome-token'

export const dynamic = 'force-dynamic'

/**
 * POST /api/lead-outcome
 *
 * Records what happened to one lead, authorised by the signed link in the
 * alert rather than by a session. See lead-outcome-token.ts for why.
 *
 * Accepts a change of mind: a lead marked won and then corrected to lost has
 * to be able to move back, because the alternative is a shop learning that
 * the button is dangerous and never touching it again.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = String(body.token || '')
  const outcome = String(body.outcome || '')

  const leadId = leadIdFromToken(token)
  if (!leadId) {
    return NextResponse.json({ error: 'That link is not valid.' }, { status: 403 })
  }
  if (outcome !== 'won' && outcome !== 'lost') {
    return NextResponse.json({ error: 'Unknown outcome.' }, { status: 400 })
  }

  // Amount is optional on purpose. A tap that records "we booked it" with no
  // number is worth far more than a form that insists on one and gets closed.
  let saleValue: number | null = null
  if (outcome === 'won' && body.amount !== undefined && body.amount !== null && body.amount !== '') {
    const parsed = Number(String(body.amount).replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json({ error: 'That amount does not look like a number.' }, { status: 400 })
    }
    // A five-figure windscreen is a typo, not a job. Cap rather than reject,
    // so a slipped keypress does not poison a revenue total.
    if (parsed > 100_000) {
      return NextResponse.json({ error: 'That amount looks wrong — check it and try again.' }, { status: 400 })
    }
    saleValue = parsed
  }

  try {
    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, saleDate: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'That lead no longer exists.' }, { status: 404 })
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: outcome === 'won' ? 'SOLD' : 'LOST',
        statusUpdatedAt: new Date(),
        // Not a ClientUser id — nobody signed in. Named so the source of the
        // change is obvious in a row that otherwise looks like it edited itself.
        statusUpdatedBy: 'lead-alert-link',
        ...(outcome === 'won'
          ? {
              ...(saleValue !== null ? { saleValue } : {}),
              // Keep the original booking date if this is a correction of the
              // amount rather than a new booking.
              saleDate: existing.saleDate ?? new Date(),
            }
          : { saleValue: null, saleDate: null }),
      },
      select: { id: true, status: true, saleValue: true },
    })

    return NextResponse.json({ ok: true, status: lead.status, saleValue: lead.saleValue })
  } catch (error) {
    console.error('[Lead outcome] Failed:', error)
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }
}
