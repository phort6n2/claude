/**
 * Can the app actually read every format its file picker offers?
 *
 *   npx tsx scripts/check-image-formats.ts
 *
 * WHY THIS IS WORTH A SCRIPT. Two lists have to agree — what the picker's
 * `accept` attribute offers, and what sharp can decode on the machine this
 * runs on — and when they drift nothing says so. Drift one way and a shop
 * owner's logo is greyed out in the file dialog although the server would
 * have taken it happily, which is how AVIF went unsupported for as long as it
 * did: nothing was broken, the format was simply never offered. Drift the
 * other way and the picker offers a file that is refused after they choose
 * it, which reads as the app being unreliable.
 *
 * It also pins the thing that actually decides AVIF support: the libvips
 * build sharp ships with. AVIF needs libheif and libaom inside
 * `@img/sharp-libvips-*`, and that is a property of an installed package
 * rather than of this code — a sharp upgrade could take it away, and the only
 * symptom would be logo uploads starting to fail for one format.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * encodes a real file of each format and runs it through the real decoder.
 */
import sharp from 'sharp'
import { LOGO_FORMATS, LOGO_ACCEPT, LOGO_FORMATS_SENTENCE } from '@/lib/image-formats'
import { logoPngFrom } from '@/lib/photo-upload'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/** A logo-shaped source: wide, and transparent where a logo would be. */
function source() {
  return sharp({
    create: { width: 900, height: 300, channels: 4, background: { r: 0, g: 90, b: 200, alpha: 1 } },
  }).composite([
    {
      input: {
        create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      },
      left: 600,
      top: 0,
      blend: 'dest-out',
    },
  ])
}

async function encode(ext: string): Promise<Buffer> {
  const img = source()
  if (ext === '.png') return img.png().toBuffer()
  if (ext === '.jpg') return img.jpeg({ quality: 90 }).toBuffer()
  if (ext === '.webp') return img.webp({ lossless: true }).toBuffer()
  if (ext === '.avif') return img.avif({ quality: 60 }).toBuffer()
  throw new Error(`no encoder for ${ext} — is it new to LOGO_FORMATS?`)
}

async function main() {
  console.log(`sharp ${sharp.versions.sharp} · libvips ${sharp.versions.vips}`)
  console.log(`heif ${sharp.versions.heif ?? '(absent)'} · aom ${sharp.versions.aom ?? '(absent)'}\n`)

  console.log('--- every format the picker offers decodes and re-encodes ---')
  for (const format of LOGO_FORMATS) {
    let input: Buffer
    try {
      input = await encode(format.ext[0])
    } catch (err) {
      check(`${format.label}: a sample can be produced`, false, String(err))
      continue
    }
    const result = await logoPngFrom(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer)
    if (!result.ok) {
      check(`${format.label} (${format.mime}) is accepted`, false, result.error)
      continue
    }
    const meta = await sharp(result.png).metadata()
    check(
      `${format.label} (${format.mime}) -> PNG ${meta.width}x${meta.height}`,
      meta.format === 'png' && meta.width === 480,
      JSON.stringify({ format: meta.format, width: meta.width })
    )
    /* TRANSPARENCY IS THE WHOLE REASON THE LOGO PATH EXISTS: the file is drawn
       on the dark footer band and used as the photo watermark, so an alpha
       channel lost in conversion puts a box around the logo.
       Compared against what the FIXTURE carries rather than against the
       format's capabilities, because those are not the same thing here. JPEG
       has no alpha to keep. And sharp's WebP ENCODER in this libvips build
       writes 3 channels even from a 4-channel source, so a WebP fixture made
       here cannot carry alpha to test with — which says nothing about the
       decoder, and nothing about the app, which never encodes WebP. Demanding
       alpha out of a fixture that has none would be asserting a fiction. */
    const inputHasAlpha = !!(await sharp(input).metadata()).hasAlpha
    check(
      inputHasAlpha
        ? `${format.label} keeps its transparency`
        : `${format.label} has no alpha to keep (fixture is opaque)`,
      !!meta.hasAlpha === inputHasAlpha,
      `in=${inputHasAlpha} out=${meta.hasAlpha}`
    )
  }

  console.log('\n--- AVIF specifically, because it is the one that depends on the build ---')
  check('libheif is present in this sharp build', !!sharp.versions.heif)
  check('libaom is present (AVIF is AV1 in a HEIF container)', !!sharp.versions.aom)
  check('sharp reports avif input support', sharp.format.heif.input.buffer === true)

  console.log('\n--- the picker list ---')
  for (const format of LOGO_FORMATS) {
    check(`accept offers ${format.mime}`, LOGO_ACCEPT.includes(format.mime))
    // Both forms, because a system that does not know a MIME type greys the
    // file out exactly as if it were never listed — and EVERY spelling of the
    // extension, because ".jpeg" being absent greys out a .jpeg file just as
    // completely as leaving JPEG off the list altogether.
    for (const ext of format.ext) {
      check(`accept also offers ${ext}`, LOGO_ACCEPT.includes(ext))
    }
  }
  check(`the sentence reads properly: "${LOGO_FORMATS_SENTENCE}"`, / or /.test(LOGO_FORMATS_SENTENCE))
  // SVG stays out: sharp reads it only with librsvg, which Vercel's build does
  // not guarantee, and it would fail as a broken image in a live header.
  check('SVG is not offered', !LOGO_ACCEPT.includes('svg'))

  console.log('\n--- what must still be refused ---')
  {
    const junk = new TextEncoder().encode('this is not an image, it is a sentence')
    const r = await logoPngFrom(junk.buffer as ArrayBuffer)
    check('a non-image is refused', !r.ok)
    check(
      'and the message names the formats that do work',
      !r.ok && LOGO_FORMATS.every((f) => r.error.includes(f.label)),
      !r.ok ? r.error : ''
    )
  }

  console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
  process.exit(bad === 0 ? 0 : 1)
}

main()
