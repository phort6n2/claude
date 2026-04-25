import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/portal/leads/[id]/call-analysis
 *
 * Returns the most recent CallAnalysis row for the given lead, scoped to the
 * authenticated client's portal session. Used by the lead detail page to
 * render the coaching report and to poll while the analysis is in flight.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Make sure the lead actually belongs to this client before exposing
  // anything tied to it.
  const lead = await prisma.lead.findFirst({
    where: { id, clientId: session.clientId },
    select: { id: true, callRecordingUrl: true, highlevelContactId: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Prefer a CallAnalysis directly linked to this lead. Fall back to one
  // matching by HighLevel contact ID — the recording webhook may have arrived
  // before the lead was created, so the analysis row might not yet have its
  // leadId set.
  let analysis = await prisma.callAnalysis.findFirst({
    where: { leadId: lead.id, clientId: session.clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      score: true,
      outcome: true,
      analysis: true,
      audioMetrics: true,
      durationSeconds: true,
      recordingUrl: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
    },
  })

  if (!analysis && lead.highlevelContactId) {
    analysis = await prisma.callAnalysis.findFirst({
      where: {
        clientId: session.clientId,
        highlevelContactId: lead.highlevelContactId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        score: true,
        outcome: true,
        analysis: true,
        audioMetrics: true,
        durationSeconds: true,
        recordingUrl: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    })
  }

  if (!analysis) {
    return NextResponse.json({ analysis: null })
  }

  // Don't surface raw error details to the client portal.
  const { errorMessage, ...safe } = analysis
  return NextResponse.json({ analysis: safe, hasError: Boolean(errorMessage) })
}
