import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getGoogleAdsCredentials } from '@/lib/google-ads'
import { getNegativeSuggestions } from '@/lib/ads/negative-keywords'

export const dynamic = 'force-dynamic'
// One search-terms report per client; give the fan-out headroom.
export const maxDuration = 60

/**
 * GET /api/admin/ads-negatives[?clientId=xxx]
 * Returns negative-keyword suggestions per client.
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

    const clients = await getNegativeSuggestions(clientId)
    return NextResponse.json({ connected: true, clients })
  } catch (error) {
    console.error('Failed to run negative-keyword analysis:', error)
    return NextResponse.json({ error: 'Failed to run analysis' }, { status: 500 })
  }
}
