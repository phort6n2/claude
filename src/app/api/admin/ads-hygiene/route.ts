import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getGoogleAdsCredentials } from '@/lib/google-ads'
import { auditAllClients } from '@/lib/ads/hygiene'

export const dynamic = 'force-dynamic'
// The audit fans out several Google Ads API calls per client; give it headroom.
export const maxDuration = 60

/**
 * GET /api/admin/ads-hygiene[?clientId=xxx]
 * Returns the account-hygiene audit for all clients (or one).
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

    const clients = await auditAllClients(clientId)
    return NextResponse.json({ connected: true, clients })
  } catch (error) {
    console.error('Failed to run ads-hygiene audit:', error)
    return NextResponse.json({ error: 'Failed to run audit' }, { status: 500 })
  }
}
