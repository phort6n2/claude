import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { measureStaleLogos } from '@/lib/logo-surface-measure'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — record which background every header logo was drawn for, so a logo
 * made for a dark background gets a dark header (lib/logo-surface.ts).
 *
 * The save hooks measure from now on; every logo saved before they existed
 * needs this once. `?dryRun=1` (the Maintenance runner sends no body) lists
 * who would be measured and fetches nothing; `?force=1` re-reads logos that
 * already have a reading, for after the rule changes.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const params = new URL(request.url).searchParams
  const body = await request.json().catch(() => null)
  const dryRun = params.get('dryRun') === '1' || body?.dryRun === true
  const force = params.has('force') || body?.force === true

  const rows = await measureStaleLogos({ dryRun, force })
  return NextResponse.json({
    dryRun,
    checked: rows.length,
    darkHeaders: rows.filter((r) => r.surface === 'dark').map((r) => r.businessName),
    failed: rows.filter((r) => r.error).length,
    results: rows,
  })
}
