import { NextResponse } from 'next/server'
import { OWNER_COOKIE, verifyOwnerKey } from '@/lib/directory/owner-auth'
import { getShopBySlug } from '@/lib/directory/data'

// Passwordless owner sign-in.
//   POST   { key }  → validate the access key, set the session cookie
//   DELETE          → sign out
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const key = String(body?.key ?? '').trim()
  const slug = verifyOwnerKey(key)
  if (!slug) {
    return NextResponse.json({ error: 'That access key isn’t valid.' }, { status: 401 })
  }
  const shop = getShopBySlug(slug)
  if (!shop) {
    return NextResponse.json({ error: 'This listing no longer exists.' }, { status: 404 })
  }
  const res = NextResponse.json({ ok: true, slug, shopName: shop.name })
  res.cookies.set(OWNER_COOKIE, key, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 60, // 60 days
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(OWNER_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
