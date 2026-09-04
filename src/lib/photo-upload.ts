import { put, del, list } from '@vercel/blob'
import sharp, { type Sharp, type Metadata } from 'sharp'
import { wordmarkPng } from '@/lib/wordmark-image'
import { toBlobBody } from '@/lib/blob-body'

/** Enough of a client to draw their generated wordmark. */
export interface WordmarkSource {
  businessName: string
  primaryColor?: string | null
  accentColor?: string | null
}

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
/** A phone photo of a windscreen; anything bigger is a camera original. */
export const MAX_DAMAGE_UPLOAD_BYTES = 12 * 1024 * 1024
/** Enough to tell a chip from a crack and see where on the glass it sits. */
const DAMAGE_DIMENSION = 1600
/** Twice the widest slot the header gives a logo; same as the importer's. */
const LOGO_DIMENSION = 480

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
/**
 * Is the corner this mark will sit in dark or light?
 *
 * A white mark on a white bonnet and a black mark on a night shot are the
 * same bug, and both were shipping: the generated wordmark was always drawn
 * white, and a shop's own logo went down in whatever colours it has. Photos
 * of glass work are mostly pale — sky, white cars, a lit workshop — so the
 * white one lost more often.
 *
 * Measured on the actual pixels rather than guessed from the average of the
 * whole photo: a dark photo can have a bright corner and the corner is the
 * only part that matters.
 */
async function cornerIsDark(
  jpeg: Buffer,
  width: number,
  height: number,
  markWidth: number,
  pad: number
): Promise<boolean> {
  try {
    // A generous box around where the mark lands. The mark's own height is
    // not known yet — it depends on the logo's aspect — so this takes half
    // its width, which covers a wordmark and most badges.
    const boxW = Math.min(width, Math.round(markWidth + pad * 2))
    const boxH = Math.min(height, Math.round(markWidth * 0.5 + pad * 2))
    // The crop is MATERIALISED first. sharp's stats() reads the image as
    // loaded and ignores the pipeline, so measuring straight off .extract()
    // silently returns the stats of the whole photo — which is how a light
    // corner on a dark photo came back "dark" and took a white mark.
    const crop = await sharp(jpeg)
      .extract({
        left: Math.max(0, width - boxW),
        top: Math.max(0, height - boxH),
        width: boxW,
        height: boxH,
      })
      .toBuffer()
    const region = await sharp(crop).stats()
    const [r, g, b] = region.channels
    if (!r || !g || !b) return false
    // Rec. 709 luma on the region means. 0.55 rather than 0.5 because a mark
    // is thin strokes over the background: it needs the background to be
    // clearly light before a dark mark is the better bet.
    const luma = (0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean) / 255
    return luma < 0.55
  } catch {
    // Unreadable region: keep the historical behaviour rather than guessing.
    return true
  }
}

/**
 * Repaint a mark in one flat colour, keeping its shape.
 *
 * Only for a mark with real transparency — a logo whose alpha actually varies
 * is a shape we can recolour, and an opaque rectangle is not: filling that
 * would produce a solid block. Returns null when it cannot be done, and the
 * caller then uses the mark as it came.
 */
async function repaintMark(mark: Buffer, colour: { r: number; g: number; b: number }) {
  try {
    const image = sharp(mark)
    const meta = await image.metadata()
    if (!meta.width || !meta.height || !meta.hasAlpha) return null
    const stats = await image.stats()
    const alpha = stats.channels[stats.channels.length - 1]
    if (!alpha || alpha.min >= 250) return null
    const shape = await sharp(mark).ensureAlpha().extractChannel(3).toBuffer()
    return await sharp({
      create: { width: meta.width, height: meta.height, channels: 3, background: colour },
    })
      .joinChannel(shape)
      .png()
      .toBuffer()
  } catch {
    return null
  }
}

