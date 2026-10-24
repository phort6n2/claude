import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/db'
import { requirePortalSession } from '@/lib/portal-guard'
import { portalView, validReason } from '@/lib/bad-lead-view'
import { markBadLead, processBadLead, undoBadLead } from '@/lib/bad-lead-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * "Bad lead" from the shop's own portal. Marking is the whole of what a shop
 * can do: the trace and any negative are the pipeline's, under its checks, and
 * the shop is shown which searches were stopped — never the controls.
 */
async function ownLead(id: string, clientId: string) {
  const lead = await prisma.lead.findFirst({ where: { id, clientId }, select: { id: true } })
  return !!lead
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const guard = await requirePortalSession()
  if ('response' in guard) return guard.response
  const { id } = await params
  if (!(await ownLead(id, guard.session.clientId))) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json(await portalView(id))
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const guard = await requirePortalSession({ mutating: true })
  if ('response' in guard) return guard.response
  const { id } = await params
  if (!(await ownLead(id, guard.session.clientId))) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  if (!validReason(body.reason)) return NextResponse.json({ error: 'Choose a reason.' }, { status: 400 })
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  if (body.reason === 'other' && !notes) return NextResponse.json({ error: 'Tell us what was wrong with it.' }, { status: 400 })
  const mark = await markBadLead({ leadId: id, reason: body.reason, notes, by: guard.session.email, role: 'client' })
  if (!mark) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  after(() => processBadLead(mark.id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const guard = await requirePortalSession({ mutating: true })
  if ('response' in guard) return guard.response
  const { id } = await params
  if (!(await ownLead(id, guard.session.clientId))) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const res = await undoBadLead(id, guard.session.email)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 })
  return NextResponse.json({ ok: true })
}
