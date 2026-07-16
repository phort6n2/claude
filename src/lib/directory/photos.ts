// ============================================
// DIRECTORY — OWNER PHOTO STORAGE (Vercel Blob)
// ============================================
// Photos live in Vercel Blob under `directory/photos/<slug>/…`. No database
// needed: the file list IS the source of truth. Everything here degrades
// gracefully — when BLOB_READ_WRITE_TOKEN isn't set, reads return empty and the
// UI falls back to the branded placeholder, so the site works with zero setup.

import { list } from '@vercel/blob'
import { unstable_cache } from 'next/cache'
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

// ---- Automatic enrichment from the shop's own website ----------------------
// One cached fetch of the site yields both a hero image (og:image) and links to
// the business's social profiles (from footer/header links).

const FETCH_UA =
  'Mozilla/5.0 (compatible; WindshieldRepairHQ/1.0; +https://windshieldrepairhq.com)'

interface SocialLink {
  platform: string
  url: string
}

interface WebsiteMeta {
  image: string | null
  socials: SocialLink[]
}

const SOCIAL_PATTERNS: { platform: string; test: RegExp }[] = [
  { platform: 'facebook', test: /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|plugins|tr|dialog|share)[A-Za-z0-9.\-]+\/?$/i },
  { platform: 'instagram', test: /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/)[A-Za-z0-9_.\-]+\/?$/i },
  { platform: 'x', test: /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share|home|hashtag)[A-Za-z0-9_]+\/?$/i },
  { platform: 'youtube', test: /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9_\-]+\/?$/i },
  { platform: 'linkedin', test: /^https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9\-_%]+\/?$/i },
  { platform: 'tiktok', test: /^https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?$/i },
  { platform: 'yelp', test: /^https?:\/\/(?:www\.)?yelp\.com\/biz\/[A-Za-z0-9\-]+\/?$/i },
]

function extractSocials(html: string): SocialLink[] {
  const hrefs = new Set<string>()
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) hrefs.add(m[1])
  const found: SocialLink[] = []
  const seen = new Set<string>()
  for (const href of hrefs) {
    const url = href.replace(/&amp;/g, '&').split('?')[0]
    for (const { platform, test } of SOCIAL_PATTERNS) {
      if (seen.has(platform)) continue
      if (test.test(url)) {
        found.push({ platform, url })
        seen.add(platform)
      }
    }
  }
  return found
}

async function fetchWebsiteMeta(website: string): Promise<WebsiteMeta> {
  const empty: WebsiteMeta = { image: null, socials: [] }
  try {
    // Don't let Next cache the raw HTML (some sites are >2MB); we cache the
    // small parsed result via unstable_cache below instead.
    const res = await fetch(website, {
      headers: { 'user-agent': FETCH_UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return empty
    const html = await res.text()
    let image: string | null = null
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    if (m) {
      let url = m[1].trim().replace(/&amp;/g, '&')
      if (url.startsWith('//')) url = `https:${url}`
      else if (url.startsWith('/')) url = new URL(url, website).href
      if (/^https?:\/\//i.test(url)) image = url
    }
    return { image, socials: extractSocials(html) }
  } catch {
    return empty
  }
}

// Cache the small parsed result (not the raw HTML) for a day, per website.
const getWebsiteMeta = unstable_cache(fetchWebsiteMeta, ['directory-website-meta-v1'], {
  revalidate: 86400,
})

/**
 * Resolve display images and social links for a set of shops in one pass.
 * Photo priority: uploaded → website og:image → seed photos → branded cover.
 * Socials: seed value wins, else auto-discovered from the website.
 */
export async function enrichShops(shops: Shop[]): Promise<Shop[]> {
  const uploads = await getPhotosForSlugs()
  return Promise.all(
    shops.map(async (s) => {
      const uploaded = uploads[s.slug] ?? []
      const meta = s.website
        ? await getWebsiteMeta(s.website)
        : { image: null, socials: [] }
      const web = uploaded.length ? null : meta.image
      const photos = [...uploaded, ...(web ? [web] : []), ...(s.photos ?? [])]
      const socials = s.socials?.length ? s.socials : meta.socials
      const next: Shop = { ...s }
      if (photos.length) next.photos = photos
      if (socials.length) next.socials = socials
      return next
    })
  )
}

export async function enrichShop(shop: Shop): Promise<Shop> {
  return (await enrichShops([shop]))[0]
}
