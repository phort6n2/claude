import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/leads/[id]/call-analysis
 *
 * Admin-auth'd version of the portal call-analysis endpoint. Used by the
 * master-leads view to render the same coaching report.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, clientId: true, highlevelContactId: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  let analysis = await prisma.callAnalysis.findFirst({
    where: { leadId: lead.id },
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
        clientId: lead.clientId,
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

  // Admins see the error message — useful for debugging stuck/failed rows.
  return NextResponse.json({ analysis })
}
