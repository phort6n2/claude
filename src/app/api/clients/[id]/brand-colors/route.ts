import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { applyBrandScan } from '@/lib/brand-scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — read this client's colours off their website and save them.
 *
 * The button on the Branding card. It SAVES, unlike the social-links scan,
 * because the colours are the whole answer and the card shows them the moment
 * they land; a reading that needed a second press to keep would be one more
 * step between the shop and a site in its own colours. Pressing it overrides
 * colours chosen by hand — the press is the choice — and anybody who dislikes
 * the result changes a swatch, which marks them hand-chosen again.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const result = await applyBrandScan(id, { force: true })
  const status = result.status === 'skipped' && result.note === 'client not found' ? 404 : 200
  return NextResponse.json(result, { status })
}
