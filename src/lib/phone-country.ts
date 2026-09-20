import { CANADIAN_PROVINCES } from '@/lib/insurance-rules'

/**
 * WHICH NATIONAL INVENTORY TO SEARCH FOR A TRACKING NUMBER.
 *
 * Twilio's available-numbers endpoint takes the country in the PATH —
 * `/AvailablePhoneNumbers/US/Local.json` — and that was hardcoded to `US`.
 *
 * THE FAILURE IS SILENT, AND SILENT IN THE WORST DIRECTION. The US and Canada
 * share country code +1 and the same area-code plan, so searching Twilio's US
 * inventory for 604 is a perfectly valid request: HTTP 200, and
 * `available_phone_numbers: []`. Not an error, not a refusal, not a hint —
 * the same empty list you get for a US area code Twilio happens to be out of.
 * An operator sees the spinner stop and nothing appear, twice, and concludes
 * the feature is broken rather than that it looked in the wrong country.
 *
 * So the country is DERIVED rather than assumed, and the caller says which one
 * it searched, so an empty result can be read.
 */

export type TwilioCountry = 'US' | 'CA'

/** Spellings of a country that a client record might actually hold. */
const CANADA = new Set(['CA', 'CAN', 'CANADA'])
const USA = new Set(['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'])

/**
 * The country whose numbers this shop should get, and why.
 *
 * `country` wins when it says something recognisable, because it is the field
 * an operator set on purpose. The PROVINCE is the fallback, and it is a real
 * one: `Client.country` defaults on old records and several were created
 * before anybody was outside the US, so a BC shop can easily carry a stale
 * `US` — while `state: BC` is typed from the address and is never wrong.
 *
 * THE PROVINCE OVERRIDES A STALE COUNTRY rather than deferring to it, for
 * that reason: there is no province code shared between the two countries, so
 * `BC` is unambiguous evidence in a way `country` is not.
 */
export function twilioCountryFor(client: {
  country?: string | null
  state?: string | null
}): { country: TwilioCountry; reason: string } {
  const state = (client.state || '').trim().toUpperCase()
  if (CANADIAN_PROVINCES[state]) {
    return { country: 'CA', reason: `${CANADIAN_PROVINCES[state]} is in Canada` }
  }

  const declared = (client.country || '').trim().toUpperCase()
  if (CANADA.has(declared)) return { country: 'CA', reason: 'the client is set to Canada' }
  if (USA.has(declared)) return { country: 'US', reason: 'the client is set to the United States' }

  // Nothing usable. The US is the honest default — fourteen of fifteen shops
  // — and the caller names the country in its answer, so a wrong guess reads
  // as a wrong guess rather than as an empty inventory.
  return { country: 'US', reason: 'no country or province is set, so the US was assumed' }
}

/** "Canada" / "the United States", for a sentence. */
export function countryName(country: TwilioCountry): string {
  return country === 'CA' ? 'Canada' : 'the United States'
}
