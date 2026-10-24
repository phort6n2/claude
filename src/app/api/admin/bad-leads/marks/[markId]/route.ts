import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'
import { dismissProposal, processBadLead } from '@/lib/bad-lead-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** retrace: run the trace and the pick again. dismiss: drop one queued suggestion without adding it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ markId: string }> }) {
  const gate = await requireTargetCpaApi()
  if ('denied' in gate) return gate.denied
  const { markId } = await params
  const b = await req.json().catch(() => ({}))
  const mark = await prisma.badLeadMark.findUnique({ where: { id: markId } })
  if (!mark) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (b.action === 'retrace') {
    if (mark.undoneAt) return NextResponse.json({ error: 'This mark was undone.' }, { status: 409 })
    await prisma.badLeadMark.update({ where: { id: markId }, data: { status: 'tracing' } })
    after(() => processBadLead(markId))
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'dismiss' && typeof b.text === 'string' && typeof b.matchType === 'string') {
    await dismissProposal(markId, b.text, b.matchType)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
