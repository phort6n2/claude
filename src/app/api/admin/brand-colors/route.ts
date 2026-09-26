import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { readUnreadBrandColors } from '@/lib/brand-scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — read the colours off every shop's website that has not been read,
 * for clients whose colours are still the defaults (or came from their site).
 * Colours chosen by hand are never touched.
 *
 * `?dryRun=1` (the Maintenance runner sends no body) names who would be read
 * and fetches nothing.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1' || body?.dryRun === true
  const results = await readUnreadBrandColors({ dryRun, budgetMs: 240_000 })
  return NextResponse.json({
    dryRun,
    checked: results.length,
    updated: results.filter((r) => r.status === 'updated').length,
    noReading: results.filter((r) => r.status === 'no-reading').length,
    results,
  })
}
