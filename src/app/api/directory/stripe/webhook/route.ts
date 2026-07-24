import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getShopBySlug, citySlug } from '@/lib/directory/data'
import { grantFeatured, revokeFeatured, slugForStripeId } from '@/lib/directory/featured'
import { publishListing, hydrateDynamicListings } from '@/lib/directory/listings'

// Stripe webhook for the self-serve $7/mo Featured tier.
//   checkout.session.completed      → grant Featured + revalidate the shop's pages
//   customer.subscription.deleted   → revoke Featured
//
// Signature is verified manually against STRIPE_WEBHOOK_SECRET (Stripe's scheme:
// HMAC-SHA256 of "<timestamp>.<rawbody>"), so we don't need the Stripe SDK.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=')
      return [kv.slice(0, i), kv.slice(i + 1)]
    })
  )
  const t = parts['t']
  const v1 = parts['v1']
  if (!t || !v1) return false
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  const a = Buffer.from(v1)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  if (!timingSafeEqual(a, b)) return false
  // Reject events older than 5 minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(t))
  return Number.isFinite(age) && age < 300
}

async function revalidateShop(slug: string): Promise<void> {
  const shop = getShopBySlug(slug)
  revalidatePath(`/directory/shop/${slug}`)
  revalidatePath('/directory')
  if (shop) {
    revalidatePath(`/directory/${shop.state}`)
    revalidatePath(`/directory/${shop.state}/${citySlug(shop.city)}`)
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const raw = await request.text()
  // Not configured yet → acknowledge so Stripe doesn't retry into the void.
  if (!secret) return NextResponse.json({ ok: true, note: 'STRIPE_WEBHOOK_SECRET not set' })
  if (!verify(raw, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }
  const obj = event.data?.object ?? {}

  if (event.type === 'checkout.session.completed') {
    const meta = (obj.metadata as Record<string, string> | undefined) ?? {}
    const slug = String(obj.client_reference_id ?? meta.slug ?? '').trim()
    if (slug) {
      const email =
        (obj.customer_details as { email?: string } | undefined)?.email ??
        (obj.customer_email as string | undefined)
      await grantFeatured({
        slug,
        email: email || undefined,
        since: new Date(Number(obj.created ?? Date.now() / 1000) * 1000).toISOString(),
        customerId: (obj.customer as string | undefined) || undefined,
        subscriptionId: (obj.subscription as string | undefined) || undefined,
      })
      // If this was a brand-new self-serve listing, publish it live now.
      await publishListing(slug)
      // Load the freshly published listing so revalidateShop can resolve its city/state.
      await hydrateDynamicListings()
      await revalidateShop(slug)
    }
    return NextResponse.json({ ok: true })
  }

  if (event.type === 'customer.subscription.deleted') {
    const subId = String(obj.id ?? '')
    const custId = String(obj.customer ?? '')
    const slug = (await slugForStripeId(subId)) ?? (await slugForStripeId(custId))
    if (slug) {
      await revokeFeatured(slug)
      await revalidateShop(slug)
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, ignored: event.type })
}
