/**
 * What an SMS actually costs, and how to stop paying double for punctuation.
 *
 * Carriers bill per SEGMENT, not per message, and the segment size depends on
 * the encoding:
 *
 * - **GSM-7** — 160 characters in a single message, 153 each once it splits.
 * - **UCS-2** — 70 characters, 67 once it splits. This is what a message gets
 *   the moment it contains ONE character outside the GSM-7 alphabet.
 *
 * That cliff is the whole point of this module. A lead alert reading
 * "New lead — Shop / Jane 7145550142 / Windshield · 2019 Outback" is 96
 * characters: one GSM-7 segment, or TWO UCS-2 segments. The em dash and the
 * middle dot — both of which this codebase's prose style uses everywhere —
 * were doubling the bill on every single lead alert, while the comment above
 * the body builder claimed it was kept to one segment.
 *
 * So the body is normalised to GSM-7 before it is sent, and measured in
 * segments rather than characters. Anything that cannot be mapped is dropped
 * rather than allowed through: one stray emoji in a shop name is not worth
 * doubling every alert that shop receives.
 */

/** GSM 03.38 basic set. One septet each. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

/** The extension table. Each of these costs TWO septets, not one. */
const GSM7_EXTENDED = '^{}\\[~]|€'

/**
 * Characters worth translating rather than discarding.
 *
 * All of these appear in copy written by people (or by this codebase) and all
 * have a plain equivalent that reads identically in a text message.
 */
const FOLD: Record<string, string> = {
  '—': '-',
  '–': '-',
  '−': '-',
  '·': ',',
  '•': '-',
  '’': "'",
  '‘': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '…': '...',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '\t': ' ',
  '→': '->',
  '×': 'x',
  // Stroked letters do NOT decompose under NFD — Ł is a single code point,
  // not L plus a combining mark — so the accent-stripping path below drops
  // them entirely. Spelled out here instead.
  'Ł': 'L',
  'ł': 'l',
  'Đ': 'D',
  'đ': 'd',
  'Ħ': 'H',
  'ħ': 'h',
  'Ŧ': 'T',
  'ŧ': 't',
  '½': '1/2',
  '¼': '1/4',
}

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENDED.includes(char)) return false
  }
  return true
}

/**
 * Force a string into GSM-7.
 *
 * Folds the punctuation people actually type, then drops whatever is left
 * outside the alphabet. Dropping is deliberate: a message that silently costs
 * twice as much is worse than one missing a decorative character, and the
 * caller has no way to notice the difference.
 */
export function toGsm7(text: string): string {
  let out = ''
  for (const char of text) {
    const folded = FOLD[char]
    if (folded !== undefined) {
      out += folded
      continue
    }
    if (GSM7_BASIC.includes(char) || GSM7_EXTENDED.includes(char)) {
      out += char
      continue
    }
    // Strip accents where that yields something sendable (é is in GSM-7, but
    // ć is not), before giving up on the character entirely.
    const stripped = char.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    if (stripped && isGsm7(stripped)) out += stripped
  }
  return out
}

/** Septets a GSM-7 string occupies — extension characters count double. */
function septets(text: string): number {
  let total = 0
  for (const char of text) total += GSM7_EXTENDED.includes(char) ? 2 : 1
  return total
}

/** How many segments this body will be billed as. */
export function countSegments(text: string): number {
  if (isGsm7(text)) {
    const n = septets(text)
    return n === 0 ? 0 : n <= 160 ? 1 : Math.ceil(n / 153)
  }
  // Surrogate pairs occupy two UCS-2 code units, so an emoji costs two.
  const units = [...text].reduce((sum, c) => sum + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0)
  return units <= 70 ? 1 : Math.ceil(units / 67)
}

/**
 * Build a body from parts, dropping the least important ones until it fits.
 *
 * `parts` is in priority order — the first is never dropped, because a lead
 * alert with no phone number in it is not worth sending at all. Everything
 * after it is detail the recipient would like but does not need, so it goes
 * from the end until the message fits `maxSegments`.
 */
export function fitSegments(parts: string[], maxSegments = 1, separator = '\n'): string {
  const kept = parts.filter(Boolean).map(toGsm7).filter(Boolean)
  if (kept.length === 0) return ''

  for (let end = kept.length; end > 1; end--) {
    const candidate = kept.slice(0, end).join(separator)
    if (countSegments(candidate) <= maxSegments) return candidate
  }

  // Even the first part alone may exceed the budget — a very long shop name,
  // say. Truncate rather than silently sending three segments.
  const first = kept[0]
  if (countSegments(first) <= maxSegments) return first
  const budget = maxSegments === 1 ? 160 : maxSegments * 153
  return first.slice(0, budget)
}
