import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { exchangeCodeForTokens } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/google-ads/callback
 * OAuth callback from Google
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.redirect(new URL('/admin/settings?error=unauthorized', request.url))
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Check for OAuth errors
  if (error) {
    console.error('Google Ads OAuth error:', error)
    return NextResponse.redirect(
      new URL(`/admin/settings?tab=google-ads&error=${encodeURIComponent(error)}`, request.url)
    )
  }

  // Verify state
  const storedState = request.cookies.get('google_ads_oauth_state')?.value
  if (!state || state !== storedState) {
    return NextResponse.redirect(
      new URL('/admin/settings?tab=google-ads&error=invalid_state', request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/admin/settings?tab=google-ads&error=no_code', request.url)
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Calculate token expiry
    const expiresIn = tokens.expires_in || 3600
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000)

    // Upsert the Google Ads config
    await prisma.googleAdsConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiry,
        isConnected: true,
      },
      update: {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        tokenExpiry,
        isConnected: true,
        lastError: null,
      },
    })

    // Clear the state cookie
    const response = NextResponse.redirect(
      new URL('/admin/settings?tab=google-ads&success=connected', request.url)
    )
    response.cookies.delete('google_ads_oauth_state')

    return response
  } catch (err) {
    console.error('Google Ads token exchange error:', err)
    return NextResponse.redirect(
      new URL('/admin/settings?tab=google-ads&error=token_exchange_failed', request.url)
    )
  }
}
