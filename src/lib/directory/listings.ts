// ============================================
// DIRECTORY — DYNAMIC (SELF-SERVE) LISTINGS
// ============================================
// A brand-new shop can buy Featured "from the start": on the claim form with
// intent=featured we create a PENDING listing here (with a generated slug), the
// Stripe checkout carries that slug, and the webhook flips it to PUBLISHED and
// grants Featured — so it appears live at the top of its city instantly.
//
// Free new listings are NOT created here; they keep going to the admin review
// queue (claims). Payment is the gate — the $7 charge is also the spam filter.
//
// Stored in Vercel Blob (one record per slug, unguessable suffix) and merged
// into the directory by data.ts's dynamic overlay (setDynamicListings).

import { list, put, del } from '@vercel/blob'
import { unstable_cache, revalidateTag } from 'next/cache'
import { blobEnabled } from './blob'
import { setDynamicListings, hasSlug } from './data'
import { hydratePaidFeatured, RUNTIME_TAG } from './featured'
import type { Shop } from './types'

const PREFIX = 'directory/listings'

interface ListingRecord {
  shop: Shop
  status: 'pending' | 'published'
  email?: string
  createdAt: string
}

const STATE_NAMES: Record<string, string> = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
  co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
  hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas',
  ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts',
  mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana',
  ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico',
  ny: 'New York', nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma',
  or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina',
  sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont',
  va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming',
  dc: 'Washington, D.C.',
}

export function stateFullFrom(code: string, fallback = ''): string {
  return STATE_NAMES[code.toLowerCase()] || fallback || code.toUpperCase()
}

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

async function readAll(): Promise<ListingRecord[]> {
  if (!blobEnabled()) return []
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/` })
    const recs = await Promise.all(
      blobs.map(async (b) => {
        try {
          const r = await fetch(b.url, { cache: 'no-store' })
          return r.ok ? ((await r.json()) as ListingRecord) : null
        } catch {
          return null
        }
      })
    )
    return recs.filter((r): r is ListingRecord => !!r)
  } catch {
    return []
  }
}

async function readSlug(slug: string): Promise<ListingRecord | null> {
  const { blobs } = await list({ prefix: `${PREFIX}/${slug}/` })
  const b = blobs[0]
  if (!b) return null
  try {
    const r = await fetch(b.url, { cache: 'no-store' })
    return r.ok ? ((await r.json()) as ListingRecord) : null
  } catch {
    return null
  }
}

async function writeSlug(slug: string, rec: ListingRecord): Promise<void> {
  const { blobs } = await list({ prefix: `${PREFIX}/${slug}/` })
  if (blobs.length) await del(blobs.map((b) => b.url))
  await put(`${PREFIX}/${slug}/rec.json`, JSON.stringify(rec), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
  })
}

// Cached for the ISR ranking pages (kept static-compatible); publish busts
// RUNTIME_TAG so a just-paid listing appears on the next render.
const cachedPublished = unstable_cache(
  async () => (await readAll()).filter((r) => r.status === 'published').map((r) => r.shop),
  ['directory-listings-v2'],
  { tags: [RUNTIME_TAG], revalidate: 300 }
)

/** Published dynamic listings, ready to merge into the directory. */
export async function getPublishedListings(): Promise<Shop[]> {
  return cachedPublished()
}

/** Load published dynamic listings into data.ts's overlay. */
export async function hydrateDynamicListings(): Promise<void> {
  setDynamicListings(await getPublishedListings())
}

/** Hydrate everything the directory needs at request time (listings + paid Featured). */
export async function hydrateDirectory(): Promise<void> {
  await Promise.all([hydrateDynamicListings(), hydratePaidFeatured()])
}

/** A URL-safe slug for a new shop, unique across seed + dynamic listings. */
export async function makeUniqueSlug(name: string, city: string, state: string): Promise<string> {
  const base = slugify(name) || 'auto-glass-shop'
  const dynamicSlugs = new Set((await readAll()).map((r) => r.shop.slug))
  const taken = (s: string) => hasSlug(s) || dynamicSlugs.has(s)
  for (const cand of [base, `${base}-${slugify(city)}`, `${base}-${state.toLowerCase()}`]) {
    if (cand && !taken(cand)) return cand
  }
  let i = 2
  while (taken(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/** Create a PENDING self-serve listing (published later, on payment). */
export async function createPendingListing(shop: Shop, email?: string): Promise<boolean> {
  if (!blobEnabled()) return false
  await writeSlug(shop.slug, {
    shop,
    status: 'pending',
    email,
    createdAt: new Date().toISOString(),
  })
  return true
}

/** Publish a pending listing (called by the Stripe webhook on payment). */
export async function publishListing(slug: string): Promise<boolean> {
  const rec = await readSlug(slug)
  if (!rec) return false
  if (rec.status === 'published') return true
  await writeSlug(slug, { ...rec, status: 'published' })
  revalidateTag(RUNTIME_TAG, 'max')
  return true
}

/** Whether a slug belongs to a dynamic (self-serve) listing in any status. */
export async function isDynamicListing(slug: string): Promise<boolean> {
  return (await readSlug(slug)) !== null
}
