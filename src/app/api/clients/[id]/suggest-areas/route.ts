import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { suggestServiceAreas } from '@/lib/nearby-cities'

export const dynamic = 'force-dynamic'
// A model call plus a geocode per candidate.
export const maxDuration = 60

/**
 * POST — propose service-area cities for this client.
 *
 * Read-only: it writes nothing. The admin picks from what comes back and the
 * ordinary client PUT saves it, so a suggestion can never quietly become the
 * shop's stated coverage.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const result = await suggestServiceAreas(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.result)
}
