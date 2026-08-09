import { put, del } from '@vercel/blob'
import sharp, { type Sharp, type Metadata } from 'sharp'

/**
 * Photo uploads for client sites, watermarked with the client's own logo.
 *
 * Two things this deliberately does NOT do:
 *
 * 1. It does not trust the browser's Content-Type. A file is decoded by sharp
 *    before anything else happens; if sharp cannot read it as an image, it is
 *    rejected. A ".jpg" that is actually something else never reaches storage.
 *
 * 2. It does not store the original. Everything is re-encoded through sharp,
 *    which strips EXIF along the way — shop photos are taken on phones, and
 *    phone photos carry GPS coordinates and camera serial numbers that have
 *    no business being on a public web page.
 */

/** Anything larger is a camera original nobody needs on a landing page. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
/** Long edge of the stored image. Comfortably above any slot on the page. */
const MAX_DIMENSION = 1600
/** Logo width as a fraction of the photo width. */
const WATERMARK_SCALE = 0.18
/** Gap from the photo edge, as a fraction of the photo width. */
const WATERMARK_PAD = 0.03
const WATERMARK_OPACITY = 0.85

export interface ProcessedPhoto {
  url: string
  width: number
  height: number
  bytes: number
  watermarked: boolean
}

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

/**
 * Fetch the client's logo and size it for the corner of `photoWidth`.
 *
 * Returns null for anything that isn't usable — no logo set, a dead URL, a
 * format sharp can't read. A missing watermark is a cosmetic loss; a failed
 * upload is a broken feature, so this never throws.
 */
async function buildWatermark(logoUrl: string | null, photoWidth: number): Promise<Buffer | null> {
  if (!logoUrl) return null
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const raw = Buffer.from(await res.arrayBuffer())

    const target = Math.max(64, Math.round(photoWidth * WATERMARK_SCALE))
    const resized = await sharp(raw)
      .resize({ width: target, withoutEnlargement: false, fit: 'inside' })
      .ensureAlpha()
      // sharp has no opacity option; multiplying the alpha channel through a
      // dest-in composite is the documented way to get one.
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(255 * WATERMARK_OPACITY)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer()
    return resized
  } catch {
    return null
  }
}

/**
 * Normalise, watermark and store one uploaded photo.
 *
 * @param logoUrl the client's logo; when absent the photo is stored unmarked
 *                rather than marked with someone else's brand.
 */
export async function processAndStorePhoto({
  file,
  clientSlug,
  logoUrl,
}: {
  file: ArrayBuffer
  clientSlug: string
  logoUrl: string | null
}): Promise<{ ok: true; photo: ProcessedPhoto } | { ok: false; error: string }> {
  if (!blobConfigured()) {
    return {
      ok: false,
      error:
        'Photo storage is not configured. Create a Blob store on the Vercel project (Storage → Create → Blob); it adds BLOB_READ_WRITE_TOKEN automatically.',
    }
  }
  if (file.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'That photo is larger than 15 MB. Please pick a smaller one.' }
  }

  const input = Buffer.from(file)

  let base: Sharp
  let meta: Metadata
  try {
    base = sharp(input, { failOn: 'error' }).rotate() // honour EXIF orientation, then drop EXIF
    meta = await base.metadata()
    if (!meta.width || !meta.height) throw new Error('no dimensions')
  } catch {
    return { ok: false, error: "That file isn't an image we can read. JPEG, PNG, WebP or HEIC." }
  }

  const resized = base.resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  })

  // Dimensions AFTER the resize — the watermark is sized against what will
  // actually be stored, not the camera original.
  const resizedBuffer = await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
  const resizedMeta = await sharp(resizedBuffer).metadata()
  const width = resizedMeta.width || MAX_DIMENSION
  const height = resizedMeta.height || MAX_DIMENSION

  const watermark = await buildWatermark(logoUrl, width)
  let finalBuffer = resizedBuffer
  if (watermark) {
    const mark = await sharp(watermark).metadata()
    if (mark.width && mark.height) {
      // Positioned by offset rather than gravity so it sits inside a margin
      // instead of flush against the corner.
      const pad = Math.round(width * WATERMARK_PAD)
      finalBuffer = await sharp(resizedBuffer)
        .composite([
          {
            input: watermark,
            top: Math.max(0, height - mark.height - pad),
            left: Math.max(0, width - mark.width - pad),
          },
        ])
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer()
    }
  }

  try {
    // A random suffix keeps two uploads of "photo.jpg" from colliding, and
    // keeps the URL unguessable.
    const blob = await put(`sites/${clientSlug}/${Date.now()}.jpg`, finalBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    })
    return {
      ok: true,
      photo: {
        url: blob.url,
        width,
        height,
        bytes: finalBuffer.byteLength,
        watermarked: !!watermark,
      },
    }
  } catch (error) {
    console.error('Blob upload failed:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }
}

/**
 * Remove a stored photo's file.
 *
 * Only files we uploaded are deleted — a photo imported from the client's own
 * website is just a URL we reference, and deleting is not ours to do.
 */
export async function deleteStoredPhoto(url: string): Promise<void> {
  if (!blobConfigured()) return
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(url)) return
  await del(url).catch((error) => console.error('Blob delete failed:', error))
}
