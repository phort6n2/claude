import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getGoogleAdsAuthUrl } from '@/lib/google-ads'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/google-ads/connect
 * Initiates Google Ads OAuth flow
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if required env vars are set
  if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Google Ads API credentials not configured' },
      { status: 500 }
    )
  }

  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex')

  // Store state in a cookie for verification (expires in 10 minutes)
  const authUrl = getGoogleAdsAuthUrl(state)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('google_ads_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  })

  return response
}
