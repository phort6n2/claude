import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { OWNER_COOKIE, verifyOwnerKey } from '@/lib/directory/owner-auth'
import { getShopBySlug } from '@/lib/directory/data'
import { setMarketingOptIn } from '@/lib/directory/profiles'

// Owner self-service marketing-email opt-in/out. Authenticated via the owner
// session cookie — the slug comes from the verified cookie, never the body, so
// an owner can only set their OWN consent. Saves instantly (no full-form save).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const slug = verifyOwnerKey(cookieStore.get(OWNER_COOKIE)?.value)
  if (!slug) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!getShopBySlug(slug)) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  if (typeof body?.optIn !== 'boolean') {
    return NextResponse.json({ error: 'Missing optIn' }, { status: 400 })
  }

  const stored = await setMarketingOptIn(slug, body.optIn)
  return NextResponse.json({ ok: true, optIn: body.optIn, stored })
}
