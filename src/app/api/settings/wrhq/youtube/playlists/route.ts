import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPlaylists, isYouTubeConfigured } from '@/lib/integrations/youtube'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const isConfigured = await isYouTubeConfigured()
    if (!isConfigured) {
      return NextResponse.json({
        connected: false,
        playlists: [],
        error: 'YouTube not configured',
      })
    }

    const playlists = await getPlaylists()

    return NextResponse.json({
      connected: true,
      playlists,
    })
  } catch (error) {
    console.error('Failed to get YouTube playlists:', error)
    return NextResponse.json({
      connected: false,
      playlists: [],
      error: error instanceof Error ? error.message : 'Failed to get playlists',
    })
  }
}
