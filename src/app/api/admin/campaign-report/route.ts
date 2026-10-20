import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { getCampaignReport } from '@/lib/campaign-report-fetch'

export const dynamic = 'force-dynamic'

/** The admin home's campaign table, re-read. `?fresh=1` skips the short
 *  cache — that is what the Refresh button is for. Read-only. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const fresh = req.nextUrl.searchParams.get('fresh') === '1'
  return NextResponse.json(await getCampaignReport({ fresh }))
}
