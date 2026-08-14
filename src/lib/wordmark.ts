/**
 * A generated wordmark for shops with no logo of their own.
 *
 * This is deliberately NOT an invented emblem. A machine-drawn "logo" for a
 * real business is a liability: they can't put it on a van or an invoice, it
 * competes with whatever mark they already have in a drawer somewhere, and it
 * quietly asserts a brand identity nobody chose. What this builds instead is
 * their NAME, set properly — an initial badge in their brand color beside the
 * business name in the site's own typography. It's honest, it's theirs, and
 * it reads as a design decision rather than a missing image.
 *
 * The layout math lives here, apart from any renderer, because the same
 * wordmark is drawn three ways: as live HTML in the site header and footer
 * (crisp text, no image request), as a PNG for photo watermarks and download,
 * and as a square monogram for the favicon.
 */

/** Articles and conjunctions — never the mark. */
const NOISE = new Set(['the', 'a', 'an', 'of', 'and', '&'])

/**
 * Trade words. Almost every client is "<something> Auto Glass", so taking
 * the first two words' letters would give nearly all of them a second letter
 * of "A" — "CA", "AA", "SA" — and every shop on the platform would wear a
 * near-identical badge. The initials come from the DISTINCTIVE part of the
 * name only; the trade words are already all over the page.
 */
const TRADE = new Set([
  'auto',
  'autos',
  'automotive',
  'glass',
  'windshield',
  'windshields',
  'windscreen',
  'repair',
  'repairs',
  'replacement',
  'service',
  'services',
  'mobile',
  'tint',
  'tinting',
  'calibration',
  'company',
  'co',
  'inc',
  'llc',
  'ltd',
])

export interface WordmarkParts {
  /** 1–2 letters for the badge. */
  initials: string
  /** The name as drawn beside the badge. */
  name: string
  /** Rough width class, so renderers can pick a type size without measuring. */
  length: 'short' | 'medium' | 'long'
}

/**
 * Split a business name into badge initials and display name.
 *
 * Initials come from the first two SIGNIFICANT words, so "The A1 Windshield
 * Repair" gives "A1" — not "TA", and not "T". A single-word name gives one
 * letter; a name that starts with a number keeps it, because "A1" and "5
 * Star" are names people actually trade under.
 */
export function wordmarkParts(businessName: string): WordmarkParts {
  const name = businessName.trim().replace(/\s+/g, ' ')
  const words = name
    .split(' ')
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  const meaningful = words.filter((w) => !NOISE.has(w.toLowerCase()))
  const distinctive = meaningful.filter((w) => !TRADE.has(w.toLowerCase()))
  // A shop literally named "Auto Glass Repair" has no distinctive word; fall
  // back rather than render a "?" for a perfectly real name.
  const source = distinctive.length ? distinctive : meaningful.length ? meaningful : words

  let initials = ''
  if (source.length === 0) {
    initials = '?'
  } else if (/^[\p{L}]\p{N}/u.test(source[0])) {
    // "A1", "K2" — the letter+digit IS the mark; splitting it loses the name.
    initials = source[0].slice(0, 2).toUpperCase()
  } else if (source[0].length >= 2 && source[0] === source[0].toUpperCase()) {
    // An acronym first word ("ABC Auto Glass") is the mark on its own.
    initials = source[0].slice(0, 2).toUpperCase()
  } else if (source.length === 1) {
    initials = source[0].charAt(0).toUpperCase()
  } else {
    initials = (source[0].charAt(0) + source[1].charAt(0)).toUpperCase()
  }

  const length = name.length <= 14 ? 'short' : name.length <= 24 ? 'medium' : 'long'
  return { initials, name, length }
}

/**
 * Type size for the name, in px, at a given badge size. Long names step down
 * so a three-word shop doesn't wrap or overflow the header row.
 */
export function wordmarkNameSize(length: WordmarkParts['length'], badgePx: number): number {
  const ratio = length === 'short' ? 0.5 : length === 'medium' ? 0.44 : 0.38
  return Math.round(badgePx * ratio)
}
