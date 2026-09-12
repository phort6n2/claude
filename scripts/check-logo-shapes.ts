/**
 * Does a logo look the right size whatever shape it is?
 *
 *   npx tsx scripts/check-logo-shapes.ts
 *
 * WHY THIS IS WORTH A SCRIPT. Fifteen shops send fifteen shapes — wordmarks
 * near 5:1, plain rectangles, square badges, circles — and the header has one
 * slot for all of them. Nothing about a logo that renders too small is an
 * error: the file is valid, the markup is valid, the page is fine, and the
 * only symptom is a shop owner saying it "doesn't look great", months later,
 * about one client out of fifteen.
 *
 * TWO SEPARATE THINGS MAKE IT LOOK WRONG, and they are easy to conflate.
 *
 * 1. PADDING BAKED INTO THE FILE. A logo exported with a wide margin of
 *    transparent or flat canvas gets sized as a whole, so the ink lands at
 *    whatever fraction of the box the ink occupies in the file. MAG Mobile's
 *    real logo is 480x320 with 155px of horizontal and 154px of vertical
 *    padding: 35% ink, and a visible mark of roughly 53x27 in a 72px header.
 *    trimToInk removes that border at upload.
 *
 * 2. A FIXED HEIGHT WITH A FIXED BOX. h-[52px] + max-w-[240px] +
 *    object-contain gives every logo a 240x52 box whatever it contains, so a
 *    square badge renders 52 wide inside 240 and the leftover 188px reads as
 *    a gap in the header. Two ceilings and no fixed size lets the shape pick
 *    which one binds.
 *
 * This asserts the arithmetic of both, against the real file where there is
 * one. There is no test runner in this repo; this is a script on purpose.
 */
import sharp from 'sharp'
import { readFileSync, existsSync } from 'node:fs'
import { logoPngFrom } from '@/lib/photo-upload'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

/** The header's box, as shared.tsx declares it. */
const MAX_H = 56
const MAX_W = 240

/** What the browser does with max-h + max-w + auto sizing: fit inside. */
function rendered(w: number, h: number) {
  const scale = Math.min(MAX_W / w, MAX_H / h, 1)
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/**
 * A logo of a given shape, with a margin of empty canvas around the ink —
 * which is how they actually arrive.
 */
async function shaped(inkW: number, inkH: number, pad: number, round = false) {
  const w = inkW + pad * 2
  const h = inkH + pad * 2
  const ink = round
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${inkW}" height="${inkH}"><circle cx="${inkW / 2}" cy="${inkH / 2}" r="${Math.min(inkW, inkH) / 2}" fill="#1d4ed8"/></svg>`
      )
    : Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${inkW}" height="${inkH}"><rect width="100%" height="100%" fill="#1d4ed8"/></svg>`
      )
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await sharp(ink).png().toBuffer(), left: pad, top: pad }])
    .png()
    .toBuffer()
}

