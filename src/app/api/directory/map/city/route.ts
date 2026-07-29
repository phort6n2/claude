import { NextResponse } from 'next/server'
import { getShopsByCity } from '@/lib/directory/data'
import { hydrateDirectory } from '@/lib/directory/listings'
import { enrichShops } from '@/lib/directory/photos'
import { withReviews } from '@/lib/directory/reviews'

// Detail for the shops in one city, fetched when its card opens.
//
// Deliberately not part of /api/directory/map: enriching all 985 shops means a
// website-meta lookup each, and it would inflate a payload the homepage already
// downloads on scroll. A card shows five or six shops, so fetch those six.
export const runtime = 'nodejs'
export const revalidate = 3600

export interface MapCityShop {
  slug: string
  name: string
  photo?: string
  services: string[]
  mobileService: boolean
  street?: string
  /** Only present once the Google reviews snapshot has been populated. */
  rating?: number
  reviewCount?: number
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = (url.searchParams.get('state') || '').toLowerCase()
  const city = url.searchParams.get('city') || ''
  if (!/^[a-z]{2}$/.test(state) || !city) {
    return NextResponse.json({ error: 'state and city are required' }, { status: 400 })
  }

  await hydrateDirectory()
  // getShopsByCity slugifies whatever it's given, so the slug the map sends
  // matches without any reversing.
  const enriched = await withReviews(await enrichShops(getShopsByCity(state, city)))
  const payload: MapCityShop[] = enriched.map((s) => ({
    slug: s.slug,
    name: s.name,
    photo: s.photos?.[0],
    services: s.services.slice(0, 3),
    mobileService: !!s.mobileService,
    street: s.street || undefined,
    ...(typeof s.rating === 'number' ? { rating: s.rating } : {}),
    ...(typeof s.reviewCount === 'number' ? { reviewCount: s.reviewCount } : {}),
  }))

  return NextResponse.json(
    { shops: payload },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
  )
}
