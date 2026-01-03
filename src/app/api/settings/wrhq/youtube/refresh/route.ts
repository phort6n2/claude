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
    const debugInfo = {
      hasClientId: !!credentials?.clientId,
      hasClientSecret: !!credentials?.clientSecret,
      hasRefreshToken: !!credentials?.refreshToken,
      hasAccessToken: !!credentials?.accessToken,
      tokenExpiry: credentials?.tokenExpiry,
      tokenExpiryDate: credentials?.tokenExpiry ? new Date(credentials.tokenExpiry).toISOString() : null,
    }
    console.log('YouTube credentials check:', debugInfo)

    if (!credentials) {
      return NextResponse.json({
        success: false,
        error: 'YouTube not configured - missing credentials',
        debug: debugInfo
      }, { status: 400 })
    }

    // Try to get channel info with detailed error reporting
    let channel: { id: string; title: string } | null = null
    try {
      channel = await getChannelInfo()
    } catch (channelError) {
      console.error('getChannelInfo error:', channelError)
      return NextResponse.json({
        success: false,
        error: channelError instanceof Error ? channelError.message : 'Unknown channel info error',
        debug: debugInfo
      }, { status: 400 })
    }

    if (!channel) {
      return NextResponse.json({
        success: false,
        error: 'No channel found for authenticated YouTube account',
        debug: debugInfo
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
