import { NextResponse } from 'next/server'
import { getAvatars, getVoices } from '@/lib/integrations/creatify'

/**
 * GET /api/creatify/avatars-voices
 * Returns available Creatify avatars and voices for video generation
 */
export async function GET() {
  try {
    // Fetch avatars and voices in parallel
    const [avatars, voices] = await Promise.all([
      getAvatars(),
      getVoices(),
    ])

    return NextResponse.json({
      avatars,
      voices,
      usage: {
        description: 'Use these IDs when generating videos',
        example: {
          avatarId: avatars[0]?.id || 'avatar-id-here',
          voiceId: voices[0]?.id || 'voice-id-here',
        },
      },
    })
  } catch (error) {
    console.error('Error fetching Creatify avatars/voices:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch avatars and voices' },
      { status: 500 }
    )
  }
}
