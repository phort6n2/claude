import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { OWNER_COOKIE, makeOwnerKey, ownerAuthConfigured } from '@/lib/directory/owner-auth'
import { getShopBySlug } from '@/lib/directory/data'

// Admin-only: open any listing's owner dashboard as if you were the shop.
// We mint that shop's owner access key and set it as the owner session cookie,
// so the entire existing owner flow (dashboard, profile editor, leads) works
// unchanged. Gated behind the admin session — a shop owner can't call this to
// jump into someone else's listing.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ownerAuthConfigured()) {
    return NextResponse.json(
      { error: 'Set DIRECTORY_OWNER_SECRET (or DIRECTORY_UPLOAD_SECRET) to open owner dashboards.' },
      { status: 400 }
    )
  }
  const body = await request.json().catch(() => ({}))
  const slug = String(body?.slug ?? '')
  const shop = getShopBySlug(slug)
  if (!shop) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }
  const res = NextResponse.json({ ok: true, slug, shopName: shop.name })
  res.cookies.set(OWNER_COOKIE, makeOwnerKey(slug), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day — short-lived; it's an admin acting as the owner
  })
  return res
}
