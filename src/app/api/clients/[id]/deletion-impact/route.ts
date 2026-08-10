import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { getDeletionImpact } from '@/lib/client-teardown'

export const dynamic = 'force-dynamic'

/**
 * What deleting this client would destroy.
 *
 * Read-only, and the whole point of it. "Are you sure?" is a question nobody
 * reads. "This deletes 412 leads going back to March 2023, including 96 sold
 * jobs worth $38,400" is one they answer.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const impact = await getDeletionImpact(id)
  if (!impact) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  return NextResponse.json(impact)
}
