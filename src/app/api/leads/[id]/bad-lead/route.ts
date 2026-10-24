import { NextRequest, NextResponse, after } from 'next/server'
import { auth } from '@/lib/auth'
import { targetCpaUser } from '@/lib/target-cpa-access'
import { adminView, validReason } from '@/lib/bad-lead-view'
import { autoEnabled, markBadLead, processBadLead, undoBadLead } from '@/lib/bad-lead-run'

export const dynamic = 'force-dynamic'
// The trace, the model and up to five checked writes run after the response.
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * "Bad lead" on a lead, for an admin. Any signed-in admin may mark one;
 * `canWrite` (the owner, the Target CPA rule) is what the panel needs to show
 * the Add and Undo controls, and the routes that do those check it again.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const view = await adminView(id)
  if (!view) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json({ ...view, canWrite: !!(await targetCpaUser()), autoEnabled: autoEnabled() })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (!validReason(body.reason)) return NextResponse.json({ error: 'Choose a reason.' }, { status: 400 })
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  if (body.reason === 'other' && !notes) return NextResponse.json({ error: 'Say what was wrong with it.' }, { status: 400 })
  const mark = await markBadLead({ leadId: id, reason: body.reason, notes, by: session.user.email, role: 'admin' })
  if (!mark) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  after(() => processBadLead(mark.id))
  return NextResponse.json({ ok: true, markId: mark.id })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const res = await undoBadLead(id, session.user.email)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 404 })
  return NextResponse.json(res)
}
