import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, storeGBPTokens, refreshClientPhotos } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gbp/oauth/callback
 * Handle OAuth callback from Google
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // Contains client ID
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || 'Unknown error'
      console.error('OAuth error:', error, errorDescription)
      return NextResponse.redirect(
        new URL(`/admin/clients/${state}/gbp?error=${encodeURIComponent(errorDescription)}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/admin?error=missing_oauth_params', request.url)
      )
    }

    const clientId = state

    // Get the redirect URI
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const redirectUri = `${baseUrl}/api/gbp/oauth/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Store tokens for the client
    await storeGBPTokens(
      clientId,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn
    )

    // Fetch photos immediately after connecting
    try {
      await refreshClientPhotos(clientId)
    } catch (photoError) {
      console.error('Failed to fetch initial photos:', photoError)
      // Don't fail the whole flow if photo fetch fails
    }

    // Redirect back to the client's GBP settings page
    return NextResponse.redirect(
      new URL(`/admin/clients/${clientId}/gbp?success=connected`, request.url)
    )
  } catch (error) {
    console.error('OAuth callback error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(errorMessage)}`, request.url)
    )
  }
}
