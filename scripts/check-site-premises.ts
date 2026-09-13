/**
 * What a hosted site is allowed to say about a place customers go.
 *
 * Run: npx tsx scripts/check-site-premises.ts
 *
 * BOTH DIRECTIONS MATTER, and only one of them is loud. Too lenient and a
 * service-area business's own site tells somebody to drive to an address that
 * is not there — §2's invented fact about a business, in its most actionable
 * form, and nothing anywhere goes red about it: the page renders, the markup
 * validates, and the only symptom is a customer standing in a car park. Too
 * eager and the fourteen shops that DO have premises lose the line that makes
 * them findable, which is the reason `marketArea` keeps the city at all.
 *
 * So every configuration is asserted: a shop's copy is byte-for-byte what it
 * always was, and a service-area business's copy contains no premises word
 * anywhere.
 */

import { servingLine } from '../src/lib/site-area'
import {
  coverageSuffix,
  hasPremises,
  premisesClaim,
  processStep,
  processTitle,
} from '../src/lib/site-premises'
import { homeJsonLd } from '../src/lib/site-schema'
import type { SiteExtras } from '../src/lib/site-content'

let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}
const pass = (msg: string) => console.log(`  ✓ ${msg}`)

function expectEqual(label: string, got: string, want: string) {
  if (got === want) pass(`${label}: ${got}`)
  else fail(`${label}\n      got:  ${got}\n      want: ${want}`)
}

/** Nothing a service-area business's site says may assert premises. */
function expectNoPremises(label: string, text: string) {
  const hit = premisesClaim(text)
  if (hit) fail(`${label} asserts premises (“${hit}”) — ${text}`)
  else pass(`${label}: no premises claim`)
}

// --- The serving line, which is under the H1 on every page ------------------

console.log('\nServing line — a shop with premises (unchanged)')
{
  const kings = { city: 'Huntington Beach', state: 'CA', marketArea: 'Orange County' }
  expectEqual(
    'mobile + market area',
    servingLine(kings, { mobile: true, hasShopLocation: true }),
    'Mobile service across Orange County — we come to your home or workplace, from our shop in Huntington Beach'
  )
  expectEqual(
    'no mobile + market area',
    servingLine(kings, { mobile: false, hasShopLocation: true }),
    'Serving Orange County from our Huntington Beach, CA shop'
  )
  const plain = { city: 'Beaverton', state: 'OR', marketArea: null }
  expectEqual(
    'no market area, mobile',
    servingLine(plain, { mobile: true, hasShopLocation: true }),
    'Mobile service across Beaverton & nearby — we come to your home or workplace'
  )
  expectEqual(
    'no market area, no mobile',
    servingLine(plain, { mobile: false, hasShopLocation: true }),
    'Serving Beaverton, OR and nearby'
  )
}

console.log('\nServing line — MAG Mobile: a service-area business')
{
  // MAG's real shape: Orlando, FL, no storefront, mobile service, a region in
  // the market-area field. The line used to read "…from our shop in Orlando".
  const mag = { city: 'Orlando', state: 'FL', marketArea: 'Central Florida' }
  const line = servingLine(mag, { mobile: true, hasShopLocation: false })
  expectEqual(
    'mobile + market area',
    line,
    'Mobile service across Central Florida — we come to your home or workplace, based in Orlando, FL'
  )
  expectNoPremises('serving line', line)
  // THE CITY MUST SURVIVE. Dropping the whole clause would have been the easy
  // fix and it costs the half of the line that makes them findable and
  // believable — the reason site-area.ts names the city at all.
  if (!line.includes('Orlando')) fail('the serving line dropped the city entirely')
  else pass('the city is still named, as "based in"')

  const noMobile = servingLine(mag, { mobile: false, hasShopLocation: false })
  expectEqual('no mobile + market area', noMobile, 'Serving Central Florida, based in Orlando, FL')
  expectNoPremises('serving line, mobile off', noMobile)

  // No market area set: neither form ever named a building, so both stand.
  const bare = { city: 'Orlando', state: 'FL', marketArea: null }
  expectNoPremises(
    'no market area, mobile',
    servingLine(bare, { mobile: true, hasShopLocation: false })
  )
  expectNoPremises(
    'no market area, no mobile',
    servingLine(bare, { mobile: false, hasShopLocation: false })
  )
}

// --- "How it works", step three --------------------------------------------

const FIT = 'We fit the glass and tell you when it’s safe to drive.'

