import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — { action: "dismiss" | "reopen" } on one finding.
 *
 * Dismiss means "known, stop telling me": the row keeps its history and the
 * daily run stops refreshing it. If the condition later clears and returns,
 * the run reopens the same row — a dismissal is not forever, it lasts as
 * long as the condition it dismissed.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')

  try {
    if (action === 'dismiss') {
      await prisma.adsFinding.update({
        where: { id },
        data: { status: 'DISMISSED', dismissedAt: new Date() },
      })
      return NextResponse.json({ ok: true })
    }
    if (action === 'reopen') {
      await prisma.adsFinding.update({
        where: { id },
        data: { status: 'OPEN', dismissedAt: null, resolvedAt: null },
      })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
