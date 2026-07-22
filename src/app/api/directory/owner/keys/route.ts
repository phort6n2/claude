import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { makeOwnerKey, ownerAuthConfigured } from '@/lib/directory/owner-auth'
import { getAllShops } from '@/lib/directory/data'

// Agency-only: mint the owner access links to hand to each claimed shop.
// Secret-gated so access keys are never exposed publicly.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authed(request: Request): boolean {
  return isAdmin(request)
}

export async function GET(request: Request) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!ownerAuthConfigured()) {
    return NextResponse.json(
      { error: 'Set DIRECTORY_OWNER_SECRET (or DIRECTORY_UPLOAD_SECRET) to issue owner keys.' },
      { status: 400 }
    )
  }
  const origin = new URL(request.url).origin
  const owners = getAllShops().map((s) => {
    const key = makeOwnerKey(s.slug)
    return {
      slug: s.slug,
      name: s.name,
      claimed: s.claimed,
      key,
      link: `${origin}/directory/owner?key=${encodeURIComponent(key)}`,
    }
  })
  return NextResponse.json({ owners })
}
