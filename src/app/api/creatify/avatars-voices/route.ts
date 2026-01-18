import { NextRequest, NextResponse } from 'next/server'
import { getAvatars, getVoices } from '@/lib/integrations/creatify'

/**
 * GET /api/creatify/avatars-voices
 * Returns available Creatify avatars and voices for video generation
 *
 * Query params:
 * - search: Filter avatars/voices by name (case-insensitive partial match)
 * - avatarOnly: Only return avatars
 * - voiceOnly: Only return voices
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()
    const avatarOnly = searchParams.get('avatarOnly') === 'true'
    const voiceOnly = searchParams.get('voiceOnly') === 'true'

    // Fetch avatars and voices in parallel
    const [allAvatars, allVoices] = await Promise.all([
      voiceOnly ? Promise.resolve([]) : getAvatars(),
      avatarOnly ? Promise.resolve([]) : getVoices(),
    ])

    // Filter by search term if provided
    let avatars = allAvatars
    let voices = allVoices

    if (search) {
      avatars = allAvatars.filter(a =>
        a.name.toLowerCase().includes(search) ||
        a.id.toLowerCase().includes(search)
      )
      voices = allVoices.filter(v =>
        v.name.toLowerCase().includes(search) ||
        v.accents.some(a => a.name.toLowerCase().includes(search))
      )
    }

    // Build helpful response with IDs clearly shown
    const response: Record<string, unknown> = {}

    if (!voiceOnly) {
      response.avatars = avatars.map(a => ({
        id: a.id,
        name: a.name,
        gender: a.gender,
        style: a.style,
        location: a.location,
        thumbnail: a.thumbnail_url,
        // Show the ID prominently for copy/paste
        useThisId: a.id,
      }))
      response.avatarCount = avatars.length
    }

    if (!avatarOnly) {
      response.voices = voices.map(v => ({
        id: v.id,
        name: v.name,
        gender: v.gender,
        accents: v.accents.map((a, index) => ({
          id: a.id,
          // Use name, accent, language, or fallback to variant number
          name: a.name || a.accent || a.language || `Variant ${index + 1}`,
          accent: a.accent || a.name || a.language || '',
          language: a.language,
          // Show the accent ID prominently for copy/paste
          useThisId: a.id,
        })),
        // Use first accent ID as default
        useThisId: v.accents[0]?.id || v.id,
      }))
      response.voiceCount = voices.length
    }

    response.usage = {
      description: 'Copy the "useThisId" value into client settings',
      searchTip: 'Add ?search=benjamin or ?search=miles to filter results',
      example: {
        avatarId: avatars[0]?.id || 'uuid-here',
        voiceId: voices[0]?.accents[0]?.id || voices[0]?.id || 'uuid-here',
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching Creatify avatars/voices:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch avatars and voices' },
      { status: 500 }
    )
  }
}
