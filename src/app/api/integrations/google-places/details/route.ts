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
  /** One line per day, exactly as Google writes it. */
  hoursLines?: string[]
  /** The same schedule condensed onto one line for the site's hours field. */
  hours?: string
  website?: string
  /** Grid centre for local-rank scans. */
  latitude?: number | null
  longitude?: number | null
  rating?: number
  reviewCount?: number
}

/**
 * Fold Google's seven lines into one the site can print.
 *
 * Google returns "Monday: 8:00 AM – 5:00 PM" per day. Printing all seven in
 * a footer card is noise, so consecutive days sharing a schedule are grouped
 * — "Mon–Fri 8:00 AM – 5:00 PM, Sat 9:00 AM – 2:00 PM" — which is how a shop
 * writes its own hours anyway. It stays editable afterwards; this is a
 * starting point, not a lock.
 */
const SHORT_DAY: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
}

function condenseHours(weekdayText: string[]): string {
  const parsed = weekdayText
    .map((line) => {
      const [day, ...rest] = line.split(': ')
      return { day: SHORT_DAY[day.trim()] || day.trim(), hours: rest.join(': ').trim() }
    })
    .filter((entry) => entry.day && entry.hours)
  if (parsed.length === 0) return ''

  const groups: Array<{ days: string[]; hours: string }> = []
  for (const entry of parsed) {
    const last = groups[groups.length - 1]
    if (last && last.hours === entry.hours) last.days.push(entry.day)
    else groups.push({ days: [entry.day], hours: entry.hours })
  }

  return groups
    .map((group) => {
      const span =
        group.days.length > 2
          ? `${group.days[0]}–${group.days[group.days.length - 1]}`
          : group.days.join(', ')
      // "Closed" reads better without a range in front of it.
      return /closed/i.test(group.hours) ? `${span} closed` : `${span} ${group.hours}`
    })
    .join(', ')
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
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
      // opening_hours gives weekday_text, which is Google's own human-readable
      // schedule — exactly what the site prints, so it needs no parsing and
      // nobody has to retype the hours off the Business Profile.
      `&fields=place_id,name,formatted_phone_number,formatted_address,address_components,url,website,rating,user_ratings_total,opening_hours,geometry` +
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

    const hoursLines: string[] = Array.isArray(place.opening_hours?.weekday_text)
      ? place.opening_hours.weekday_text
      : []

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
      hoursLines,
      hours: condenseHours(hoursLines),
      // Business Profiles routinely store plain http:// — normalize here so
      // every consumer (the picker, the import field it seeds) gets https.
      website: place.website?.replace(/^http:\/\//i, 'https://'),
      // Grid centre for local-rank scans. Captured here because this is the
      // one moment we already have the place in hand.
      latitude: place.geometry?.location?.lat ?? null,
      longitude: place.geometry?.location?.lng ?? null,
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
