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

interface PlaceDetails {
  placeId: string
  businessName: string
  phone: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country: string
  googleMapsUrl: string
  website?: string
  rating?: number
  reviewCount?: number
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const placeId = searchParams.get('placeId')

  if (!placeId) {
    return NextResponse.json({ error: 'Place ID required' }, { status: 400 })
  }

  const apiKey = await getApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Google Places API key not configured' },
      { status: 400 }
    )
  }

  try {
    // Fetch place details with all the fields we need
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?` +
      `place_id=${encodeURIComponent(placeId)}` +
      `&fields=place_id,name,formatted_phone_number,formatted_address,address_components,url,website,rating,user_ratings_total` +
      `&key=${apiKey}`
    )

    const data = await response.json()

    if (data.status === 'REQUEST_DENIED') {
      return NextResponse.json(
        { error: data.error_message || 'Google Places API request denied' },
        { status: 400 }
      )
    }

    if (data.status !== 'OK' || !data.result) {
      return NextResponse.json(
        { error: 'Place not found' },
        { status: 404 }
      )
    }

    const place = data.result

    // Parse address components
    const addressComponents: Record<string, string> = {}
    for (const component of place.address_components || []) {
      const types = component.types as string[]
      if (types.includes('street_number')) {
        addressComponents.streetNumber = component.long_name
      }
      if (types.includes('route')) {
        addressComponents.route = component.long_name
      }
      if (types.includes('locality')) {
        addressComponents.city = component.long_name
      }
      if (types.includes('administrative_area_level_1')) {
        addressComponents.state = component.short_name
      }
      if (types.includes('postal_code')) {
        addressComponents.postalCode = component.long_name
      }
      if (types.includes('country')) {
        addressComponents.country = component.short_name
      }
    }

    // Build street address
    const streetAddress = [
      addressComponents.streetNumber,
      addressComponents.route,
    ].filter(Boolean).join(' ')

    const details: PlaceDetails = {
      placeId: place.place_id,
      businessName: place.name || '',
      phone: place.formatted_phone_number || '',
      streetAddress: streetAddress || '',
      city: addressComponents.city || '',
      state: addressComponents.state || '',
      postalCode: addressComponents.postalCode || '',
      country: addressComponents.country || 'US',
      googleMapsUrl: place.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      website: place.website,
      rating: place.rating,
      reviewCount: place.user_ratings_total,
    }

    return NextResponse.json(details)
  } catch (error) {
    console.error('Google Places details error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch place details' },
      { status: 500 }
    )
  }
}
