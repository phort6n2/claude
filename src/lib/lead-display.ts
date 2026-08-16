import {
  CheckCircle2,
  Clock,
  DollarSign,
  MessageSquare,
  TrendingUp,
  XCircle,
} from 'lucide-react'

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

/**
 * How a lead's status is drawn, in one place.
 *
 * There were two copies of this — the leads list and the lead detail page —
 * and they had already drifted: the detail page was missing Qualified and
 * Unqualified, so a lead in either state showed a blank dropdown and could
 * not be moved out of it from the page you land on when you click the lead.
 * Two lists of the same enum will always drift; one cannot.
 */
export interface LeadStatusStyle {
  label: string
  color: string
  bgColor: string
  icon: React.ElementType
}

export const STATUS_CONFIG: Record<string, LeadStatusStyle> = {
  NEW: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONTACTED: {
    label: 'Contacted',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: MessageSquare,
  },
  QUALIFIED: {
    label: 'Qualified',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: CheckCircle2,
  },
  UNQUALIFIED: {
    label: 'Unqualified',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: XCircle,
  },
  QUOTED: { label: 'Quoted', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: DollarSign },
  SOLD: { label: 'Sold', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: TrendingUp },
  LOST: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
}

export const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}))

export function statusStyle(status: string | null | undefined): LeadStatusStyle {
  return STATUS_CONFIG[status || ''] || STATUS_CONFIG.NEW
}

/**
 * How long a lead has been sitting, as a person would say it.
 *
 * Absolute timestamps made the list unreadable: a row from twenty minutes ago
 * and a row from three days ago looked identical, and working out which was
 * which meant doing arithmetic against today's date on every line. The whole
 * job of this list is to surface the lead nobody has answered.
 */
export function relativeAge(date: Date | string): string {
  const then = typeof date === 'string' ? new Date(date) : date
  const mins = Math.floor((Date.now() - then.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

/**
 * How loudly an unanswered lead should read.
 *
 * Only ever applied to NEW: a lead that has been contacted is not late no
 * matter how old it is, and colouring it would train the colour out.
 */
export function waitingLevel(
  status: string | null | undefined,
  createdAt: Date | string
): 'none' | 'warn' | 'late' {
  if (status !== 'NEW') return 'none'
  const then = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  const hours = (Date.now() - then.getTime()) / 3_600_000
  if (hours >= 4) return 'late'
  if (hours >= 1) return 'warn'
  return 'none'
}
