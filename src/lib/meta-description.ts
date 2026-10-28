/**
 * Meta descriptions for the hosted sites. Import-free, so the check script can
 * run every page type's description without a database.
 *
 * THE BUDGET IS 155 CHARACTERS, and what is cut is decided, not truncated.
 * Google shows roughly that much on a phone and ellipses the rest, so the
 * descriptions were being cut wherever the screen ran out — most of them ran
 * 160–180, and the phone number at the end was the part that went. So a
 * description is a LEAD (the service and the city, always kept) followed by
 * sentences in priority order, each one included only if the whole still fits;
 * one that does not fit is skipped and the next, shorter, one is still tried.
 *
 * Every sentence is a stored fact or absent: the network comes from
 * `networkHighlight` (the badge's own gate), the rating from the live Business
 * Profile feed, mobile from its flag. NO WARRANTY in a template — a named
 * warranty must state its terms (§2), and a description cannot; a shop's own
 * typed description may name it. NO timing promise ("fast", "same day").
 */

export const META_DESCRIPTION_MAX = 155

/** "a" or "an" for the word that follows, by how it is SAID: an ICBC, an SGI, an MPI, a Manitoba. */
export function indefiniteArticle(word: string): 'a' | 'an' {
  const w = word.trim()
  if (!w) return 'a'
  // An acronym is read letter by letter: F, H, L, M, N, R, S, X start with a vowel sound.
  if (/^[A-Z]{2,}\b/.test(w)) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a'
  return /^[aeiou]/i.test(w) ? 'an' : 'a'
}

const sentence = (s: string) => {
  const t = s.trim()
  return /[.?!]$/.test(t) ? t : `${t}.`
}

/**
 * Lead first, then each optional sentence in order while the total fits.
 * The lead is never dropped; if it alone is over budget it is cut at a word.
 */
export function composeDescription(lead: string, optional: Array<string | null | undefined | false>, max = META_DESCRIPTION_MAX): string {
  let out = sentence(lead)
  if (out.length > max) {
    const cut = out.slice(0, max - 1)
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[,;:—–-]+$/, '')}…`
  }
  for (const part of optional) {
    if (!part) continue
    const next = `${out} ${sentence(part)}`
    if (next.length <= max) out = next
  }
  return out
}

export interface DescriptionFacts {
  /** `networkHighlight(...)?.label`, e.g. "ICBC Repair Network". Null when not ticked or not confirmed. */
  networkLabel: string | null
  mobile: boolean
  /** The live feed's rating; null or empty → no rating sentence. */
  rating: { rating: number; reviewCount: number } | null
  /** The DISPLAY number (tracked), as written. */
  phone: string
}

/**
 * The differentiators, strongest first: the network, then mobile, then the
 * live rating, then "Free quotes." and the number. `skipMobile` for a lead that
 * already says it (the mobile page, a "Mobile windshield…" city lead).
 */
export function differentiators(f: DescriptionFacts, opts: { skipMobile?: boolean } = {}): string[] {
  return [
    f.networkLabel ? `${f.networkLabel} shop` : '',
    f.mobile && !opts.skipMobile ? 'Mobile service to your home or work' : '',
    f.rating && f.rating.reviewCount > 0 && f.rating.rating > 0 ? `${f.rating.rating.toFixed(1)} stars on Google` : '',
    'Free quotes',
    f.phone ? `Call ${f.phone}` : '',
  ].filter(Boolean)
}

/** Service, city and differentiators — the shape every page type uses. */
export function siteDescription(lead: string, f: DescriptionFacts, extra: string[] = []): string {
  const skipMobile = /\bmobile\b/i.test(lead)
  const [first, ...rest] = differentiators(f, { skipMobile })
  return composeDescription(lead, [first, ...extra, ...rest])
}
