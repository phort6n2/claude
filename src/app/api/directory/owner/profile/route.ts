import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { OWNER_COOKIE, verifyOwnerKey } from '@/lib/directory/owner-auth'
import { getShopBySlug } from '@/lib/directory/data'
import { saveOwnerProfile } from '@/lib/directory/profiles'

// Owner self-service profile update. Authenticated via the owner session
// cookie — a shop can only edit its OWN listing (the slug comes from the
// verified cookie, never from the request body).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLATFORMS = ['facebook', 'instagram', 'x', 'youtube', 'linkedin', 'tiktok', 'yelp'] as const

const ProfileSchema = z.object({
  description: z.string().max(1200).optional(),
  phone: z.string().max(40).optional(),
  website: z.string().url().max(300).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  socials: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        url: z.string().url().max(300),
      })
    )
    .max(7)
    .optional(),
})

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const slug = verifyOwnerKey(cookieStore.get(OWNER_COOKIE)?.value)
  if (!slug) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const shop = getShopBySlug(slug)
  if (!shop) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  const parsed = ProfileSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check your entries.' }, { status: 400 })
  }
  const d = parsed.data
  // Drop blank social rows.
  const socials = (d.socials ?? []).filter((s) => s.url.trim())

  const stored = await saveOwnerProfile(slug, {
    description: d.description?.trim() || undefined,
    phone: d.phone?.trim() || undefined,
    website: d.website?.trim() || undefined,
    email: d.email?.trim() || undefined,
    socials: socials.length ? socials : undefined,
  })
  return NextResponse.json({ ok: true, stored })
}
