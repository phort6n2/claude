import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'
import { getYouTubeOAuthUrl } from '@/lib/integrations/youtube'

export async function GET(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const clientId = await getSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CLIENT_ID)

    if (!clientId) {
      return NextResponse.json(
        { error: 'YouTube client ID not configured' },
        { status: 400 }
      )
    }

    // Build the redirect URI based on the request URL
    const url = new URL(request.url)
    const redirectUri = `${url.origin}/api/settings/wrhq/youtube/callback`

    const oauthUrl = getYouTubeOAuthUrl(clientId, redirectUri)

    return NextResponse.json({ url: oauthUrl })
  } catch (error) {
    console.error('Failed to generate OAuth URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' },
      { status: 500 }
    )
  }
}
