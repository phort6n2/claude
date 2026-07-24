// ============================================
// DIRECTORY — SELF-SERVE PAID "FEATURED" ($7/mo)
// ============================================
// A shop buys the Featured tier via a Stripe Payment Link; Stripe's webhook
// (checkout.session.completed) calls grantFeatured() and revalidates the shop's
// city/state pages, so it jumps the ranking within seconds — no redeploy.
//
// Storage mirrors quotes/claims: one blob per shop under directory/featured/
// <slug>/… with an unguessable random suffix, read server-side via list(), so
// the billing email / Stripe ids aren't sitting at a predictable public URL.
//
// data.ts owns the ranking overlay; here we just hydrate it from Blob.

import { list, put, del } from '@vercel/blob'
import { blobEnabled } from './blob'
import { setPaidFeatured } from './data'

const PREFIX = 'directory/featured'

export interface FeaturedRecord {
  slug: string
  email?: string
  since: string
  customerId?: string
  subscriptionId?: string
}

async function readAll(): Promise<FeaturedRecord[]> {
  if (!blobEnabled()) return []
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/` })
    const recs = await Promise.all(
      blobs.map(async (b) => {
        try {
          const r = await fetch(b.url, { cache: 'no-store' })
          return r.ok ? ((await r.json()) as FeaturedRecord) : null
        } catch {
          return null
        }
      })
    )
    return recs.filter((r): r is FeaturedRecord => !!r)
  } catch {
    return []
  }
}

// Read directly from Blob. The ranking pages are ISR (regenerate every 5 min,
// or on demand when the Stripe webhook calls revalidatePath), so this runs only
// on regeneration — infrequent — and always sees the latest paid set.
export async function getPaidFeatured(): Promise<FeaturedRecord[]> {
  return readAll()
}

export async function getPaidFeaturedSlugs(): Promise<string[]> {
  return Array.from(new Set((await readAll()).map((r) => r.slug)))
}

export async function isPaidFeatured(slug: string): Promise<boolean> {
  return (await getPaidFeaturedSlugs()).includes(slug)
}

/** Load the current paid-Featured slugs into data.ts's ranking overlay. */
export async function hydratePaidFeatured(): Promise<void> {
  setPaidFeatured(await getPaidFeaturedSlugs())
}

async function clearSlug(slug: string): Promise<void> {
  const { blobs } = await list({ prefix: `${PREFIX}/${slug}/` })
  if (blobs.length) await del(blobs.map((b) => b.url))
}

/** Mark a shop as paid-Featured (idempotent — replaces any prior record). */
export async function grantFeatured(rec: FeaturedRecord): Promise<void> {
  if (!blobEnabled()) return
  await clearSlug(rec.slug)
  await put(`${PREFIX}/${rec.slug}/rec.json`, JSON.stringify(rec), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
  })
}

/** Remove a shop's paid-Featured status (e.g. on subscription cancellation). */
export async function revokeFeatured(slug: string): Promise<void> {
  if (!blobEnabled()) return
  await clearSlug(slug)
}

/** Find the shop slug for a Stripe subscription/customer id (for cancellations). */
export async function slugForStripeId(id: string): Promise<string | null> {
  if (!id) return null
  const rec = (await readAll()).find((r) => r.subscriptionId === id || r.customerId === id)
  return rec?.slug ?? null
}
