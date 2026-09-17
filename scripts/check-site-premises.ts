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

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapSection } from '../src/components/sites/shared'
import type { SiteLocation } from '../src/lib/client-locations'
import { servingLine } from '../src/lib/site-area'
import {
  areaMapQuery,
  coverageSuffix,
  hasPremises,
  mapIntro,
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

// --- The map: kept for a service-area business, showing the area -----------

console.log('\nThe map section')
{
  const shop = { hasShopLocation: true, offersMobileService: true }
  const sab = { hasShopLocation: false, offersMobileService: true }

  const shopIntro = mapIntro(shop, { area: 'Orange County', city: 'Huntington Beach' })
  expectEqual('a shop, eyebrow', shopIntro.eyebrow, 'Find us')
  expectEqual('a shop, heading', shopIntro.heading, 'Visit the shop in Huntington Beach')

  const sabIntro = mapIntro(sab, { area: 'Central Florida', city: 'Orlando' })
  expectEqual('service-area, eyebrow', sabIntro.eyebrow, 'Where we work')
  expectEqual('service-area, heading', sabIntro.heading, 'Serving Central Florida')
  expectNoPremises('service-area map eyebrow', sabIntro.eyebrow)
  expectNoPremises('service-area map heading', sabIntro.heading)

  /* THE QUERY IS THE CITY, NEVER THE REGION. Handing "Central Florida" to the
     embed asks Google to resolve something it may resolve oddly or not at
     all, and a map that lands in the wrong place is worse than one merely
     zoomed in. The zoom carries the difference instead. */
  const orlando = { city: 'Orlando', state: 'FL', marketArea: 'Central Florida' }
  const wide = areaMapQuery(sab, orlando)
  expectEqual('service-area + market area, one step wider', wide, `${encodeURIComponent('Orlando, FL')}&z=9`)
  if (wide.includes('Central')) fail('the region name was handed to the embed')
  else pass('the region name is not in the query')
  expectEqual(
    'service-area, no market area: city zoom',
    areaMapQuery(sab, { ...orlando, marketArea: null }),
    `${encodeURIComponent('Orlando, FL')}&z=10`
  )
  // A market area equal to the city is not a wider area, so it must not widen.
  expectEqual(
    'market area same as the city',
    areaMapQuery(sab, { ...orlando, marketArea: 'orlando' }),
    `${encodeURIComponent('Orlando, FL')}&z=10`
  )
  /* A SHOP WITH NO VERIFIED PROFILE REACHES THE SAME FALLBACK, and there the
     map sits beside its own street address — so it keeps the tighter frame it
     has always rendered. Widening that too would be an unasked change to
     fourteen sites, made invisibly, while fixing one. */
  expectEqual(
    'a shop, market area set: unchanged at the city zoom',
    areaMapQuery(shop, { city: 'Huntington Beach', state: 'CA', marketArea: 'Orange County' }),
    `${encodeURIComponent('Huntington Beach, CA')}&z=10`
  )
  // Never an address: the street is the thing a pin would point at.
  if (/Newhope|\d{3,}\s/.test(wide)) fail('the area query carried a street')
  else pass('the area query carries no street')
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

// --- The map card, rendered -------------------------------------------------

/*
 * WHAT THE CARD SAYS, out of the real component.
 *
 * Everything above this point checks the libraries, and the bug that prompted
 * these cases was in neither: the street and the hours were printed from the
 * same `lead`, so ticking the flag took the hours off the page as collateral.
 * No library function was wrong, nothing went red, and the only symptom was a
 * mobile shop's card saying where they are based and nothing about when
 * anybody is there to answer. So the card itself is rendered here, in every
 * configuration, and the shop's own copy is asserted unchanged beside it —
 * that half is the one that costs fourteen clients if this drifts.
 */

console.log('\nThe map card, rendered')
{
  const client = {
    slug: 'sab',
    businessName: 'MAG Mobile Auto Glass',
    phone: '(689) 366-6860',
    email: null,
    streetAddress: '1200 Example Pkwy',
    city: 'Orlando',
    state: 'FL',
    postalCode: '32801',
    marketArea: 'Central Florida',
    logoUrl: null,
    footerLogoUrl: null,
    primaryColor: null,
    accentColor: null,
    hasShopLocation: true,
    googleMapsUrl: null,
  }
  const row: SiteLocation = {
    id: 'loc1',
    label: 'Orlando',
    streetAddress: '1200 Example Pkwy',
    city: 'Orlando',
    state: 'FL',
    postalCode: '32801',
    country: 'US',
    phone: '(689) 366-6860',
    hours: 'Mon–Sat 8:00 AM – 6:00 PM',
    googleMapsUrl: null,
    rating: null,
    reviewCount: null,
    isPrimary: true,
    isSynthetic: false,
  }

  const cardText = (hasShopLocation: boolean, locations: SiteLocation[]) => {
    const html = renderToStaticMarkup(
      createElement(MapSection, {
        client: { ...client, hasShopLocation },
        reviews: { rating: 4.9, reviewCount: 88, quotes: [] },
        areas: ['Orlando', 'Kissimmee'],
        offersMobileService: true,
        locations,
        activeCity: null,
      })
    )
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const shop = cardText(true, [row])
  if (shop.includes('Orlando shop 1200 Example Pkwy') && shop.includes(row.hours!))
    pass('a shop still prints its street and its hours, unlabelled, as it always did')
  else fail(`a shop's card changed: ${shop}`)

  const sab = cardText(false, [row])
  expectNoPremises('the card of a service-area business with hours', sab)
  if (!sab.includes('1200 Example Pkwy')) pass('no street on the card')
  else fail('a service-area business printed its street on the card')
  // The whole point of the change: the flag drops the street, not the hours.
  if (sab.includes(`Hours ${row.hours}`))
    pass('the hours survive, under a label of their own')
  else fail(`the hours were lost with the street: ${sab}`)
  if (sab.includes('Based in Orlando, FL')) pass('the city survives as "Based in"')
  else fail('a service-area business lost its city from the card')

  // A section with no data strips itself — never an invented or empty label.
  const noHours = cardText(false, [{ ...row, hours: null }])
  if (!noHours.includes('Hours')) pass('no hours, no label')
  else fail('an empty Hours block rendered')
  // `getClientLocations` returns nothing at all for a mobile-only client with
  // no stored rows, and the synthetic row it would otherwise build carries no
  // hours either — so this is the common case, not the odd one.
  const noRows = cardText(false, [])
  if (!noRows.includes('Hours') && noRows.includes('Based in Orlando, FL'))
    pass('no location rows: the city still renders, the hours do not')
  else fail(`the no-rows card is wrong: ${noRows}`)
}

console.log(
  failures === 0
    ? '\nAll premises checks passed.'
    : `\n${failures} premises check${failures === 1 ? '' : 's'} FAILED.`
)
process.exit(failures === 0 ? 0 : 1)
