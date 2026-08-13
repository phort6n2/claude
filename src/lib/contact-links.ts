/**
 * Tap-to-call and tap-to-text links, and the message a shop starts with.
 *
 * These open the phone's own dialler and Messages app. Nothing is sent by the
 * platform: the text leaves from the owner's number, arrives in their existing
 * thread with that customer, and their reply comes back to them. That is the
 * whole design — a shop owner standing in the bay does not want a second inbox
 * to check, and a platform-sent text would put a strange number in front of a
 * customer who is expecting the shop.
 *
 * It also keeps us out of A2P 10DLC entirely. Person-to-person texts from the
 * owner's own handset are not an application-to-person campaign, so there is
 * no registration, no carrier filtering, and no consent record to keep. The
 * only SMS the platform itself sends is the lead alert to the client.
 */

/**
 * E.164 or nothing. `tel:` and `sms:` both tolerate pretty formatting on some
 * platforms and mangle it on others, and a dialler that opens with a wrong
 * number is worse than a button that does not appear.
 */
export function toE164(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if ((raw || '').trim().startsWith('+') && digits.length >= 8) return `+${digits}`
  return null
}

/** `tel:` href, or null when the number is unusable. */
export function telHref(phone: string | null | undefined): string | null {
  const e164 = toE164(phone)
  return e164 ? `tel:${e164}` : null
}

/**
 * `sms:` href with the first message pre-filled.
 *
 * The separator is the reason this is a function rather than a template
 * literal at each call site. iOS wants `sms:+1555…&body=`, Android wants
 * `sms:+1555…?body=`, and `?&body=` is the form both accept — iOS reads the
 * `&`, Android reads the `?`. Get it wrong for one platform and the message
 * silently does not appear, which nobody notices until a shop owner is
 * retyping it by hand.
 *
 * The body is only ever a suggestion. It lands in the compose field, and the
 * owner can edit or delete it before sending.
 */
export function smsHref(phone: string | null | undefined, body?: string | null): string | null {
  const e164 = toE164(phone)
  if (!e164) return null
  if (!body) return `sms:${e164}`
  return `sms:${e164}?&body=${encodeURIComponent(body)}`
}

export interface FirstTextInput {
  /** The customer's first name, when the form captured one. */
  firstName?: string | null
  /** The shop's name, as the customer would recognise it. */
  businessName?: string | null
  /** What they asked for, in words a person would use. */
  service?: string | null
  /** Year/make/model, when known. */
  vehicle?: string | null
}

/**
 * The opening text, written the way a shop would write it.
 *
 * Every part is optional because leads arrive half-filled — a phone lead has
 * no vehicle, a rushed form has no name — and a message with a hole in it
 * ("Hi , this is about your request") is worse than a shorter one. Each clause
 * is dropped rather than filled with a placeholder.
 *
 * It ends on a question. The point of the text is a reply, and "let us know if
 * you have any questions" reliably gets none. Naming the vehicle matters more
 * than it looks: it proves a human read the enquiry, which is the difference
 * between this and the autoresponder every other shop sends.
 */
export function firstTextTo(lead: FirstTextInput): string {
  const greeting = lead.firstName?.trim() ? `Hi ${lead.firstName.trim()},` : 'Hi,'
  // With no shop name there is no sentence that reads well — "this is us" is
  // worse than saying nothing — so the clause is dropped and the verb changes
  // to carry the sentence on its own.
  const who = lead.businessName?.trim() ? ` this is ${lead.businessName.trim()} about` : ' following up on'

  const about = lead.service?.trim()
    ? ` your ${lead.service.trim().toLowerCase()} request`
    : ' your quote request'
  const on = lead.vehicle?.trim() ? ` for the ${lead.vehicle.trim()}` : ''

  // The closing is kept short deliberately. A typical fully populated message
  // lands around 160 characters — a long shop name or vehicle will push past
  // it, which costs nothing since the owner's own carrier is sending — but it
  // stays short enough to read whole in the compose field and to be worth
  // editing rather than deleting.
  return `${greeting}${who}${about}${on}. Want a quick call, or should I text you the quote?`
}