async function buildWatermark(
  logoUrl: string | null,
  photoWidth: number,
  wordmark?: WordmarkSource,
  /** What the corner needs: a light mark on a dark photo, or the reverse. */
  wantLight = true
): Promise<Buffer | null> {
  // No logo is not the same as nothing to mark with. A shop without a logo
  // still has a name, and an unmarked photo is one anybody can lift for their
  // own listing — so the generated wordmark stands in.
  let raw: Buffer
  try {
    if (logoUrl) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return null
      raw = Buffer.from(await res.arrayBuffer())
    } else if (wordmark?.businessName) {
      // The generated wordmark can simply be DRAWN in the right colour — no
      // recolouring needed. 'mono' is white, 'light' is dark ink.
      raw = await wordmarkPng({ ...wordmark, variant: wantLight ? 'mono' : 'light' })
    } else {
      return null
    }

    const target = Math.max(64, Math.round(photoWidth * WATERMARK_SCALE))
    // A shop's own logo is whatever colours they use, so it is repainted to
    // suit the corner when its shape allows. An opaque logo keeps its own
    // colours — it carries its own background and reads on anything.
    const toned = logoUrl
      ? await repaintMark(raw, wantLight ? { r: 255, g: 255, b: 255 } : { r: 17, g: 17, b: 17 })
      : null
    const resized = await sharp(toned || raw)
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
 * Put the shop's mark in the corner of a JPEG that is already the right size.
 *
 * Shared with the importer's mirror, which had no watermark at all — so an
 * uploaded photo carried the shop's logo and an IMPORTED one did not, on the
 * same gallery, and the difference was invisible until somebody looked at two
 * photos side by side. Same mark, same corner, whichever door the photo came
 * in through.
 *
 * Returns the original buffer when there is nothing to stamp with or the
 * stamp fails: an unmarked photo is a cosmetic loss, a lost photo is not.
 */
export async function stampWatermark(
  jpeg: Buffer,
  width: number,
  height: number,
  logoUrl: string | null,
  wordmark?: WordmarkSource
): Promise<Buffer> {
  try {
    const pad = Math.round(width * WATERMARK_PAD)
    // The corner decides the mark's colour, not the other way round.
    const wantLight = await cornerIsDark(
      jpeg,
      width,
      height,
      Math.max(64, Math.round(width * WATERMARK_SCALE)),
      pad
    )
    const watermark = await buildWatermark(logoUrl, width, wordmark, wantLight)
    if (!watermark) return jpeg
    const mark = await sharp(watermark).metadata()
    if (!mark.width || !mark.height) return jpeg
    // Positioned by offset rather than gravity so it sits inside a margin
    // instead of flush against the corner.
    return await sharp(jpeg)
      .composite([
        {
          input: watermark,
          top: Math.max(0, height - mark.height - pad),
          left: Math.max(0, width - mark.width - pad),
        },
      ])
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
  } catch {
    return jpeg
  }
}

/**
 * Normalise, watermark and store one uploaded photo.
 *
 * @param logoUrl the client's logo. When absent, the generated wordmark is
 *                used instead — never another business's brand.
 */
export async function processAndStorePhoto({
  file,
  clientSlug,
  logoUrl,
  wordmark,
}: {
  file: ArrayBuffer
  clientSlug: string
  logoUrl: string | null
  /** Used to mark the photo when the client has no logo of their own. */
  wordmark?: WordmarkSource
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

  const finalBuffer = await stampWatermark(resizedBuffer, width, height, logoUrl, wordmark)
  // The stamp returns the original buffer when it could not mark the photo,
  // so identity is the honest test of whether one was applied.
  const watermarked = finalBuffer !== resizedBuffer

  try {
    // A random suffix keeps two uploads of "photo.jpg" from colliding, and
    // keeps the URL unguessable.
    // toBlobBody, not finalBuffer directly — see lib/blob-body.ts. sharp's
    // pooled output is rejected by the fetch inside put().
    const blob = await put(`sites/${clientSlug}/${Date.now()}.jpg`, toBlobBody(finalBuffer), {
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
        watermarked,
      },
    }
  } catch (error) {
    console.error('Blob upload failed:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }
}

/**
 * Store a customer's photo of their damage.
 *
 * Deliberately not the same path as the gallery photos above. This one is
 * never watermarked — it is the customer's photo of their own car, and
 * stamping a shop's logo on it would be both odd and misleading if it were
 * ever forwarded on. It is also stored smaller: the job it has to do is let a
 * technician tell a chip from a spreading crack and see where on the glass it
 * sits, and 1600px does that with room to spare.
 *
 * The EXIF stripping matters more here than it does for a shop's own photos.
 * A customer photographs the windscreen on their driveway, so the original
 * carries the GPS coordinates of their house. Re-encoding through sharp drops
 * it, and the file that reaches storage has none of it.
 */
export async function storeDamagePhoto({
  file,
  clientSlug,
}: {
  file: ArrayBuffer
  clientSlug: string
}): Promise<{ ok: true; url: string; bytes: number } | { ok: false; error: string }> {
  if (!blobConfigured()) {
    return { ok: false, error: 'Photo storage is not configured.' }
  }
  if (file.byteLength > MAX_DAMAGE_UPLOAD_BYTES) {
    return { ok: false, error: 'That photo is too large. Please pick one under 12 MB.' }
  }

  let output: Buffer
  try {
    output = await sharp(Buffer.from(file), { failOn: 'error' })
      .rotate() // apply EXIF orientation, then lose the EXIF with it
      .resize({ width: DAMAGE_DIMENSION, height: DAMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
  } catch {
    return { ok: false, error: "That file isn't a photo we can read. Try a JPEG, PNG or HEIC." }
  }

  try {
    const blob = await put(`damage/${clientSlug}/${Date.now()}.jpg`, toBlobBody(output), {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    })
    return { ok: true, url: blob.url, bytes: output.byteLength }
  } catch (error) {
    console.error('[Damage photo] Blob upload failed:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }
}

/**
 * Store a logo the admin uploaded by hand.
 *
 * Not a photo, and it must not go down the photo path: no watermark (it IS
 * the watermark), no JPEG (a logo without its transparency gets a white box
 * around it, which on the dark footer band is the whole logo ruined), and no
 * enlargement — a small crisp file stays small rather than being blown up
 * into a blurry one.
 *
 * 480px matches what the importer mirrors, which is twice the widest slot the
 * header gives a logo.
 */
export async function storeLogoUpload({
  file,
  clientSlug,
}: {
  file: ArrayBuffer
  clientSlug: string
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!blobConfigured()) {
    return {
      ok: false,
      error:
        'Image storage is not configured. Create a Blob store on the Vercel project (Storage → Create → Blob); it adds BLOB_READ_WRITE_TOKEN automatically. You can paste a URL instead.',
    }
  }
  if (file.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'That file is larger than 15 MB.' }
  }

  let output: Buffer
  try {
    const image = sharp(Buffer.from(file), { failOn: 'none' })
    const meta = await image.metadata()
    if (!meta.width || !meta.height) throw new Error('no dimensions')
    output = await image
      .resize({ width: Math.min(meta.width, LOGO_DIMENSION), fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch {
    // sharp reads SVG only when its build has librsvg, which Vercel's does not
    // guarantee — and an SVG that fails here fails silently as a broken image
    // in the header, so it is named rather than lumped in with "not an image".
    return {
      ok: false,
      error: "That file couldn't be read as an image. PNG or JPEG works; export an SVG to PNG first.",
    }
  }

  try {
    const blob = await put(`sites/${clientSlug}/logo/${Date.now()}.png`, toBlobBody(output), {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: true,
    })
    return { ok: true, url: blob.url }
  } catch (error) {
    console.error('[Logo] Blob upload failed:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }
}

/**
 * Remove a stored photo's file.
 *
 * Only files we uploaded are deleted — a photo imported from the client's own
 * website is just a URL we reference, and deleting is not ours to do.
 */
export interface BlobDeleteResult {
  /** The object is gone from storage. */
  deleted: boolean
  /** Nothing to do — not a file we host. */
  skipped?: boolean
  error?: string
}

export async function deleteStoredPhoto(url: string): Promise<BlobDeleteResult> {
  // Reported rather than swallowed. This used to return void and eat its own
  // errors, which meant a caller counting successful deletes was counting
  // calls, not deletions — and would cheerfully report "deleted 14 photos"
  // while all fourteen were still in storage being billed for.
  if (!blobConfigured()) {
    return { deleted: false, error: 'BLOB_READ_WRITE_TOKEN is not set in this deployment' }
  }
  if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(url)) {
    return { deleted: false, skipped: true }
  }
  try {
    await del(url)
    return { deleted: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blob delete failed'
    console.error('Blob delete failed:', message)
    return { deleted: false, error: message }
  }
}

/**
 * Delete everything stored under one client's folder.
 *
 * Uploads land at `sites/{slug}/…`, so the folder is the complete set of
 * objects we hold for that client — including any whose database row has
 * already gone. Deleting row by row can only ever remove what is still
 * referenced, and an object that outlived its row is exactly the one nobody
 * will ever notice paying for.
 */
export async function purgeClientPhotoFolder(
  clientSlug: string
): Promise<{ deleted: number; error?: string }> {
  if (!blobConfigured()) {
    return { deleted: 0, error: 'BLOB_READ_WRITE_TOKEN is not set in this deployment' }
  }
  const prefix = `sites/${clientSlug}/`
  let deleted = 0
  let cursor: string | undefined

  try {
    do {
      const page = await list({ prefix, cursor, limit: 1000 })
      const urls = page.blobs.map((b) => b.url)
      if (urls.length > 0) {
        await del(urls)
        deleted += urls.length
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    return { deleted }
  } catch (error) {
    return {
      deleted,
      error: error instanceof Error ? error.message : 'Could not list or delete the folder',
    }
  }
}
