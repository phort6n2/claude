import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, storeGBPTokens, refreshClientPhotos } from '@/lib/integrations/google-business'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gbp/oauth/callback
 * Handle OAuth callback from Google
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state') // Contains client ID
  const clientId = state

  // Helper to redirect with error
  const redirectWithError = (errorMessage: string) => {
    const redirectPath = clientId
      ? `/admin/clients/${clientId}/gbp?error=${encodeURIComponent(errorMessage)}`
      : `/admin/gbp?error=${encodeURIComponent(errorMessage)}`
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  try {
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    // Handle OAuth errors from Google
    if (error) {
      const errorDescription = searchParams.get('error_description') || error
      console.error('OAuth error:', error, errorDescription)
      return redirectWithError(errorDescription)
    }

    if (!code || !clientId) {
      return redirectWithError('Missing OAuth parameters')
    }

    // Get the redirect URI
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const redirectUri = `${baseUrl}/api/gbp/oauth/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Store tokens for the client (clientId is guaranteed to be string after the check above)
    try {
      await storeGBPTokens(
        clientId as string,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn
      )
    } catch (storeError) {
      console.error('Failed to store tokens or fetch accounts:', storeError)
      const errorMsg = storeError instanceof Error ? storeError.message : 'Failed to connect'

      // Check for quota/API access errors
      if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Quota exceeded')) {
        return redirectWithError('Google My Business API access required. Apply at: developers.google.com/my-business')
      }

      return redirectWithError(errorMsg)
    }

    // Fetch photos immediately after connecting
    try {
      await refreshClientPhotos(clientId as string)
    } catch (photoError) {
      console.error('Failed to fetch initial photos:', photoError)
      // Don't fail the whole flow if photo fetch fails
    }

    // Redirect back to the client's GBP settings page
    return NextResponse.redirect(
      new URL(`/admin/clients/${clientId as string}/gbp?success=connected`, request.url)
    )
  } catch (error) {
    console.error('OAuth callback error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return redirectWithError(errorMessage)
  }
}
