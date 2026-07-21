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
import type { Shop } from './types'

const PREFIX = 'directory/profiles'

export interface OwnerProfile {
  description?: string
  phone?: string
  website?: string
  email?: string
  socials?: { platform: string; url: string }[]
  updatedAt: string
}

export function profilesEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
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

export async function saveOwnerProfile(
  slug: string,
  data: Omit<OwnerProfile, 'updatedAt'>
): Promise<boolean> {
  const record: OwnerProfile = { ...data, updatedAt: new Date().toISOString() }
  if (!profilesEnabled()) {
    console.log('[directory:profile:unstored]', slug, JSON.stringify(record))
    return false
  }
  await put(`${PREFIX}/${slug}.json`, JSON.stringify(record), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
  return true
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
