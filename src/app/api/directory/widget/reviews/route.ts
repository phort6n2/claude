import { NextResponse } from 'next/server'
import { getShopBySlug } from '@/lib/directory/data'
import { getReview, googlePlaceUrl } from '@/lib/directory/reviews'

// Public, cross-origin data feed for the embeddable review widget that shops
// put on their OWN websites. Reads the cached snapshot (no Google call at
// request time). CORS-open because it's meant to be fetched from shop domains.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=1800',
}

function siteOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env.replace(/\/$/, '')
  return new URL(request.url).origin
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('shop') || ''
  const shop = getShopBySlug(slug)
  if (!shop) {
    return NextResponse.json({ error: 'Unknown shop' }, { status: 404, headers: CORS })
  }
  const review = await getReview(shop)
  return NextResponse.json(
    {
      name: shop.name,
      rating: review?.rating ?? null,
      count: review?.count ?? null,
      reviewsUrl: review ? googlePlaceUrl(review.placeId) : null,
      listingUrl: `${siteOrigin(request)}/directory/shop/${shop.slug}`,
    },
    { headers: CORS }
  )
}
