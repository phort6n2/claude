import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSetting, setSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'
import { exchangeCodeForTokens, getChannelInfo } from '@/lib/integrations/youtube'

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

    // Save tokens
    await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_ACCESS_TOKEN, tokens.accessToken)
    await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_REFRESH_TOKEN, tokens.refreshToken)
    await setSetting(
      YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_TOKEN_EXPIRY,
      (Date.now() + tokens.expiresIn * 1000).toString()
    )

    // Get channel info
    const channel = await getChannelInfo()
    if (channel) {
      await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_ID, channel.id)
      await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_TITLE, channel.title)
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
