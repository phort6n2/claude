import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSetting, setSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'
import { exchangeCodeForTokens } from '@/lib/integrations/youtube'

export async function GET(request: Request) {
  const session = await auth()
  if (!session) {
    // Redirect to settings page with error
    return NextResponse.redirect(new URL('/admin/settings/wrhq?error=unauthorized', request.url))
  }

  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error) {
      console.error('OAuth error:', error)
      return NextResponse.redirect(
        new URL(`/admin/settings/wrhq?error=${encodeURIComponent(error)}`, request.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin/settings/wrhq?error=no_code', request.url)
      )
    }

    // Get stored credentials
    const clientId = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CLIENT_ID)
    const clientSecret = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CLIENT_SECRET)

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/admin/settings/wrhq?error=credentials_not_found', request.url)
      )
    }

    const redirectUri = `${url.origin}/api/settings/wrhq/youtube/callback`

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri)

    console.log('OAuth tokens received:', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    })

    // Validate we have a refresh token - Google only sends it on first authorization or with prompt=consent
    if (!tokens.refreshToken) {
      console.error('No refresh token received from Google OAuth')
      return NextResponse.redirect(
        new URL('/admin/settings/wrhq?error=no_refresh_token', request.url)
      )
    }

    // Save tokens
    await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_ACCESS_TOKEN, tokens.accessToken)
    await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_REFRESH_TOKEN, tokens.refreshToken)
    await setSetting(
      YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_TOKEN_EXPIRY,
      (Date.now() + tokens.expiresIn * 1000).toString()
    )

    console.log('Tokens saved to settings, fetching channel info...')

    // Get channel info using the fresh access token directly
    try {
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to get channel info in callback:', errorText)
      } else {
        const data = await response.json()
        if (data.items && data.items.length > 0) {
          const channel = data.items[0]
          console.log('Channel info retrieved:', { id: channel.id, title: channel.snippet.title })
          await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_ID, channel.id)
          await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_TITLE, channel.snippet.title)
        } else {
          console.warn('No channel found for authenticated user')
        }
      }
    } catch (channelError) {
      console.error('Error fetching channel info in callback:', channelError)
      // Continue anyway - user can refresh later
    }

    // Redirect back to settings with success
    return NextResponse.redirect(
      new URL('/admin/settings/wrhq?youtube=connected', request.url)
    )
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(`/admin/settings/wrhq?error=${encodeURIComponent('oauth_failed')}`, request.url)
    )
  }
}
