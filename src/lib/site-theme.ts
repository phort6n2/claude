/**
 * Brand-derived palette for hosted client sites, modeled on the
 * landing-template design system: every surface, line, and band on the page
 * is the client's primary color mixed toward white or near-black at fixed
 * ratios, so the whole site reads as that brand without any hand-tuning.
 * The ratios were sampled from the reference build (collisionglass.co,
 * brand #A81818 → surfaces #FDF7F7/#FAF0F0, dark band #201414, etc.).
 */

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Mix `t` of color b into color a (t=0 → a, t=1 → b). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function lightness(c: Rgb): number {
  return (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 510
}

/** Set HSL lightness while keeping hue/saturation. */
function withLightness(c: Rgb, l: number): Rgb {
  const max = Math.max(c.r, c.g, c.b) / 255
  const min = Math.min(c.r, c.g, c.b) / 255
  const curL = (max + min) / 2
  const d = max - min
  if (d === 0) return { r: l * 255, g: l * 255, b: l * 255 }
  const s = d / (1 - Math.abs(2 * curL - 1))
  const r = c.r / 255
  const g = c.g / 255
  const bb = c.b / 255
  let h = 0
  if (max === r) h = ((g - bb) / d) % 6
  else if (max === g) h = (bb - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  const c2 = (1 - Math.abs(2 * l - 1)) * s
  const x = c2 * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c2 / 2
  let rgb: [number, number, number]
  if (h < 60) rgb = [c2, x, 0]
  else if (h < 120) rgb = [x, c2, 0]
  else if (h < 180) rgb = [0, c2, x]
  else if (h < 240) rgb = [0, x, c2]
  else if (h < 300) rgb = [x, 0, c2]
  else rgb = [c2, 0, x]
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 }
}

function hslOf(c: Rgb): { h: number; s: number; l: number } {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 }
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

/** WCAG relative luminance, for choosing text that can be read on a fill. */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/**
 * Black or white, whichever can be read on this fill.
 *
 * The template assumed white text on every button because the brand was
 * always a deep colour. A yellow button with white text is unreadable, and a
 * yellow button is exactly what a black-and-yellow shop should have.
 */
function readableOn(c: Rgb): Rgb {
  return luminance(c) > 0.4 ? BLACK : WHITE
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The CTA colour used as TEXT on a white surface, or near-black when it
 * cannot be read there.
 *
 * The header's phone button is white with the brand colour as its text — at
 * 5:1 for a deep red that is the brand doing its job, and at 1.17:1 for a
 * yellow it is an invisible phone number in a sticky header, on the highest
 * value action this trade has. The border stays the brand colour either way,
 * so the button still reads as theirs.
 */
function ctaOnLight(cta: Rgb, fallback: Rgb): Rgb {
  return contrast(cta, WHITE) >= 4.5 ? cta : fallback
}

export const SITE_THEME_DEFAULT_PRIMARY = '#1e40af'
export const SITE_THEME_DEFAULT_ACCENT = '#f59e0b'

/**
 * CSS custom properties for a client site. Spread onto the page root's
 * `style` so Tailwind arbitrary values (`bg-[var(--s1)]`) resolve per client.
 */
export function sitePaletteVars(
  primaryColor: string | null,
  accentColor: string | null
): Record<string, string> {
  const brand = parseHex(primaryColor || '') || parseHex(SITE_THEME_DEFAULT_PRIMARY)!
  const accent = parseHex(accentColor || '') || parseHex(SITE_THEME_DEFAULT_ACCENT)!

  const brandHsl = hslOf(brand)
  const accentHsl = hslOf(accent)

  /**
   * A BRAND WITH NO COLOUR IN IT HANDS ITS JOB TO THE ACCENT.
   *
   * Every derived tint here is the brand's own hue, so a black, white or
   * charcoal brand derives a site with no colour anywhere: black buttons,
   * grey eyebrows, grey icons. That is correct for the tints — a grey line
   * should stay grey — and wrong for the two or three places a brand is
   * supposed to be recognisable. An auto glass shop whose whole identity is
   * black and yellow got a black-and-grey site and one 9% wash of yellow.
   *
   * So when the brand is neutral and the accent is not, the accent carries
   * the colour: the call-to-action fill, the eyebrow and icon colour on dark
   * bands, and the phone links. Deliberately NOT anything on a light
   * background — a mid-tone accent as body text or a link on white is the
   * one way this makes a site less readable rather than more branded.
   *
   * A saturated brand is untouched: `useAccent` is false and every value
   * below is what it was.
   */
  const brandIsNeutral = brandHsl.s < 0.12
  const accentUsable = accentHsl.s > 0.25
  const useAccent = brandIsNeutral && accentUsable

  // Buttons carry white text, so a light brand color is darkened until the
  // pair holds up — the template's "darkened until white text passes AA" rule.
  // An accent CTA keeps its own colour and takes readable text instead: the
  // point of a yellow button is that it is yellow.
  const cta = useAccent
    ? accent
    : lightness(brand) > 0.45
      ? withLightness(brand, 0.38)
      : brand

  // Tinted grays (lines, muted text, dark-band text) carry only the brand's
  // HUE at a low fixed saturation — mixing the fully saturated brand reads
  // pink/garish as the base lightens. S/L pairs are sampled from the
  // reference build; saturation scales down for weakly saturated brands.
  const satScale = Math.min(1, brandHsl.s / 0.75)
  const hueTint = (l: number, s: number) => fromHsl(brandHsl.h, s * satScale, l)

  // On a dark band the accent has to be light enough to read. Lifted rather
  // than rejected: a deep accent is still the shop's colour, it just cannot
  // be printed at that lightness on near-black.
  const accentOnDark = accentHsl.l < 0.55 ? withLightness(accent, 0.62) : accent

  // The warm accent band only works with a warm accent; a cool or red accent
  // would collapse into the other tints, so fall back to the reference sand.
  const warmOk = accentHsl.h >= 20 && accentHsl.h <= 60 && accentHsl.s > 0.2
  const tintWarm = warmOk ? mix(WHITE, accent, 0.09) : parseHex('#FBF3EC')!

  const vars: Record<string, [Rgb, Rgb, number] | Rgb> = {
    '--paper': WHITE,
    '--s1': [WHITE, brand, 0.035],
    '--s2': [WHITE, brand, 0.065],
    '--tint': [WHITE, brand, 0.105],
    '--tint-warm': tintWarm,
    '--dark': [{ r: 20, g: 20, b: 20 }, brand, 0.08],
    '--dark-2': [{ r: 13, g: 13, b: 13 }, brand, 0.05],
    '--dark-3': hueTint(0.16, 0.245),
    '--tx': [{ r: 18, g: 18, b: 18 }, brand, 0.055],
    '--tx2': [{ r: 46, g: 46, b: 46 }, brand, 0.12],
    '--tx-muted': hueTint(0.33, 0.11),
    '--on-dark-2': hueTint(0.82, 0.17),
    '--line': hueTint(0.91, 0.29),
    '--line-card': hueTint(0.85, 0.24),
    '--line-strong': hueTint(0.73, 0.15),
    '--line-on-dark': hueTint(0.21, 0.21),
    '--brand': brand,
    '--brand-deep': [brand, BLACK, 0.17],
    '--cta': cta,
    '--cta-b': [cta, BLACK, 0.17],
    '--cta-active': [cta, BLACK, 0.35],
    // Light brand accent for dark bands. Hue-tinted like the other derived
    // tints (full-saturation lightening reads neon); L/S chosen so 13px bold
    // eyebrow text clears 4.5:1 on --dark-3.
    '--brand-light': useAccent ? accentOnDark : hueTint(0.72, 0.5),
    // The icon tiles in the card grids. On a saturated brand this is exactly
    // --tint and nothing changes; on a neutral one it is the only colour in
    // the whole light half of the page, which was six grey tiles with black
    // glyphs — the single largest "any shop" signal on the site. A FILL only:
    // the glyph on top stays dark, because a mid-tone accent as a glyph on
    // white is the unreadable case this file exists to avoid.
    '--tint-accent': useAccent
      ? mix(WHITE, accent, 0.3)
      : ([WHITE, brand, 0.105] as [Rgb, Rgb, number]),
    '--accent': accent,
    '--on-accent': readableOn(accent),
    '--on-cta': readableOn(cta),
    '--cta-on-light': ctaOnLight(cta, mix({ r: 18, g: 18, b: 18 }, brand, 0.055)),
    '--brand-pale': [WHITE, brand, 0.18],
  }

  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(vars)) {
    out[key] = toHex(Array.isArray(val) ? mix(val[0], val[1], val[2]) : val)
  }
  // Fixed colors: star gold (fill + stroke so stars are not color-only),
  // success green for checkmarks — same on every brand, per the template.
  out['--gold'] = '#F5A524'
  out['--gold-stroke'] = '#A15C06'
  // The shop's own accent when it has one that reads on dark; otherwise the
  // template's gold. These are the phone links in the top bar and the footer,
  // which is the most-looked-at coloured thing on the page.
  out['--gold-on-dark'] = useAccent ? toHex(accentOnDark) : '#FFC53D'
  out['--success'] = '#0F7A3D'
  out['--on-dark'] = '#FFFFFF'
  // Focus ring color and the brand-tinted CTA shadow, per the reference.
  out['--ring'] = out['--tx']
  const ctaRgb = `${Math.round(cta.r)},${Math.round(cta.g)},${Math.round(cta.b)}`
  out['--sh-cta'] = `0 1px 1px rgba(0,0,0,.18), 0 6px 14px -4px rgba(${ctaRgb},.34)`
  return out
}

/**
 * The button colour a widget should use, by the same rule the site uses.
 *
 * The embeddable form built its button from primaryColor, so a black-and-
 * yellow shop got a black button under a yellow page. Same input, same
 * decision, one place: whatever the site paints its call-to-action, the
 * widget paints its submit.
 */
export function widgetCtaColors(
  primaryColor: string | null,
  accentColor: string | null
): { ctaColor: string; ctaTextColor: string } {
  const vars = sitePaletteVars(primaryColor, accentColor)
  return { ctaColor: vars['--cta'], ctaTextColor: vars['--on-cta'] }
}
