import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/directory/admin-auth'
import { getShopBySlug, citySlug, getCityRank } from '@/lib/directory/data'
import { publishListing, hydrateDynamicListings } from '@/lib/directory/listings'
import { notifyListingPublished } from '@/lib/directory/notify'

// Admin-only: approve & publish a pending self-serve listing for FREE (no
// Stripe). Used from the Claims inbox to take a reviewed new-listing submission
// live in one click. Featuring is separate (that only happens on payment).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const slug = String(body?.slug ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const result = await publishListing(slug)
  if (!result) {
    return NextResponse.json(
      { error: 'No pending listing found for that slug.' },
      { status: 404 }
    )
  }

  await hydrateDynamicListings()
  const shop = getShopBySlug(slug)
  revalidatePath(`/directory/shop/${slug}`)
  revalidatePath('/directory')
  if (shop) {
    revalidatePath(`/directory/${shop.state}`)
    revalidatePath(`/directory/${shop.state}/${citySlug(shop.city)}`)
  }

  // Welcome + upsell email — only the first time it goes live (free approve).
  if (result.newlyPublished) {
    const published = shop ?? result.record.shop
    const position = shop ? getCityRank(shop) : undefined
    await notifyListingPublished({
      shop: published,
      email: result.record.email,
      featured: false,
      rank: position?.rank,
      total: position?.total,
    })
  }
  return NextResponse.json({ ok: true, slug })
}
