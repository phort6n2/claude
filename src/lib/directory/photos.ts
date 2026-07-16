// ============================================
// DIRECTORY — OWNER PHOTO STORAGE (Vercel Blob)
// ============================================
// Photos live in Vercel Blob under `directory/photos/<slug>/…`. No database
// needed: the file list IS the source of truth. Everything here degrades
// gracefully — when BLOB_READ_WRITE_TOKEN isn't set, reads return empty and the
// UI falls back to the branded placeholder, so the site works with zero setup.

import { list } from '@vercel/blob'
import type { Shop } from './types'

const PREFIX = 'directory/photos'

/** True when the deployment is configured to store/serve uploaded photos. */
export function uploadsEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

/** Public URLs of uploaded photos for one shop. Empty when uploads are off. */
export async function getShopPhotos(slug: string): Promise<string[]> {
  if (!uploadsEnabled()) return []
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/${slug}/` })
    return blobs.map((b) => b.url)
  } catch {
    return []
  }
}

/** Photos for many shops at once (one Blob call) → { slug: urls[] }. */
export async function getPhotosForSlugs(): Promise<Record<string, string[]>> {
  if (!uploadsEnabled()) return {}
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/` })
    const map: Record<string, string[]> = {}
    for (const b of blobs) {
      // pathname → directory/photos/<slug>/<file>
      const slug = b.pathname.split('/')[2]
      if (!slug) continue
      ;(map[slug] ??= []).push(b.url)
    }
    return map
  } catch {
    return {}
  }
}

/** Merge uploaded photos onto a shop (uploaded first, then any seed photos). */
export function withPhotos(shop: Shop, uploaded: string[]): Shop {
  if (!uploaded.length) return shop
  return { ...shop, photos: [...uploaded, ...(shop.photos ?? [])] }
}
