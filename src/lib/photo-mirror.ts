import { put } from '@vercel/blob'
import sharp from 'sharp'
import { validatePublicUrl } from '@/lib/site-import'
import { stampWatermark, type WordmarkSource } from '@/lib/photo-upload'
import { toBlobBody } from '@/lib/blob-body'

/**
 * Copy an imported image onto our own storage.
 *
 * The importer used to keep the shop's original URL, so every photo and logo
 * on a hosted site was hot-linked from whatever CMS the shop had before —
 * Squarespace, WordPress, a CDN we do not control. Three things follow from
 * that, and all three were measured on live client sites:
 *
 * - **Weight.** One shop shipped ~1MB of images into slots a phone renders at
 *   358px, including a single 2500x2285 file served three times over. Their
 *   CDN sends whatever was uploaded; we cannot ask it for a smaller one, and
 *   `next/image` cannot help because it refuses remote hosts that are not in
 *   `images.remotePatterns` — which cannot be a wildcard, or the optimiser
 *   becomes an open image proxy for anyone who finds it.
 * - **Fragility.** A shop redesign, a hotlink block or a CDN expiry turns a
 *   live landing page into broken-image boxes with no deploy on our side,
 *   and the gallery's only emptiness test is "no rows", so it renders the
 *   boxes rather than stripping the section.
 * - **Bandwidth someone else pays for.** Every visit bills the shop's old
 *   host for traffic they get nothing from.
 *
 * So imported images are re-encoded and stored once, exactly like uploads and
 * call recordings already are. Re-encoding through sharp is also what strips
 * EXIF, which on a phone photo carries GPS.
 */

/** Long edge of a stored image. The widest slot on any page is ~1200px. */
const MAX_DIMENSION = 1600
/** Refuse anything implausible before decoding it. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

/** Already ours — nothing to copy. */
function isOurs(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.blob.vercel-storage.com')
  } catch {
    return false
  }
}

/**
 * Fetch, re-encode and store one image. Returns the new URL, or null when it
 * could not be copied.
 *
 * Null is a real answer, not an error path to swallow: the caller keeps the
 * original URL in that case, because a hot-linked photo is worse than a
 * self-hosted one but very much better than no photo.
 */
export async function mirrorRemoteImage(
  sourceUrl: string,
  clientSlug: string,
  kind: 'photo' | 'logo' = 'photo',
  /**
   * The shop's mark, for photos. An uploaded photo has always carried it and
   * an IMPORTED one never did — the same gallery, two behaviours, and the
   * difference only visible with two photos side by side. Omitted for a logo,
   * which cannot sensibly be stamped with itself.
   */
  brand?: { logoUrl: string | null; wordmark?: WordmarkSource }
): Promise<string | null> {
  if (!sourceUrl || isOurs(sourceUrl)) return null

  // Same guard the importer applies to every URL it is handed: https only, no
  // private or link-local hosts. This runs server-side against an
  // admin-supplied address, so it is exactly the SSRF shape that rule exists
  // for.
  const safe = validatePublicUrl(sourceUrl)
  if (!safe.ok) return null

  try {
    const res = await fetch(sourceUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const declared = Number(res.headers.get('content-length') || 0)
    if (declared && declared > MAX_SOURCE_BYTES) return null

    const source = Buffer.from(await res.arrayBuffer())
    if (source.byteLength > MAX_SOURCE_BYTES) return null

    // sharp decodes it or it is not an image, whatever the Content-Type said.
    const image = sharp(source, { failOn: 'none' })
    const meta = await image.metadata()
    if (!meta.width || !meta.height) return null

    // A logo keeps its transparency and its aspect; a photo becomes a JPEG.
    const isLogo = kind === 'logo'
    const pipeline = image.rotate().resize({
      width: Math.min(meta.width, isLogo ? 480 : MAX_DIMENSION),
      fit: 'inside',
      withoutEnlargement: true,
    })
    let output: Buffer = isLogo
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()

    if (!isLogo && brand) {
      // Measured after the resize, like the upload path: the mark is sized
      // against the image that will actually be stored.
      const out = await sharp(output).metadata()
      if (out.width && out.height) {
        output = await stampWatermark(output, out.width, out.height, brand.logoUrl, brand.wordmark)
      }
    }

    const blob = await put(
      `sites/${clientSlug}/imported/${Date.now()}.${isLogo ? 'png' : 'jpg'}`,
      toBlobBody(output),
      {
        access: 'public',
        contentType: isLogo ? 'image/png' : 'image/jpeg',
        addRandomSuffix: true,
      }
    )
    return blob.url
  } catch (err) {
    console.warn('[PhotoMirror] could not copy', sourceUrl, err)
    return null
  }
}

/**
 * Mirror a batch, in small groups.
 *
 * Sequential would blow the import route's budget on a shop with a dozen
 * photos; all at once would open a dozen sockets to one host and read as an
 * attack. Failures keep their original URL.
 */
export async function mirrorImages<T extends { url: string }>(
  items: T[],
  clientSlug: string,
  brand?: { logoUrl: string | null; wordmark?: WordmarkSource },
  concurrency = 3
): Promise<T[]> {
  const out = [...items]
  for (let i = 0; i < out.length; i += concurrency) {
    const slice = out.slice(i, i + concurrency)
    const copied = await Promise.all(
      slice.map((item) => mirrorRemoteImage(item.url, clientSlug, 'photo', brand).catch(() => null))
    )
    copied.forEach((url, j) => {
      if (url) out[i + j] = { ...out[i + j], url }
    })
  }
  return out
}
