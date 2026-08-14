import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { sitePaletteVars } from '@/lib/site-theme'
import { wordmarkParts, wordmarkNameSize } from '@/lib/wordmark'

/**
 * Raster form of the generated wordmark (see `wordmark.ts` for what this is
 * and why it is a name rather than an invented emblem).
 *
 * The site header and footer draw the wordmark as live HTML — crisper text,
 * no image request. This exists for the places that genuinely need pixels:
 * watermarking uploaded photos, and giving the admin a file to hand the shop
 * or drop into a listing.
 */

export type WordmarkVariant = 'light' | 'dark' | 'mono'

/** Badge height in the rendered image; everything else scales off it. */
const BADGE = 96

/**
 * Inter Tight Bold, the same display face the hosted sites use, bundled as
 * TTF because Satori cannot read the woff2 that next/font emits — and
 * without a real bold the mark renders in the fallback regular weight and
 * looks like a placeholder rather than a wordmark. Read once per process.
 * (SIL Open Font License 1.1; license text sits beside the file.)
 */
let fontPromise: Promise<Buffer> | null = null
function displayFont(): Promise<Buffer> {
  fontPromise ??= readFile(path.join(process.cwd(), 'src/assets/InterTight-Bold.ttf'))
  return fontPromise
}

export async function renderWordmarkImage({
  businessName,
  primaryColor,
  accentColor,
  variant = 'light',
}: {
  businessName: string
  primaryColor?: string | null
  accentColor?: string | null
  variant?: WordmarkVariant
}): Promise<ImageResponse> {
  const { initials, name, length } = wordmarkParts(businessName)
  const font = await displayFont()
  const palette = sitePaletteVars(primaryColor || null, accentColor || null)
  const nameSize = wordmarkNameSize(length, BADGE)

  const mono = variant === 'mono'
  const badgeBg = mono ? '#ffffff' : palette['--cta']
  const badgeFg = mono ? 'rgba(0,0,0,0.72)' : '#ffffff'
  const nameFg = mono ? '#ffffff' : variant === 'dark' ? '#ffffff' : '#111827'

  // Generously wide: the exact text width isn't knowable before layout, and
  // the transparent overshoot is trimmed off in `wordmarkPng` below.
  const width = Math.round(BADGE * 1.6 + name.length * nameSize * 0.72)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(BADGE * 0.28),
          padding: Math.round(BADGE * 0.12),
        }}
      >
        <div
          style={{
            width: BADGE,
            height: BADGE,
            flexShrink: 0,
            borderRadius: BADGE,
            background: badgeBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: badgeFg,
            fontSize: Math.round(BADGE * (initials.length > 1 ? 0.42 : 0.54)),
            letterSpacing: initials.length > 1 ? -1 : 0,
            fontFamily: 'Inter Tight',
          }}
        >
          {initials}
        </div>
        <div
          style={{
            display: 'flex',
            color: nameFg,
            fontSize: nameSize,
            letterSpacing: -0.5,
            whiteSpace: 'nowrap',
            fontFamily: 'Inter Tight',
          }}
        >
          {name}
        </div>
      </div>
    ),
    {
      width,
      height: Math.round(BADGE * 1.35),
      fonts: [{ name: 'Inter Tight', data: font, weight: 700, style: 'normal' }],
    }
  )
}

/**
 * The wordmark as a PNG buffer, trimmed to its ink.
 *
 * The trim matters: the render above deliberately overshoots the width
 * because text metrics aren't known until layout, and untrimmed transparent
 * margin would push a photo watermark away from the corner it is supposed to
 * sit in.
 */
export async function wordmarkPng(args: {
  businessName: string
  primaryColor?: string | null
  accentColor?: string | null
  variant?: WordmarkVariant
}): Promise<Buffer> {
  const response = await renderWordmarkImage(args)
  const raw = Buffer.from(await response.arrayBuffer())
  try {
    return await sharp(raw).trim({ threshold: 0 }).png().toBuffer()
  } catch {
    // A trim that finds nothing to cut throws rather than returning the
    // original; the untrimmed render is still a correct wordmark.
    return raw
  }
}
