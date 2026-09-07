/**
 * A client's brand colour, made safe to put text on and next to.
 *
 * WHY THIS EXISTS. `Client.primaryColor` is a free text column an operator
 * types, and the portal is themed with it — so the shell was handing the same
 * raw hex to three different jobs: the fill behind white text, the colour OF
 * text on white, and a pale wash. One value cannot do all three. A navy shop
 * looked fine and a yellow one had unreadable links and an invisible wash,
 * and nothing in the code acknowledged the difference.
 *
 * Every function here is pure and takes a hex, so the contrast rules can be
 * checked without a browser — see scripts/check-brand-color.ts.
 */

/** Used when primaryColor is missing or not a colour at all. */
const DEFAULT = '#1e40af'

/** Anything an operator can type, reduced to #rrggbb — or the default. */
export function normalizeHex(input: string | null | undefined): string {
  const value = (input ?? '').trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toLowerCase()
  }
  return DEFAULT
}

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('')}`

/**
 * Text that reads ON the solid brand — white or near-black, whichever wins.
 *
 * Hardcoding `text-white` is why a yellow shop's hero banner was white on
 * yellow. Picking the better of the two is never worse than 4.5:1 for any hue.
 */
export function onBrand(hex: string): string {
  return contrast(hex, '#ffffff') >= contrast(hex, '#111827') ? '#ffffff' : '#111827'
}

/**
 * The brand darkened along its own hue until it can be read on white.
 *
 * Darkening rather than substituting keeps the shop's colour recognisable —
 * a yellow shop gets a dark gold, not a generic blue — while making it legal
 * as text. A navy is already dark enough and comes back unchanged.
 */
export function readableInk(hex: string, target = 4.8): string {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  // Bounded: a loop that cannot terminate on a pathological input is worse
  // than one that gives up at black.
  for (let i = 0; i < 40 && contrast(toHex(r, g, b), '#ffffff') < target; i++) {
    r *= 0.92
    g *= 0.92
    b *= 0.92
  }
  return toHex(r, g, b)
}

/**
 * The full set of CSS variables the portal shell sets.
 *
 * The tints are mixed from the INK, not the brand. A 12% wash of #ffd400 over
 * white is invisible; a 12% wash of its ink is a warm sand. The hue survives
 * and the visibility stops depending on it.
 */
export function brandVariables(primaryColor: string | null | undefined) {
  const brand = normalizeHex(primaryColor)
  const ink = readableInk(brand)
  return {
    '--brand': brand,
    /** Text and icons ON the solid brand. */
    '--brand-on': onBrand(brand),
    /** Brand-coloured text on white. Contrast-checked. */
    '--brand-ink': ink,
    '--brand-soft': `${brand}14`,
    /** Card background for the one emphasised tile. */
    '--brand-wash': `${ink}0f`,
    '--brand-edge': `${ink}33`,
    '--brand-chip': `${ink}1f`,
    '--brand-glow': `${ink}59`,
  } as Record<string, string>
}
