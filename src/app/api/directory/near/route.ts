import { NextResponse } from 'next/server'
import { getAllShops } from '@/lib/directory/data'
import { haversineMiles } from '@/lib/directory/distance'

// Returns the shops nearest the visitor, ordered by distance.
// Location comes from (in priority order):
//   1. ?lat= & ?lng=  — precise, from the browser Geolocation API (opt-in)
//   2. Vercel edge geo headers — approximate, IP-based, no permission prompt
// Falls back to { available: false } when neither is present (e.g. local dev).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const h = request.headers

  const qLat = Number(url.searchParams.get('lat'))
  const qLng = Number(url.searchParams.get('lng'))
  const precise = Number.isFinite(qLat) && Number.isFinite(qLng) && (qLat !== 0 || qLng !== 0)

  const hLat = Number(h.get('x-vercel-ip-latitude'))
  const hLng = Number(h.get('x-vercel-ip-longitude'))

  const lat = precise ? qLat : hLat
  const lng = precise ? qLng : hLng

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return NextResponse.json({ available: false })
  }

  const cityRaw = h.get('x-vercel-ip-city')
  const region = h.get('x-vercel-ip-country-region')
  const city = cityRaw ? decodeURIComponent(cityRaw) : null
  const locationLabel = precise
    ? null
    : city
      ? `${city}${region ? `, ${region}` : ''}`
      : null

  const order = getAllShops()
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({
      slug: s.slug,
      distance: haversineMiles(lat, lng, s.lat as number, s.lng as number),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)

  return NextResponse.json({
    available: order.length > 0,
    precise,
    location: locationLabel,
    order,
  })
}
