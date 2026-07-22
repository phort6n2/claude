import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { saveClaim, listClaims, type Claim } from '@/lib/directory/claims'

// ============================================
// DIRECTORY — FREE LISTING / CLAIM SUBMISSIONS
// ============================================
//   POST                → receive a claim/new-listing submission (public).
//                         Stored in the review queue (Vercel Blob).
//   GET (x-upload-secret) → the operator's pending-claims review queue.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ClaimSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  email: z.string().email('A valid email is required'),
  city: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  state: z.string().optional(),
  stateFull: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  existingShopSlug: z.string().optional(),
  wantsMarketingHelp: z.boolean().optional(),
  message: z.string().max(2000).optional(),
  // From the Google Business Profile picker.
  placeId: z.string().optional(),
  googleCategory: z.string().optional(),
  verifyVerdict: z.string().optional(),
  serviceAreaOnly: z.boolean().optional(),
  // Honeypot — must be empty.
  company: z.string().max(0).optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ClaimSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }
  const d = parsed.data
  if (d.company) return NextResponse.json({ ok: true }, { status: 201 }) // drop bots

  const claim: Claim = {
    id: randomUUID(),
    type: d.existingShopSlug ? 'claim' : 'new_listing',
    businessName: d.businessName,
    email: d.email,
    contactName: d.contactName || undefined,
    phone: d.phone || undefined,
    website: d.website || undefined,
    city: d.city || undefined,
    state: d.state || undefined,
    stateFull: d.stateFull || undefined,
    street: d.street || undefined,
    zip: d.zip || undefined,
    placeId: d.placeId || undefined,
    googleCategory: d.googleCategory || undefined,
    verifyVerdict: d.verifyVerdict || undefined,
    serviceAreaOnly: d.serviceAreaOnly,
    existingShopSlug: d.existingShopSlug || undefined,
    wantsMarketingHelp: d.wantsMarketingHelp,
    message: d.message || undefined,
    createdAt: new Date().toISOString(),
  }

  await saveClaim(claim)
  return NextResponse.json({ ok: true }, { status: 201 })
}

function authed(request: Request): boolean {
  return isAdmin(request)
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const claims = await listClaims()
  return NextResponse.json({ claims })
}
