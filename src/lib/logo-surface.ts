/**
 * WHICH BACKGROUND A LOGO WAS DRAWN FOR, and so what colour the header is.
 *
 * The header was white for every shop, and a logo is drawn for one background
 * or the other. Most are dark ink and read on white. EliteProGlass's is white
 * lettering with a red "PRO" on transparency — made for a dark background —
 * and on the white header the only thing a visitor saw was "PRO", floating on
 * its own, as the first impression of every paid click. Nothing went red for
 * it: the file was valid, the markup was valid, the page rendered, and the
 * only symptom was a shop with no name at the top of its own site.
 *
 * So the logo is MEASURED when it is saved, from its pixels, and the header
 * follows it. The operator can override on the Website tab's logo card; the
 * measurement is what happens when nobody has thought about it, which for
 * fifteen shops is the normal case.
 *
 * Pure: no sharp and no Prisma here, because the site template reads
 * `headerIsDark` and must not pull an image library into every page render
 * (see "anything image-shaped must be optional" in CLAUDE.md). The pixel
 * reading lives in `logo-surface-measure.ts`.
 */

export type LogoSurface = 'light' | 'dark'
/** The operator's choice on the logo card. null = follow the logo. */
export type HeaderTheme = 'light' | 'dark' | null

/**
 * Below this contrast against a background, ink is not really there: white
 * on white is 1.0, a pale yellow on white about 1.3, #ddd on white 1.36. A
 * logo is shapes rather than body text, so the bar is VISIBILITY, not the
 * 4.5:1 reading standard — a mid-grey mark is perfectly legible as a logo.
 */
export const VISIBLE_CONTRAST = 1.6

/**
 * A transparent logo is judged DARK-ONLY when under half of its ink shows on
 * white AND at least this much shows on dark.
 *
 * Both halves matter, and the second one is what keeps fourteen shops' headers
 * exactly as they were. A logo that reads on BOTH — a mid-blue wordmark, white
 * letters inside a red badge, white fill with a black outline — stays on
 * white: it works there, and a header nobody asked to change is not an
 * improvement. Only a logo that genuinely vanishes on white moves.
 */
export const MAX_SHARE_ON_LIGHT = 0.5
export const MIN_SHARE_ON_DARK = 0.8

/**
 * An OPAQUE logo carries its own background. When its edge is dark — a logo
 * exported on a black or navy rectangle — a white header draws a dark box in
 * a white bar, and a dark header lets the box disappear into it, which is how
 * that file was meant to be seen. Nearly all of the edge has to agree: a
 * photographic or gradient logo with a few dark edge pixels stays on white.
 */
export const MIN_DARK_EDGE_SHARE = 0.9
const DARK_EDGE_CONTRAST = 3

/** The site's `--dark` without a brand tint: close enough to judge against. */
const DARK_REFERENCE_LUMINANCE = relLuminance(20, 20, 20)

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastOf(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

export interface SurfaceReading {
  surface: LogoSurface
  /** Whether the verdict came from transparent ink or an opaque file's edge. */
  basis: 'ink' | 'edge'
  /** Share of the visible ink that shows on white / on the dark band. */
  onLight: number
  onDark: number
}

/**
 * Read a decoded RGBA image. `data` is width × height × 4 bytes.
 *
 * Returns null when there is too little to judge (an empty or near-empty
 * file): no verdict means the white header, which is what every site had.
 */
export function surfaceFromPixels(
  data: Uint8Array,
  width: number,
  height: number
): SurfaceReading | null {
  const total = width * height
  if (!total || data.length < total * 4) return null

  let seeThrough = 0
  for (let i = 3; i < total * 4; i += 4) if (data[i] < 128) seeThrough++
  // An alpha CHANNEL is not transparency (see footer-logo.ts): plenty of PNGs
  // carry a fully opaque one. Only real see-through area makes the ink the
  // thing to judge.
  const transparent = seeThrough / total >= 0.02

  if (transparent) {
    let visible = 0
    let onLight = 0
    let onDark = 0
    for (let p = 0; p < total; p++) {
      const i = p * 4
      if (data[i + 3] < 128) continue
      visible++
      const l = relLuminance(data[i], data[i + 1], data[i + 2])
      if (contrastOf(l, 1) >= VISIBLE_CONTRAST) onLight++
      if (contrastOf(l, DARK_REFERENCE_LUMINANCE) >= VISIBLE_CONTRAST) onDark++
    }
    if (visible < 20) return null
    const light = onLight / visible
    const dark = onDark / visible
    return {
      surface: light < MAX_SHARE_ON_LIGHT && dark >= MIN_SHARE_ON_DARK ? 'dark' : 'light',
      basis: 'ink',
      onLight: light,
      onDark: dark,
    }
  }

  // Opaque: the outermost two pixels all round are the file's own background.
  let edge = 0
  let darkEdge = 0
  const ring = Math.min(2, Math.floor(Math.min(width, height) / 2))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue
      const i = (y * width + x) * 4
      edge++
      const l = relLuminance(data[i], data[i + 1], data[i + 2])
      if (contrastOf(l, 1) >= DARK_EDGE_CONTRAST) darkEdge++
    }
  }
  if (!edge) return null
  const share = darkEdge / edge
  return {
    surface: share >= MIN_DARK_EDGE_SHARE ? 'dark' : 'light',
    basis: 'edge',
    onLight: 1 - share,
    onDark: share,
  }
}

/**
 * The one question the template asks. Every site page reads it through here,
 * so the header, its scroll shadow and the logo card's preview cannot
 * disagree about which background a shop has.
 *
 * A measurement only counts for the file it was taken from
 * (`logoSurfaceUrl === logoUrl`). Several paths write `logoUrl` — the card,
 * the importer, the mirroring and re-tidy maintenance — and a verdict about
 * the previous file applied to a new one is how a dark-ink logo would end up
 * on a dark header. A stale reading is no reading: the white header, until
 * the logo is measured again (every save, and the daily sweep).
 */
export function headerIsDark(client: {
  logoUrl: string | null
  logoSurface: string | null
  logoSurfaceUrl: string | null
  headerTheme: string | null
}): boolean {
  if (client.headerTheme === 'dark') return true
  if (client.headerTheme === 'light') return false
  return (
    !!client.logoUrl &&
    client.logoSurfaceUrl === client.logoUrl &&
    client.logoSurface === 'dark'
  )
}

export function headerThemeFrom(value: unknown): HeaderTheme | undefined {
  if (value === 'light' || value === 'dark') return value
  if (value === null || value === 'auto' || value === '') return null
  return undefined
}
