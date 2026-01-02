import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { YOUTUBE_SETTINGS_KEYS } from '@/lib/settings'

export async function POST() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Delete all YouTube-related settings except client credentials
    await prisma.setting.deleteMany({
      where: {
        key: {
          in: [
            YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_REFRESH_TOKEN,
            YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_ACCESS_TOKEN,
            YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_TOKEN_EXPIRY,
            YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_ID,
            YOUTUBE_SETTINGS_KEYS.WRHQ_YOUTUBE_CHANNEL_TITLE,
          ],
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to disconnect YouTube:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect YouTube' },
      { status: 500 }
    )
  }
}
