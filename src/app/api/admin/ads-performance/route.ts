import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getGoogleAdsCredentials } from '@/lib/google-ads'
import { getClientPerformance } from '@/lib/ads/performance'

export const dynamic = 'force-dynamic'
// One Google Ads API call per client plus DB joins; give it headroom.
export const maxDuration = 60

/**
 * GET /api/admin/ads-performance[?clientId=xxx]
 * Returns per-client ROAS / campaign performance for all clients (or one),
 * joining live Google Ads spend against real booked revenue.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = new URL(request.url).searchParams.get('clientId') || undefined

  try {
    const creds = await getGoogleAdsCredentials()
    if (!creds?.accessToken) {
      return NextResponse.json({ connected: false, clients: [] })
    }

    const clients = await getClientPerformance(clientId)
    return NextResponse.json({ connected: true, clients })
  } catch (error) {
    console.error('Failed to load ads-performance:', error)
    return NextResponse.json({ error: 'Failed to load performance' }, { status: 500 })
  }
}
