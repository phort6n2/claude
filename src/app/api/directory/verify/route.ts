import { NextResponse } from 'next/server'
import { getAllShops, getShopBySlug } from '@/lib/directory/data'
import { getReview } from '@/lib/directory/reviews'
import { classifyCategory, verifyListingLive, verifyEnabled } from '@/lib/directory/verify'

// Anti-spam category verification, gated by DIRECTORY_UPLOAD_SECRET.
//   GET               → audit every listing's GBP category (reads the snapshot,
//                       no extra Places calls); returns the ones to review.
//   POST { name, ... } → live GBP category check for a new/prospective listing.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authed(request: Request): boolean {
  const secret = process.env.DIRECTORY_UPLOAD_SECRET
  return !!secret && request.headers.get('x-upload-secret') === secret
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shops = getAllShops()
  const rows = await Promise.all(
    shops.map(async (s) => {
      const review = await getReview(s)
      const check = classifyCategory(review?.category, review?.types)
      return {
        slug: s.slug,
        name: s.name,
        city: s.city,
        state: s.state,
        googleCategory: review?.category ?? null,
        ...check,
      }
    })
  )
  const flagged = rows.filter((r) => r.verdict !== 'auto_glass')
  const hasData = rows.some((r) => r.verdict !== 'no_data')
  return NextResponse.json({
    checked: rows.length,
    okCount: rows.filter((r) => r.verdict === 'auto_glass').length,
    flagged,
    note: hasData
      ? undefined
      : 'No Google categories on file yet — run the Google ratings refresh first to populate them.',
  })
}

export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!verifyEnabled()) {
    return NextResponse.json(
      { error: 'Set GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) to verify categories.' },
      { status: 400 }
    )
  }
  const body = await request.json().catch(() => ({}))
  // Accept either a known slug or raw name/city/state.
  const slug = String(body?.slug ?? '').trim()
  const shop = slug ? getShopBySlug(slug) : null
  const q = shop
    ? { name: shop.name, city: shop.city, state: shop.state, address: shop.street }
    : {
        name: String(body?.name ?? '').trim(),
        city: String(body?.city ?? '').trim(),
        state: String(body?.state ?? '').trim(),
        address: String(body?.address ?? '').trim(),
      }
  if (!q.name) return NextResponse.json({ error: 'Provide a business name (or slug).' }, { status: 400 })
  const result = await verifyListingLive(q)
  return NextResponse.json(result)
}