console.log('\nHow it works — the step that says where the work happens')
{
  const shopMobile = { hasShopLocation: true, offersMobileService: true }
  const shopOnly = { hasShopLocation: true, offersMobileService: false }
  const sab = { hasShopLocation: false, offersMobileService: true }
  const neither = { hasShopLocation: false, offersMobileService: false }

  expectEqual('shop + mobile, title', processStep(shopMobile, FIT).title, 'We come to you')
  expectEqual('shop only, title', processStep(shopOnly, FIT).title, 'Drop in and drive off')
  expectEqual(
    'shop only, body',
    processStep(shopOnly, FIT).body,
    `Bring the vehicle to the shop. ${FIT}`
  )
  expectEqual('shop only, heading', processTitle(shopOnly), 'Three simple steps')
  expectEqual('shop + mobile, heading', processTitle(shopMobile), 'Three steps, no shop visit')

  // A service-area business.
  const magStep = processStep(sab, FIT)
  expectEqual('service-area, title', magStep.title, 'We come to you')
  expectNoPremises('service-area step body', magStep.body)
  expectNoPremises('service-area heading', processTitle(sab))

  /* THE CASE THAT WAS UNHANDLED. Mobile off and no premises used to fall to
     the shop branch, so the one shop on the platform with nowhere to go was
     told to "bring the vehicle to the shop". It is a half-filled record rather
     than a business model — the Business tab warns about it — but the copy has
     to be true whichever way it is resolved, so it names no place at all. */
  const orphan = processStep(neither, FIT)
  expectNoPremises('no shop, no mobile — title', orphan.title)
  expectNoPremises('no shop, no mobile — body', orphan.body)
  if (/come to you|your driveway/i.test(orphan.body))
    fail('no shop and no mobile promised a visit anyway')
  else pass('no shop, no mobile: promises no visit either')
}

// --- The coverage list's suffix --------------------------------------------

console.log('\nCoverage suffix')
{
  expectEqual(
    'shop + mobile',
    coverageSuffix({ hasShopLocation: true, offersMobileService: true }),
    ' — shop and mobile'
  )
  expectEqual(
    'shop, no mobile',
    coverageSuffix({ hasShopLocation: true, offersMobileService: false }),
    ''
  )
  const sab = coverageSuffix({ hasShopLocation: false, offersMobileService: true })
  expectNoPremises('service-area', sab)
  if (!sab.trim()) fail('a service-area business lost the suffix entirely — say how, not nothing')
  else pass(`service-area:${sab}`)
}

// --- hasPremises defaults ---------------------------------------------------

console.log('\nThe flag itself')
{
  // Undefined must read as "has a shop": fourteen of fifteen do, the column
  // defaults true, and a page that forgot to select it must not silently strip
  // every address off a shop that has one.
  if (hasPremises({ hasShopLocation: undefined as unknown as boolean, offersMobileService: true }))
    pass('a missing value reads as "has a shop", never as a service-area business')
  else fail('a missing hasShopLocation stripped the addresses off a shop that has one')
  if (!hasPremises({ hasShopLocation: false, offersMobileService: true }))
    pass('false means no premises')
  else fail('false did not mean no premises')
}

// --- The LocalBusiness markup ----------------------------------------------

console.log('\nLocalBusiness JSON-LD')
{
  const extras = { faq: [], galleryPhotos: [] } as unknown as SiteExtras
  const base = {
    businessName: 'MAG Mobile Auto Glass',
    phone: '(407) 780-3837',
    streetAddress: '1234 Example Rd',
    city: 'Orlando',
    state: 'FL',
    postalCode: '32801',
    country: 'US',
    logoUrl: null,
    googleMapsUrl: 'https://maps.google.com/?cid=1',
    serviceAreas: ['Winter Park', 'Kissimmee'],
  }

  const withShop = homeJsonLd({
    origin: 'https://example.glassleads.app',
    client: { ...base, hasShopLocation: true },
    services: [],
    extras,
  })
  const shopEntity = (withShop['@graph'] as Record<string, unknown>[]).find(
    (n) => n['@type'] === 'AutoRepair'
  ) as Record<string, Record<string, string>>
  if (shopEntity.address.streetAddress === base.streetAddress)
    pass('a shop still publishes its street address')
  else fail('a shop lost its street address from the markup')
  if (shopEntity.hasMap) pass('a shop still publishes hasMap')
  else fail('a shop lost hasMap')

  const sabGraph = homeJsonLd({
    origin: 'https://example.glassleads.app',
    client: { ...base, hasShopLocation: false },
    services: [],
    extras,
  })
  const sabEntity = (sabGraph['@graph'] as Record<string, unknown>[]).find(
    (n) => n['@type'] === 'AutoRepair'
  ) as Record<string, unknown>
  const address = sabEntity.address as Record<string, string>
  if (!('streetAddress' in address))
    pass('a service-area business publishes no street address')
  else fail(`a service-area business published a street address: ${address.streetAddress}`)
  // The locality IS on their Business Profile and everything downstream needs
  // it — dropping the whole address node would be the over-correction.
  if (address.addressLocality === 'Orlando' && address.addressRegion === 'FL')
    pass('the locality and region survive')
  else fail('a service-area business lost its locality')
  if (!sabEntity.hasMap) pass('no hasMap for a service-area business')
  else fail('a service-area business published hasMap')
  if (Array.isArray(sabEntity.areaServed) && (sabEntity.areaServed as unknown[]).length === 2)
    pass('areaServed carries the towns instead')
  else fail('areaServed is missing — a service-area business has nothing else to say where it works')

  // Nothing in the whole serialized graph may contain the street.
  const serialized = JSON.stringify(sabGraph)
  if (serialized.includes(base.streetAddress))
    fail('the street address appears somewhere else in the graph')
  else pass('the street appears nowhere in the graph')
}

console.log(
  failures === 0
    ? '\nAll premises checks passed.'
    : `\n${failures} premises check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
