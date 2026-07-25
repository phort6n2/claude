import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/directory/admin-auth'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { saveClaim, listClaims, type Claim } from '@/lib/directory/claims'
import { getShopBySlug, getCityRank, getShopsByCity, SERVICES } from '@/lib/directory/data'
import {
  hydrateDirectory,
  makeUniqueSlug,
  createPendingListing,
  stateFullFrom,
} from '@/lib/directory/listings'
import { sendLeadEvent } from '@/lib/directory/webhooks'
import type { Shop, ServiceKey } from '@/lib/directory/types'

const SERVICE_KEYS = new Set(SERVICES.map((s) => s.key))

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
  // Expanded capture (sales intel):
  services: z.array(z.string().max(40)).max(20).optional(),
  monthlyVolume: z.string().max(40).optional(),
  frustration: z.string().max(1000).optional(),
  smsConsent: z.boolean().optional(),
  intent: z.enum(['free', 'featured']).optional(),
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

  // For a brand-new listing, generate its slug up front so we can store it on
  // the claim (lets the operator one-click "Approve & publish" from the inbox)
  // and reuse it for the pending listing + checkout below.
  const isNewListing = !d.existingShopSlug && !!d.city && (d.state || '').length === 2
  const listingSlug = isNewListing
    ? await makeUniqueSlug(d.businessName, d.city as string, (d.state as string).toLowerCase())
    : undefined

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
    services: d.services?.length ? d.services : undefined,
    monthlyVolume: d.monthlyVolume || undefined,
    frustration: d.frustration || undefined,
    smsConsent: d.smsConsent,
    intent: d.intent,
    listingSlug,
    createdAt: new Date().toISOString(),
  }

  await saveClaim(claim)
  await hydrateDirectory()

  // Rank reveal + slug for the confirmation screen / Featured checkout.
  let slug = d.existingShopSlug
  let rank: { rank: number; total: number; city: string; state: string } | undefined
  let newListing = false

  if (d.existingShopSlug) {
    // Claiming an existing listing → its live city rank.
    const shop = getShopBySlug(d.existingShopSlug)
    if (shop) {
      const r = getCityRank(shop)
      rank = { rank: r.rank, total: r.total, city: shop.city, state: shop.state }
    }
  } else if (d.city && (d.state || '').length === 2) {
    // Any brand-new listing (free OR featured intent): create a PENDING listing
    // so the confirmation screen can offer instant self-serve Featured. If they
    // pay, the webhook publishes + features it (payment is the spam filter). If
    // they don't, it stays pending and the claim above sits in the review queue.
    const state = d.state!.toLowerCase()
    const services = (d.services ?? []).filter((s): s is ServiceKey =>
      SERVICE_KEYS.has(s as ServiceKey)
    )
    const mobileService = services.includes('mobile-service')
    if (!services.length) services.push('windshield-repair', 'windshield-replacement')
    slug = listingSlug
    const shop: Shop = {
      slug: slug as string,
      name: d.businessName,
      phone: d.phone || '',
      website: d.website || undefined,
      street: d.street || '',
      city: d.city,
      state,
      stateFull: d.stateFull || stateFullFrom(state),
      zip: d.zip || '',
      services,
      mobileService,
      insurance: [],
      hours: [],
      description:
        d.message?.trim() ||
        `${d.businessName} — auto glass and windshield services in ${d.city}, ${state.toUpperCase()}.`,
      claimed: true,
      featured: false,
      ...(d.placeId ? { googlePlaceId: d.placeId } : {}),
    }
    await createPendingListing(shop, d.email)
    const total = getShopsByCity(state, d.city).length
    rank = { rank: total + 1, total: total + 1, city: d.city, state }
    newListing = true
  }

  // Tell AGMP a shop just raised its hand, so the Day 0–10 nurture can start.
  // Best-effort — a webhook failure must never fail the shop's submission.
  await sendLeadEvent({
    type: d.existingShopSlug ? 'shop.claimed' : 'shop.listing_submitted',
    slug,
    name: d.businessName,
    email: d.email,
    phone: d.phone || undefined,
    // Claiming an existing listing doesn't post city/state (they're already on
    // the shop record) — fall back to the resolved rank so AGMP always knows
    // which market the prospect is in.
    city: d.city || rank?.city || undefined,
    state: (d.state || rank?.state)?.toUpperCase() || undefined,
    website: d.website || undefined,
    services: d.services?.length ? d.services : undefined,
    rank: rank?.rank,
    total: rank?.total,
    monthlyVolume: d.monthlyVolume || undefined,
    frustration: d.frustration || undefined,
    smsConsent: d.smsConsent,
    wantsMarketingHelp: d.wantsMarketingHelp,
  })

  return NextResponse.json({ ok: true, slug, rank, newListing }, { status: 201 })
}

function authed(request: Request): boolean {
  return isAdmin(request)
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // A new-listing claim is "done" once its listing is live — derive that from
  // the directory itself (getShopBySlug only returns published shops), so an
  // approved listing leaves the active queue and stays out across reloads.
  await hydrateDirectory()
  const claims = await listClaims()
  const annotated = claims.map((c) => ({
    ...c,
    published:
      c.type === 'new_listing' && !!c.listingSlug && !!getShopBySlug(c.listingSlug),
  }))
  return NextResponse.json({ claims: annotated })
}
