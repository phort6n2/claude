import { NextResponse } from 'next/server'
import { classifyCategory } from '@/lib/directory/verify'

// Server-side proxy for Google Place Details. Given a place_id (from the
// autocomplete picker), returns a normalized listing draft plus the anti-spam
// category verdict. Service-area businesses may lack a street address — we
// still return name/phone/website/category so they can be listed.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function apiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
}

interface AddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

function parseAddress(components: AddressComponent[] | undefined) {
  const get = (type: string) => components?.find((c) => c.types?.includes(type))
  const streetNumber = get('street_number')?.longText ?? ''
  const route = get('route')?.longText ?? ''
  const city =
    get('locality')?.longText ??
    get('postal_town')?.longText ??
    get('sublocality')?.longText ??
    get('administrative_area_level_2')?.longText ??
    ''
  const stateComp = get('administrative_area_level_1')
  return {
    street: [streetNumber, route].filter(Boolean).join(' '),
    city,
    state: (stateComp?.shortText ?? '').toLowerCase(),
    stateFull: stateComp?.longText ?? '',
    zip: get('postal_code')?.longText ?? '',
  }
}

export async function POST(request: Request) {
  const key = apiKey()
  if (!key) return NextResponse.json({ error: 'Lookup unavailable' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const placeId = String(body?.placeId ?? '').trim()
  if (!placeId) return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,addressComponents,nationalPhoneNumber,websiteUri,regularOpeningHours,primaryType,primaryTypeDisplayName,types,location,rating,userRatingCount',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return NextResponse.json({ error: 'Lookup failed' }, { status: 502 })
    const d = await res.json()
    const addr = parseAddress(d.addressComponents)
    const category = d.primaryTypeDisplayName?.text ?? d.primaryType ?? ''
    const verify = classifyCategory(category, d.types)

    return NextResponse.json({
      placeId: d.id ?? placeId,
      name: d.displayName?.text ?? '',
      phone: d.nationalPhoneNumber ?? '',
      website: d.websiteUri ?? '',
      formattedAddress: d.formattedAddress ?? '',
      ...addr,
      lat: d.location?.latitude ?? null,
      lng: d.location?.longitude ?? null,
      rating: d.rating ?? null,
      reviewCount: d.userRatingCount ?? null,
      category,
      hasHours: !!d.regularOpeningHours,
      // Service-area business heuristic: on Google but no street address shown.
      serviceAreaOnly: !addr.street,
      verify,
    })
  } catch {
    return NextResponse.json({ error: 'Lookup error' }, { status: 500 })
  }
}
