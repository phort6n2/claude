/**
 * Which country a tracking-number search looks in.
 *
 * Run: npx tsx scripts/check-phone-country.ts
 *
 * THE BUG THIS REPLACES ANSWERED HTTP 200. Twilio takes the country in the
 * path and it was hardcoded `US`, so a British Columbian shop's 604 was a
 * perfectly valid search of the US inventory: 200, `available_phone_numbers:
 * []`. The US and Canada share +1 and the same area-code plan, so there is
 * nothing in that response to distinguish "wrong country" from "Twilio has
 * none left in 805" — the operator pressed search, nothing appeared, and no
 * log, error or message anywhere said why.
 *
 * So every case here is about being able to READ an empty list afterwards:
 * the country has to be right, and when it cannot be, the reason has to be a
 * sentence rather than a guess.
 */

import { twilioCountryFor, countryName } from '../src/lib/phone-country'
import { CANADIAN_PROVINCES } from '../src/lib/insurance-rules'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

console.log('\nAGS, the client this was found on')
{
  const got = twilioCountryFor({ country: 'CA', state: 'BC' })
  if (got.country === 'CA') pass(`BC / CA → CA (${got.reason})`)
  else fail(`a BC shop would still be searched in ${got.country}`)
}

console.log('\nTHE PROVINCE BEATS A STALE COUNTRY, and that is the case that matters')
{
  /* `Client.country` defaults on old records and every client predates having
     one outside the US, so a Canadian shop can easily carry `US` there while
     `state` is typed from the real address. There is no province code shared
     between the two countries, so BC is unambiguous evidence and `country` is
     not — deferring to `country` would reproduce the original bug on exactly
     the client it was found on. */
  const got = twilioCountryFor({ country: 'US', state: 'BC' })
  if (got.country === 'CA') pass('country US + state BC → CA, because the province cannot be ambiguous')
  else fail('a stale country field sent a BC shop back to the US inventory')
}

console.log('\nEvery province and territory resolves')
{
  const missed = Object.keys(CANADIAN_PROVINCES).filter(
    (code) => twilioCountryFor({ country: null, state: code }).country !== 'CA'
  )
  if (missed.length === 0) pass(`all ${Object.keys(CANADIAN_PROVINCES).length} resolve to CA`)
  else fail(`these would be searched in the US: ${missed.join(', ')}`)
  // Lower case and padding are what a form actually stores.
  if (twilioCountryFor({ country: null, state: ' bc ' }).country === 'CA') {
    pass('untrimmed lower case still resolves')
  } else fail('whitespace or case broke the province lookup')
}

console.log('\nThe fourteen US shops are unchanged')
{
  for (const state of ['TX', 'CA', 'FL', 'NY', 'WA', 'OR']) {
    const got = twilioCountryFor({ country: 'US', state })
    if (got.country === 'US') pass(`${state} → US`)
    else fail(`${state} was sent to the Canadian inventory`)
  }
  /* CA IS THE ONE GENUINELY AMBIGUOUS CODE — California as a state, Canada as
     a country — and they sit in different fields. `state: 'CA'` is California
     and must never be read as Canada, which is exactly the collision a single
     combined lookup would get wrong. */
  if (twilioCountryFor({ country: null, state: 'CA' }).country === 'US') {
    pass("state 'CA' is California, not Canada")
  } else fail("state 'CA' was read as the country Canada")
  if (twilioCountryFor({ country: 'CA', state: '' }).country === 'CA') {
    pass("country 'CA' is Canada")
  } else fail("country 'CA' was not read as Canada")
}

console.log('\nThe spellings a record might actually hold')
{
  for (const country of ['ca', 'CAN', 'Canada', ' canada ']) {
    if (twilioCountryFor({ country, state: '' }).country === 'CA') pass(`country "${country}" → CA`)
    else fail(`country "${country}" was not read as Canada`)
  }
  for (const country of ['us', 'USA', 'United States']) {
    if (twilioCountryFor({ country, state: '' }).country === 'US') pass(`country "${country}" → US`)
    else fail(`country "${country}" was not read as the US`)
  }
}

console.log('\nNothing set: the US, and the reason SAYS it was assumed')
{
  const got = twilioCountryFor({ country: null, state: null })
  if (got.country === 'US') pass('falls back to the US — fourteen of fifteen shops')
  else fail('an empty record did not fall back to the US')
  if (/assumed/i.test(got.reason)) {
    pass(`and the reason admits it: "${got.reason}"`)
  } else fail(`the fallback reads as a decision rather than a guess: "${got.reason}"`)
  // Junk in either field must not silently become a country.
  const junk = twilioCountryFor({ country: 'Mexico', state: 'ZZ' })
  if (junk.country === 'US' && /assumed/i.test(junk.reason)) {
    pass('an unrecognised country falls back and says so')
  } else fail(`unrecognised input resolved confidently: ${JSON.stringify(junk)}`)
}

console.log('\nThe reason is a sentence an operator can act on')
{
  for (const input of [
    { country: 'CA', state: 'BC' },
    { country: 'US', state: 'TX' },
    { country: null, state: null },
  ]) {
    /* It is interpolated as `This searched Canada because {reason}`, so what
       matters is that it completes that sentence — not its capitalisation. A
       first cut demanded a lower-case opening and failed "British Columbia is
       in Canada", which is a proper noun doing exactly the right thing. */
    const { country, reason } = twilioCountryFor(input)
    const sentence = `This searched ${countryName(country)} because ${reason}.`
    if (reason.length > 10 && !/\.$/.test(reason) && sentence.split(' ').length > 6) {
      pass(sentence)
    } else fail(`unusable reason for ${JSON.stringify(input)}: "${reason}"`)
  }
  if (countryName('CA') === 'Canada' && countryName('US') === 'the United States') {
    pass('the names read inside a sentence')
  } else fail('country names do not read in a sentence')
}

console.log(
  failures === 0
    ? '\nAll phone-country checks passed.'
    : `\n${failures} phone-country check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
