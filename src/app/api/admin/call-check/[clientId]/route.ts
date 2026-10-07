import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { runCallCheck } from '@/lib/call-check-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One shop's Call check for the admin page — the work is in
 * lib/call-check-run.ts, shared with the scheduled run. `?days=` is the
 * window, capped at a year.
 */

const ALLOWED_DAYS = [30, 90, 180, 365]

export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { clientId } = await params
  const asked = parseInt(new URL(request.url).searchParams.get('days') || '90', 10)
  const days = ALLOWED_DAYS.includes(asked) ? asked : 90
  const result = await runCallCheck(clientId, days)
  if (!result) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  return NextResponse.json(result)
}
