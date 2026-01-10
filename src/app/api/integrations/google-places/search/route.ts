import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

async function getApiKey(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'GOOGLE_PLACES_API_KEY' },
  })
  if (setting?.encrypted) {
    try {
      return decrypt(setting.value)
    } catch {
      return null
    }
  }
  return setting?.value || process.env.GOOGLE_PLACES_API_KEY || null
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')

  if (!query || query.length < 2) {
    return NextResponse.json({ predictions: [] })
  }

  const apiKey = await getApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Google Places API key not configured' },
      { status: 400 }
    )
  }

  try {
    // Search for businesses (establishments) in US and Canada
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
      `input=${encodeURIComponent(query)}` +
      `&types=establishment` +
      `&key=${apiKey}`
    )

    const data = await response.json()

    if (data.status === 'REQUEST_DENIED') {
      return NextResponse.json(
        { error: data.error_message || 'Google Places API request denied' },
        { status: 400 }
      )
    }

    // Return simplified predictions
    const predictions = (data.predictions || []).map((p: {
      place_id: string
      description: string
      structured_formatting?: {
        main_text: string
        secondary_text: string
      }
    }) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || '',
    }))

    return NextResponse.json({ predictions })
  } catch (error) {
    console.error('Google Places search error:', error)
    return NextResponse.json(
      { error: 'Failed to search places' },
      { status: 500 }
    )
  }
}
