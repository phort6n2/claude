import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getGoogleAdsAuthUrl, getOAuthCredentials } from '@/lib/google-ads'
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

  // Check if OAuth credentials are configured in the database
  const oauthCreds = await getOAuthCredentials()
  if (!oauthCreds) {
    // Redirect back with error
    return NextResponse.redirect(
      new URL('/admin/settings/google-ads?error=oauth_not_configured', process.env.NEXT_PUBLIC_APP_URL!)
    )
  }

  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex')

  // Get the auth URL (now async)
  const authUrl = await getGoogleAdsAuthUrl(state)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('google_ads_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  })

  return response
}
