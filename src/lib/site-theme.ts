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

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

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

  // Buttons carry white text, so a light brand color is darkened until the
  // pair holds up — the template's "darkened until white text passes AA" rule.
  const cta = lightness(brand) > 0.45 ? withLightness(brand, 0.38) : brand

  const vars: Record<string, [Rgb, Rgb, number] | Rgb> = {
    '--paper': WHITE,
    '--s1': [WHITE, brand, 0.035],
    '--s2': [WHITE, brand, 0.065],
    '--tint': [WHITE, brand, 0.105],
    '--tint-warm': [WHITE, accent, 0.09],
    '--dark': [{ r: 20, g: 20, b: 20 }, brand, 0.08],
    '--dark-2': [{ r: 13, g: 13, b: 13 }, brand, 0.05],
    '--dark-3': [{ r: 28, g: 28, b: 28 }, brand, 0.17],
    '--tx': [{ r: 18, g: 18, b: 18 }, brand, 0.055],
    '--tx2': [{ r: 46, g: 46, b: 46 }, brand, 0.12],
    '--tx-muted': [{ r: 74, g: 74, b: 74 }, brand, 0.19],
    '--on-dark-2': [{ r: 206, g: 206, b: 206 }, brand, 0.1],
    '--line': [WHITE, brand, 0.125],
    '--line-card': [WHITE, brand, 0.2],
    '--line-strong': [WHITE, brand, 0.35],
    '--line-on-dark': [{ r: 40, g: 40, b: 40 }, brand, 0.25],
    '--brand': brand,
    '--brand-deep': [brand, BLACK, 0.17],
    '--cta': cta,
    '--cta-b': [cta, BLACK, 0.17],
    '--cta-active': [cta, BLACK, 0.35],
    '--brand-light': withLightness(brand, 0.62),
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
  out['--gold-on-dark'] = '#FFC53D'
  out['--success'] = '#0F7A3D'
  out['--on-dark'] = '#FFFFFF'
  return out
}
