import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setSetting, YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'
import { getChannelInfo, isYouTubeConfigured, getYouTubeCredentials } from '@/lib/integrations/youtube'

export async function POST() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Debug: Check if credentials exist
    const credentials = await getYouTubeCredentials()
    console.log('YouTube credentials check:', {
      hasClientId: !!credentials?.clientId,
      hasClientSecret: !!credentials?.clientSecret,
      hasRefreshToken: !!credentials?.refreshToken,
      hasAccessToken: !!credentials?.accessToken,
    })

    const configured = await isYouTubeConfigured()
    if (!configured) {
      return NextResponse.json({
        success: false,
        error: 'YouTube not configured - missing credentials',
        debug: {
          hasClientId: !!credentials?.clientId,
          hasClientSecret: !!credentials?.clientSecret,
          hasRefreshToken: !!credentials?.refreshToken,
        }
      }, { status: 400 })
    }

    // Fetch channel info
    const channel = await getChannelInfo()
    if (!channel) {
      return NextResponse.json({
        success: false,
        error: 'Could not retrieve channel info from YouTube API',
      }, { status: 400 })
    }

    // Save channel info
    await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_ID, channel.id)
    await setSetting(YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_TITLE, channel.title)

    return NextResponse.json({
      success: true,
      channelId: channel.id,
      channelTitle: channel.title,
    })
  } catch (error) {
    console.error('Failed to refresh YouTube channel info:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh channel info',
    }, { status: 500 })
  }
}
