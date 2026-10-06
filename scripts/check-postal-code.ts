/**
 * The quote form takes a Canadian postal code from a Canadian shop's customer.
 *
 * Run: npx tsx scripts/check-postal-code.ts
 *
 * The silent case first: AGS is in British Columbia, and the form accepted
 * only a five-digit ZIP — so every customer was refused, and a refused form
 * writes no lead, sends no alert and logs nothing. The check reads the REAL
 * served widget source, because the rule lives inside a string the browser
 * runs and a copy of it here would pass for ever while the widget drifted.
 */

import {
  postalCodeOk,
  normalisePostalCode,
  postalCountryFor,
  US_ZIP_SOURCE,
  CA_POSTAL_SOURCE,
} from '../src/lib/postal-code'
import { GET } from '../src/app/widget.js/route'

let failures = 0
const check = (ok: boolean, msg: string) => {
  if (ok) console.log(`  ✓ ${msg}`)
  else {
    failures++
    console.error(`  ✗ ${msg}`)
  }
}

async function main() {
  console.log('\nA BC SHOP IS CANADIAN, WHATEVER ITS STALE COUNTRY SAYS')
  check(postalCountryFor({ state: 'BC', country: 'US' }) === 'CA', 'state BC, country US → CA')
  check(postalCountryFor({ state: 'BC', country: null }) === 'CA', 'state BC, no country → CA')
  check(postalCountryFor({ state: 'ON', country: 'CA' }) === 'CA', 'Ontario → CA')
  check(postalCountryFor({ state: 'CA', country: 'US' }) === 'US', 'state CA is California → US')
  check(postalCountryFor({ state: 'TX', country: null }) === 'US', 'Texas → US')

  console.log('\nA CANADIAN CUSTOMER CAN SEND THE FORM')
  for (const v of ['V6B 1A1', 'v6b1a1', 'V6B-1A1', '  V5K 0A1 ', 'T2P 2M5', 'M5V 3L9']) {
    check(postalCodeOk(v, 'CA'), `"${v}" accepted for a Canadian shop`)
  }
  check(postalCodeOk('98101', 'CA'), 'a US ZIP is still accepted for a Canadian shop (border, visitors)')
  for (const v of ['', 'V6B', 'V6B 1A', '12345-6789', 'VV6 1A1', 'hello']) {
    check(!postalCodeOk(v, 'CA'), `"${v}" refused`)
  }
  check(normalisePostalCode('v6b1a1') === 'V6B 1A1', 'stored as V6B 1A1')
  check(normalisePostalCode('V6B-1A1') === 'V6B 1A1', 'hyphen normalised')
  check(normalisePostalCode('98101') === '98101', 'a ZIP passes through unchanged')

  console.log('\nA US SHOP IS EXACTLY AS IT WAS')
  check(postalCodeOk('97132', 'US'), '"97132" accepted')
  check(!postalCodeOk('V6B 1A1', 'US'), 'a postal code is refused for a US shop, as before')
  check(!postalCodeOk('9713', 'US'), 'four digits refused')

  console.log('\nTHE SERVED WIDGET CARRIES THE SAME RULE, AND PARSES')
  const src = await (await GET()).text()
  check(src.includes(`/${CA_POSTAL_SOURCE}/.test(zipValue)`), 'widget tests the Canadian pattern as a regex literal')
  check(src.includes(`/${US_ZIP_SOURCE}/.test(zipValue)`), 'widget tests the US pattern as a regex literal')
  check(!src.includes('${'), 'no uninterpolated placeholder left in the served script')
  check(src.includes("cfg.postalCountry === 'CA'"), 'widget reads postalCountry from its config')
  let parses = true
  try {
    new Function(src)
  } catch (e) {
    parses = false
    console.error(e)
  }
  check(parses, 'served script is valid JavaScript')
  // The interpolated pattern, as the browser will compile it.
  const literal = src.match(/\/(\^\[A-Za-z\][^/]*\$)\/\.test\(zipValue\)/)
  const browserRe = literal ? new RegExp(literal[1]) : null
  check(!!browserRe && browserRe.test('V6B 1A1') && !browserRe.test('12345'), 'the pattern in the script matches V6B 1A1')

  console.log(failures ? `\n${failures} failed\n` : '\nall passed\n')
  process.exit(failures ? 1 : 0)
}

main()
