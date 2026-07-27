import { NextResponse } from 'next/server'
import { getAllShops } from '@/lib/directory/data'
import { haversineMiles } from '@/lib/directory/distance'
import { hydrateDirectory } from '@/lib/directory/listings'
import { enrichShops } from '@/lib/directory/photos'
import { withReviews } from '@/lib/directory/reviews'

/**
 * A shop this far away is not "near you". Without a cap the nearest match is
 * whatever happens to be closest in the whole country, so a visitor in Atlanta
 * gets told about a shop in Houston.
 */
const MAX_MILES = 60

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

  await hydrateDirectory()
  const ranked = getAllShops()
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({
      shop: s,
      distance: haversineMiles(lat, lng, s.lat as number, s.lng as number),
    }))
    .filter((x) => x.distance <= MAX_MILES)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)

  // Return the shops themselves rather than just slugs. The homepage used to
  // embed the ENTIRE directory so this component could look shops up by slug —
  // ~900 KB of RSC payload on the most-visited page, growing with every listing
  // we add, to render three cards. Enriching three shops here is also far less
  // work than enriching all of them on every homepage render.
  const shops = await withReviews(await enrichShops(ranked.map((r) => r.shop)))
  const nearest = shops.map((shop, i) => ({ shop, distance: ranked[i].distance }))

  return NextResponse.json({
    available: nearest.length > 0,
    precise,
    location: locationLabel,
    nearest,
  })
}
