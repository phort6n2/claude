/**
 * How a lead is labelled in the lists.
 *
 * Calls frequently arrive with no contact name — HighLevel only knows the
 * number — and the lists used to fall back to a bare "Unknown", which reads
 * like something broke. Falling through name → email → phone → a friendly
 * placeholder keeps every row identifiable.
 */

export interface LeadDisplayFields {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  source?: string | null
}

/**
 * US-style phone formatting. Handles the E.164 form HighLevel sends
 * (+15035550142), which the older per-page formatters left untouched because
 * they only matched bare 10-digit strings.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
  }
  return phone
}

export function isPhoneLead(source: string | null | undefined): boolean {
  return typeof source === 'string' && source.toUpperCase() === 'PHONE'
}

/**
 * Shorten a URL to something readable in a narrow mobile row: drop the scheme,
 * the leading www, the query string (which is usually a wall of UTM tags), and
 * any trailing slash. The full URL still goes in the link href and title.
 */
export function formatUrlForDisplay(url: string | null | undefined): string {
  if (!url) return ''
  const raw = url.trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname.replace(/^www\./, '')
    const path = parsed.pathname.replace(/\/$/, '')
    return `${host}${path}`
  } catch {
    // Not a parseable URL (HighLevel sometimes sends a bare path) — show as-is.
    return raw
  }
}

/**
 * Best available label for a lead. Never returns "Unknown".
 */
export function getLeadDisplayName(lead: LeadDisplayFields): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
  if (name) return name

  // A real email is more identifying than a formatted number.
  const email = lead.email?.trim()
  if (email) return email

  const phone = formatPhoneDisplay(lead.phone)
  if (phone) return phone

  return isPhoneLead(lead.source) ? 'New Caller' : 'New Web Lead'
}

/**
 * True when the display name is just the phone number, so callers can avoid
 * printing the same number twice in a row.
 */
export function displayNameIsPhone(lead: LeadDisplayFields): boolean {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
  if (name || lead.email?.trim()) return false
  return !!formatPhoneDisplay(lead.phone)
}

/**
 * Slug vocabularies from the landing-page forms and HighLevel surveys, where a
 * generic humanisation would read awkwardly or lose meaning — "Chip Crack
 * Repair" instead of "Chip / crack repair".
 *
 * Anything not listed still gets tidied by formatFieldValue; this map is only
 * for the cases where mechanical title-casing isn't good enough.
 */
const VALUE_LABELS: Record<string, string> = {
  'chip-crack-repair': 'Chip / crack repair',
  'rock-chip-repair': 'Rock chip repair',
  'door-side-glass': 'Door / side glass',
  'side-window': 'Side window',
  'back-glass': 'Back glass',
  'adas-calibration': 'ADAS calibration',
  'not-sure': 'Not sure',
  'yes': 'Yes',
  'no': 'No',
}

/**
 * Turn a raw form value into something readable.
 *
 * Form controls submit their `value` attribute, so leads arrive carrying
 * `door-side-glass` and `not-sure` where the visitor saw "Door / Side Glass"
 * and "Not sure". Those slugs were being rendered verbatim in every lead view.
 *
 * The conservative part matters more than the pretty part: this is applied to
 * every field of every payload, which includes click identifiers, VINs, URLs
 * and template placeholders that must survive completely untouched. So it only
 * rewrites values that actually look like slugs, and returns everything else
 * exactly as it came in.
 */
export function formatFieldValue(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (!raw) return ''

  const mapped = VALUE_LABELS[raw.toLowerCase()]
  if (mapped) return mapped

  // Already prose ("2025 Kia Telluride", "State Farm") — nothing to do.
  if (/\s/.test(raw)) return raw
  // Emails and URLs must not be touched.
  if (raw.includes('@') || /^https?:\/\//i.test(raw)) return raw

  // Digit strings that are really phone numbers get the standard treatment;
  // formatPhoneDisplay returns its input unchanged for anything else, so a zip
  // code passes straight through.
  if (/^[+\d()\-.\s]+$/.test(raw)) return formatPhoneDisplay(raw)

  // "landing:collision-portland-metro" — the namespace is for machines.
  const withoutNamespace = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw

  // Only touch things shaped like a slug: lowercase WORDS joined by - or _.
  //
  // The word test is doing real work. Matching "letters and digits joined by a
  // separator" is far too loose — a gclid ("…EgKL9vD_BwE"), a gbraid
  // ("0AAAAADjipJCDrVyiwBwcoaDozP8-0FbsW") and a UUID all satisfy it, and this
  // would happily mangle every one of them into title-cased nonsense. Requiring
  // each segment to be either a plain lowercase word or a plain number rejects
  // all three, since random identifiers mix cases and interleave digits inside
  // segments.
  const segments = withoutNamespace.split(/[-_]+/)
  const looksLikeSlug =
    withoutNamespace.length <= 40 &&
    segments.length > 1 &&
    segments.every((segment) => /^[a-z]{2,}$/.test(segment) || /^\d+$/.test(segment))
  if (!looksLikeSlug) return raw

  return segments
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
