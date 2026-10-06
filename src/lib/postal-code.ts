/**
 * What the quote form accepts as the customer's postal code.
 *
 * THE FORM ONLY EVER TOOK A FIVE-DIGIT US ZIP, AND AGS IS IN BRITISH
 * COLUMBIA. A Canadian postal code is letter-digit-letter digit-letter-digit
 * ("V6B 1A1"), so every customer on a BC shop's site was told "Please enter
 * your 5-digit ZIP" and could not send the form at all — the input was also
 * numeric-keyboard and capped at five characters, so the right answer could
 * not even be typed. Nothing on our side errored: the lead simply never
 * existed, which is the same invisible absence as every other silent failure
 * recorded in CLAUDE.md, on the one element the page exists for.
 *
 * The country comes from `twilioCountryFor`, the rule the tracking-number
 * search already uses — the PROVINCE beats a stale `Client.country`.
 *
 * DELIBERATELY LENIENT. A rejected quote is the expensive failure; a postal
 * code with a letter Canada Post never issues costs nothing. So the Canadian
 * pattern is the SHAPE (A1A 1A1, space or hyphen optional), not Canada Post's
 * letter exclusions, and a Canadian shop also accepts a US ZIP — border towns
 * and visitors are real, and turning one away buys nothing.
 *
 * A LEAF MODULE: `widget.js` is a string served to the browser, so these are
 * regex SOURCES it interpolates, and the check runs the same strings.
 */

import { twilioCountryFor, type TwilioCountry } from './phone-country'

export type PostalCountry = TwilioCountry

/** A five-digit US ZIP, which is all the US form has ever asked for. */
export const US_ZIP_SOURCE = '^\\d{5}$'

/** A Canadian postal code by shape: A1A 1A1, A1A1A1 or A1A-1A1, any case. */
export const CA_POSTAL_SOURCE = '^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$'

/** Which country's postal code this shop's form should ask for. */
export function postalCountryFor(client: { country?: string | null; state?: string | null }): PostalCountry {
  return twilioCountryFor(client).country
}

/** Whether the form should accept this value, for a shop in that country. */
export function postalCodeOk(value: string, country: PostalCountry): boolean {
  const v = value.trim()
  if (new RegExp(US_ZIP_SOURCE).test(v)) return true
  return country === 'CA' && new RegExp(CA_POSTAL_SOURCE).test(v)
}

/** "v6b1a1" → "V6B 1A1"; anything else comes back trimmed and unchanged. */
export function normalisePostalCode(value: string): string {
  const v = value.trim()
  if (!new RegExp(CA_POSTAL_SOURCE).test(v)) return v
  const bare = v.replace(/[ -]/g, '').toUpperCase()
  return `${bare.slice(0, 3)} ${bare.slice(3)}`
}
