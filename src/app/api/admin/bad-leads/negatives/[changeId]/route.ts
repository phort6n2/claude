import { NextRequest, NextResponse } from 'next/server'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'
import { undoNegativeChange } from '@/lib/bad-lead-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Undo one negative: removes exactly the criterion that was added, by its resource name. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ changeId: string }> }) {
  const gate = await requireTargetCpaApi()
  if ('denied' in gate) return gate.denied
  const { changeId } = await params
  const res = await undoNegativeChange(changeId, gate.email)
  if (!res.ok) return NextResponse.json(res, { status: 502 })
  return NextResponse.json(res)
}