async function main() {
  console.log('--- the shapes fifteen shops actually send ---')
  const shapes: Array<[string, number, number, number, boolean]> = [
    // label, ink width, ink height, padding, circular
    ['wide wordmark 5:1', 1000, 200, 60, false],
    ['rectangle 1.5:1', 600, 400, 80, false],
    ['square badge', 400, 400, 70, false],
    ['circular badge', 400, 400, 70, true],
    ['tall/portrait', 300, 600, 50, false],
  ]

  for (const [label, inkW, inkH, pad, round] of shapes) {
    const file = await shaped(inkW, inkH, pad, round)
    const before = await sharp(file).metadata()
    const made = await logoPngFrom(file)
    if (!made.ok) {
      check(`${label}: stored`, false, made.error)
      continue
    }
    const after = await sharp(made.png).metadata()

    // The stored file should be the INK, at the ink's aspect — no margin.
    const inkAspect = inkW / inkH
    const storedAspect = (after.width || 1) / (after.height || 1)
    check(
      `${label}: padding removed (file ${before.width}x${before.height} -> stored ${after.width}x${after.height})`,
      Math.abs(storedAspect - inkAspect) / inkAspect < 0.05,
      `aspect ${storedAspect.toFixed(2)} vs ink ${inkAspect.toFixed(2)}`
    )

    const r = rendered(after.width || 1, after.height || 1)
    // THE POINT OF THE WHOLE EXERCISE: every shape has to end up with real
    // presence in the header. A mark under 40px on its long edge is the
    // "doesn't look great" case, whatever its shape.
    check(
      `${label}: renders ${r.w}x${r.h}, long edge ${Math.max(r.w, r.h)}px`,
      Math.max(r.w, r.h) >= 40,
      'too small to read as a logo'
    )
    // And it must fit — a logo taller than the row pushes the header open.
    check(`${label}: inside the box`, r.w <= MAX_W && r.h <= MAX_H, JSON.stringify(r))
  }

  console.log('\n--- what the fixed-height box did to the same shapes ---')
  // The old rule for comparison: a 240x52 box, always, whatever is in it.
  for (const [label, inkW, inkH] of [
    ['square badge', 400, 400],
    ['circular badge', 400, 400],
    ['wide wordmark', 1000, 200],
  ] as Array<[string, number, number]>) {
    const scale = Math.min(240 / inkW, 52 / inkH)
    const drawn = Math.round(inkW * scale)
    const wasted = 240 - drawn
    console.log(
      `     ${label.padEnd(16)} drew ${drawn}px wide in a 240px box -> ${wasted}px of empty box`
    )
  }

  console.log('\n--- MAG Mobile, the file that prompted this ---')
  const magPath = '/tmp/mag-logo.png'
  if (!existsSync(magPath)) {
    console.log('     (no local copy at /tmp/mag-logo.png — skipped)')
  } else {
    const file = readFileSync(magPath)
    const before = await sharp(file).metadata()
    const made = await logoPngFrom(file)
    if (!made.ok) {
      check('MAG: stored', false, made.error)
    } else {
      const after = await sharp(made.png).metadata()
      const wasInk = rendered(before.width || 1, before.height || 1)
      const nowInk = rendered(after.width || 1, after.height || 1)
      console.log(`     file ${before.width}x${before.height} -> stored ${after.width}x${after.height}`)
      check(
        `MAG: the stored file is mostly ink now`,
        (after.width || 0) < (before.width || 0) && (after.height || 0) < (before.height || 0),
        'nothing was trimmed'
      )
      // Before, the ink inside the rendered box was a fraction of it; now the
      // rendered box IS the ink.
      check(
        `MAG: renders ${nowInk.w}x${nowInk.h} instead of ${wasInk.w}x${wasInk.h} of mostly-empty box`,
        nowInk.w > wasInk.w,
        `${JSON.stringify(nowInk)} vs ${JSON.stringify(wasInk)}`
      )
      check('MAG: long edge is readable', Math.max(nowInk.w, nowInk.h) >= 40, JSON.stringify(nowInk))
    }
  }

  console.log('\n--- the trim must not eat a logo it cannot understand ---')
  {
    // A file that is ALL one colour has no border to find. trim() can reduce
    // it to a sliver, and a sliver stretched into the header is worse than
    // the padding.
    const flat = await sharp({
      create: { width: 400, height: 200, channels: 4, background: { r: 20, g: 90, b: 160, alpha: 1 } },
    })
      .png()
      .toBuffer()
    const made = await logoPngFrom(flat)
    check('a single-colour file survives', made.ok)
    if (made.ok) {
      const m = await sharp(made.png).metadata()
      const aspect = (m.width || 1) / (m.height || 1)
      check(
        `it is not reduced to a sliver (${m.width}x${m.height})`,
        aspect > 0.5 && aspect < 8,
        `aspect ${aspect.toFixed(2)}`
      )
    }
  }
  {
    // A photographic logo: no flat border at all, nothing to trim.
    const noisy = await sharp({
      create: {
        width: 500,
        height: 300,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer()
    const made = await logoPngFrom(noisy)
    check('a photographic logo survives', made.ok)
    if (made.ok) {
      const m = await sharp(made.png).metadata()
      check(
        `and keeps its shape (${m.width}x${m.height}, want ~5:3)`,
        Math.abs((m.width || 1) / (m.height || 1) - 5 / 3) < 0.2
      )
    }
  }

  console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
  process.exit(bad === 0 ? 0 : 1)
}

main()
