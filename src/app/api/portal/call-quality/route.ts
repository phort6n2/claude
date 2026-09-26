import { NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'
import { getQualityTrend } from '@/lib/call-analysis/quality-trend'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/call-quality
 * Weekly call-quality trend for this client's team, and per rep where reps
 * give their names on the call. See lib/call-analysis/quality-trend.ts.
 */
export async function GET() {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await getQualityTrend(session.clientId, session.timezone))
  } catch (error) {
    console.error('Failed to load call quality trend:', error)
    return NextResponse.json({ error: 'Failed to load call quality' }, { status: 500 })
  }
}
