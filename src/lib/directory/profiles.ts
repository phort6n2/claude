// ============================================
// DIRECTORY — OWNER PROFILE OVERRIDES
// ============================================
// Owner-editable overrides for a claimed listing, set from the owner dashboard.
// Stored in Vercel Blob keyed by slug and merged over the seed data at render,
// so a shop owner can keep their own socials, description, and contact details
// current without us touching the seed file. Degrades gracefully with no blob
// token (edits are logged; reads return null → seed data shows).

import { list, put } from '@vercel/blob'
import { unstable_cache } from 'next/cache'
import { blobEnabled } from './blob'
import type { Shop } from './types'

const PREFIX = 'directory/profiles'

export interface OwnerProfile {
  description?: string
  phone?: string
  website?: string
  email?: string
  socials?: { platform: string; url: string }[]
  // Optional blog or RSS/Atom URL — powers "Latest from the blog" on the listing.
  blogUrl?: string
  // Owner's explicit choice about marketing emails (the upsell drip). Undefined
  // = never asked; true/false = a deliberate opt-in / opt-out from the dashboard.
  marketingOptIn?: boolean
  marketingOptInAt?: string
  updatedAt: string
}

export function profilesEnabled(): boolean {
  return blobEnabled()
}

async function readProfile(slug: string): Promise<OwnerProfile | null> {
  if (!profilesEnabled()) return null
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/${slug}` })
    const blob = blobs.find((b) => b.pathname === `${PREFIX}/${slug}.json`)
    if (!blob) return null
    const res = await fetch(blob.url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as OwnerProfile
  } catch {
    return null
  }
}

/** Cached read (short TTL so owner edits appear within ~a minute). */
export function getOwnerProfile(slug: string): Promise<OwnerProfile | null> {
  return unstable_cache(() => readProfile(slug), ['directory-owner-profile-v1', slug], {
    revalidate: 60,
  })()
}

async function writeProfile(slug: string, record: OwnerProfile): Promise<boolean> {
  if (!profilesEnabled()) {
    console.log('[directory:profile:unstored]', slug, JSON.stringify(record))
    return false
  }
  await put(`${PREFIX}/${slug}.json`, JSON.stringify(record), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return true
}

export async function saveOwnerProfile(
  slug: string,
  data: Omit<OwnerProfile, 'updatedAt' | 'marketingOptIn' | 'marketingOptInAt'>
): Promise<boolean> {
  // The listing-edit form doesn't carry the marketing choice — carry the
  // existing consent forward so a profile save never silently opts them out.
  const existing = await readProfile(slug)
  const record: OwnerProfile = {
    ...data,
    marketingOptIn: existing?.marketingOptIn,
    marketingOptInAt: existing?.marketingOptInAt,
    updatedAt: new Date().toISOString(),
  }
  return writeProfile(slug, record)
}

/** Flip an owner's marketing-email consent, preserving the rest of the profile. */
export async function setMarketingOptIn(slug: string, optIn: boolean): Promise<boolean> {
  const existing = await readProfile(slug)
  const record: OwnerProfile = {
    ...(existing ?? {}),
    marketingOptIn: optIn,
    marketingOptInAt: optIn ? new Date().toISOString() : existing?.marketingOptInAt,
    updatedAt: new Date().toISOString(),
  }
  return writeProfile(slug, record)
}

/** Every profile that has made a deliberate marketing choice, keyed by slug. */
export async function listMarketingConsent(): Promise<
  Map<string, { optIn: boolean; email?: string }>
> {
  const out = new Map<string, { optIn: boolean; email?: string }>()
  if (!profilesEnabled()) return out
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/` })
    await Promise.all(
      blobs.map(async (b) => {
        try {
          const slug = b.pathname.replace(`${PREFIX}/`, '').replace(/\.json$/, '')
          const p = (await (await fetch(b.url, { cache: 'no-store' })).json()) as OwnerProfile
          if (typeof p.marketingOptIn === 'boolean') {
            out.set(slug, { optIn: p.marketingOptIn, email: p.email?.trim() || undefined })
          }
        } catch {
          /* skip unreadable */
        }
      })
    )
  } catch {
    /* no store */
  }
  return out
}

/** Merge an owner's saved overrides onto a shop (owner values win). */
export async function applyOwnerProfile(shop: Shop): Promise<Shop> {
  const p = await getOwnerProfile(shop.slug)
  if (!p) return shop
  return {
    ...shop,
    description: p.description?.trim() || shop.description,
    phone: p.phone?.trim() || shop.phone,
    website: p.website?.trim() || shop.website,
    email: p.email?.trim() || shop.email,
    socials: p.socials?.length ? p.socials : shop.socials,
  }
}
