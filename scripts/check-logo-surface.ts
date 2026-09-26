/**
 * Does the header follow the logo — and ONLY when it has to?
 *
 * Run: npx tsx scripts/check-logo-surface.ts
 *
 * Both failures are silent. Too lenient and a shop whose logo is white
 * lettering keeps a header that shows nothing (EliteProGlass: a lone red
 * "PRO" floating on white). Too eager and a shop whose logo reads perfectly
 * well on white gets a dark header nobody asked for, on fourteen sites that
 * looked right yesterday. The stay-white cases come first.
 *
 * The images are drawn here as raw pixels and run through the REAL decoder
 * (sharp, via readLogoSurface), so what is tested is what production runs.
 */

import sharp from 'sharp'
import { readLogoSurface } from '../src/lib/logo-surface-measure'
import { headerIsDark, headerThemeFrom } from '../src/lib/logo-surface'
import { sitePaletteVars } from '../src/lib/site-theme'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

type Rgba = [number, number, number, number]
const CLEAR: Rgba = [0, 0, 0, 0]
const WHITE: Rgba = [255, 255, 255, 255]
const BLACK: Rgba = [17, 17, 17, 255]
const RED: Rgba = [220, 38, 38, 255]
const BLUE: Rgba = [30, 64, 175, 255]
const PALE: Rgba = [255, 236, 150, 255]
const NAVY: Rgba = [12, 22, 48, 255]

/** A 240×80 canvas with rectangles painted on it, as a PNG. */
async function draw(bg: Rgba, shapes: Array<{ x: number; y: number; w: number; h: number; c: Rgba }>) {
  const W = 240
  const H = 80
  const px = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) px.set(bg, i * 4)
  for (const s of shapes) {
    for (let y = s.y; y < s.y + s.h; y++) {
      for (let x = s.x; x < s.x + s.w; x++) px.set(s.c, (y * W + x) * 4)
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

/** Five "letters" in one colour. */
const letters = (c: Rgba, from = 10, count = 5) =>
  Array.from({ length: count }, (_, i) => ({ x: from + i * 44, y: 16, w: 32, h: 48, c }))

async function expect(label: string, file: Buffer, want: 'light' | 'dark') {
  const r = await readLogoSurface(file)
  const got = r?.surface ?? 'light'
  const detail = r ? ` (on white ${Math.round(r.onLight * 100)}%, on dark ${Math.round(r.onDark * 100)}%)` : ''
  if (got === want) pass(`${label} → ${want} header${detail}`)
  else fail(`${label} → ${got} header, wanted ${want}${detail}`)
}

async function main() {
  console.log('\nSTAYS WHITE: a logo that reads on white keeps the header it has')
  await expect('black wordmark on transparency', await draw(CLEAR, letters(BLACK)), 'light')
  await expect('mid-blue wordmark (reads on both)', await draw(CLEAR, letters(BLUE)), 'light')
  await expect('red wordmark (reads on both)', await draw(CLEAR, letters(RED)), 'light')
  await expect(
    'white letters inside a red badge',
    await draw(CLEAR, [{ x: 4, y: 4, w: 232, h: 72, c: RED }, ...letters(WHITE)]),
    'light'
  )
  await expect(
    'white fill with a thick black outline',
    await draw(
      CLEAR,
      letters(BLACK).flatMap((l) => [l, { x: l.x + 8, y: l.y + 8, w: l.w - 16, h: l.h - 16, c: WHITE }])
    ),
    'light'
  )
  await expect('opaque logo on a white box', await draw(WHITE, letters(BLUE)), 'light')
  await expect(
    'opaque logo with only one dark edge (a photo, a gradient)',
    await draw(WHITE, [{ x: 0, y: 0, w: 240, h: 10, c: NAVY }, ...letters(BLUE)]),
    'light'
  )
  await expect('an empty file', await draw(CLEAR, []), 'light')

  console.log('\nGOES DARK: a logo that vanishes on white')
  await expect('white wordmark on transparency', await draw(CLEAR, letters(WHITE)), 'dark')
  await expect(
    'EliteProGlass shape: white "ELITE GLASS" + red "PRO"',
    await draw(CLEAR, [...letters(WHITE, 10, 4), { x: 186, y: 16, w: 44, h: 48, c: RED }]),
    'dark'
  )
  await expect('pale yellow wordmark', await draw(CLEAR, letters(PALE)), 'dark')
  await expect('opaque logo exported on a navy rectangle', await draw(NAVY, letters(WHITE)), 'dark')

  console.log('\nTHE READING COUNTS ONLY FOR THE FILE IT WAS TAKEN FROM')
  const base = { logoUrl: 'https://x/a.png', logoSurface: 'dark', logoSurfaceUrl: 'https://x/a.png', headerTheme: null }
  if (headerIsDark(base)) pass('measured dark for this file → dark header')
  else fail('a measured dark logo kept the white header')
  if (!headerIsDark({ ...base, logoUrl: 'https://x/b.png' })) {
    pass('a new logo with the old file\'s reading → white until measured')
  } else fail('the previous logo\'s reading coloured the header for a new file')
  if (!headerIsDark({ ...base, logoUrl: null })) pass('no logo → white (the wordmark is drawn for white)')
  else fail('a shop with no logo got a dark header from a stale reading')
  if (!headerIsDark({ ...base, logoSurface: 'light' })) pass('measured light → white')
  else fail('a light reading gave a dark header')

  console.log('\nTHE OPERATOR WINS, both ways')
  if (!headerIsDark({ ...base, headerTheme: 'light' })) pass('"White" overrides a dark reading')
  else fail('the White override was ignored')
  if (headerIsDark({ ...base, logoSurface: 'light', headerTheme: 'dark' })) pass('"Dark" overrides a light reading')
  else fail('the Dark override was ignored')
  if (headerIsDark({ ...base, logoUrl: null, headerTheme: 'dark' })) pass('"Dark" holds with no logo at all')
  else fail('the Dark override needs a logo')
  const parsed = ['auto', '', null, 'light', 'dark', 'purple'].map((v) => headerThemeFrom(v))
  if (JSON.stringify(parsed) === JSON.stringify([null, null, null, 'light', 'dark', undefined])) {
    pass('the PATCH accepts auto/light/dark and refuses anything else')
  } else fail(`headerThemeFrom gave ${JSON.stringify(parsed)}`)

  console.log('\nTHE QUOTE BUTTON STANDS OFF A DARK HEADER, whatever the brand')
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }
  for (const [name, primary, accent] of [
    ['navy brand (the 1.44:1 case)', '#1e3a8a', null],
    ['black brand, yellow accent', '#111111', '#facc15'],
    ['red brand', '#dc2626', null],
    ['default blue', null, null],
  ] as const) {
    const v = sitePaletteVars(primary, accent)
    const fill = ratio(v['--hdr-cta'], v['--dark'])
    const text = ratio(v['--on-hdr-cta'], v['--hdr-cta'])
    if (fill >= 3 && text >= 4.5) pass(`${name}: button ${fill.toFixed(1)}:1 on the band, text ${text.toFixed(1)}:1`)
    else fail(`${name}: button ${fill.toFixed(2)}:1 on the band, text ${text.toFixed(2)}:1`)
  }

  console.log(
    failures === 0 ? '\nAll logo-surface checks passed.' : `\n${failures} logo-surface check${failures === 1 ? '' : 's'} FAILED.`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main()
