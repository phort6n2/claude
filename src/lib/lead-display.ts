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
