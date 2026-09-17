/**
 * WHETHER THIS SHOP HAS A PLACE A CUSTOMER GOES, and what the site may
 * therefore say.
 *
 * `Client.hasShopLocation` has existed since the beginning and has always
 * defaulted true. What it did not have was a control: the intake asks the
 * question ("Customers can come to a shop"), and after approval there was no
 * way to change the answer except an API call — the same trap
 * `ClientStatusCard` records. So a shop that turned out to be mobile-only, or
 * one approved before anybody thought to ask, kept a site that talked about
 * premises it does not have.
 *
 * MAG Mobile has no storefront. Their site said "Serving Central Florida from
 * our Orlando, FL shop" and "Bring the vehicle to the shop" — §2's invented
 * fact about a business, twice, in the two lines a visitor reads first. It is
 * also the worst kind of invented fact, because it is actionable: somebody
 * drives to an address to find nothing there.
 *
 * THE FLAG WINS OVER STORED ROWS, and that is a deliberate reversal. The map
 * section used to read `!hasShopLocation && locations.length === 0`, on the
 * reasoning that a stored ClientLocation is proof of a shop whatever a legacy
 * guess says. The flag is no longer a guess — it is an operator ticking a box
 * that says this business has no premises — and a tick that leaves an address
 * on the page does not mean anything. A leftover row from an import is not
 * evidence against the person who just answered the question.
 *
 * ADDRESSES ARE NOT THE SAME PROBLEM AS COPY. The address fields stay filled
 * in and stay true: a service-area business is still registered somewhere, the
 * rank grid still needs a centre, the legal pages still name a state, and the
 * Business Profile still has a locality even when it has no street. What
 * changes is only what a page SAYS — never "our shop", never "bring it to us",
 * never a street address a customer could set off towards.
 */

export interface Premises {
  /** False for a service-area business: no address a customer visits. */
  hasShopLocation: boolean
  /** Whether they travel to the vehicle. */
  offersMobileService: boolean
}

/** True when the site is allowed to point somebody at an address. */
export function hasPremises(p: Premises): boolean {
  return p.hasShopLocation !== false
}

/**
 * The third "how it works" step — the one that says where the work happens.
 *
 * Three cases, not two. Mobile service and a shop are independent facts, and
 * the pair that used to be unhandled is the one MAG is: no premises, so
 * "bring the vehicle to the shop" is false, and nothing may be substituted
 * that promises a visit either. So that case says what we do to the glass and
 * names no place at all — which is honest, and still the useful half.
 */
export function processStep(p: Premises, fitLine: string): { title: string; body: string } {
  if (p.offersMobileService) {
    return {
      title: 'We come to you',
      body: `Your driveway, your office lot, your job site — wherever the vehicle is. ${fitLine}`,
    }
  }
  if (hasPremises(p)) {
    return { title: 'Drop in and drive off', body: `Bring the vehicle to the shop. ${fitLine}` }
  }
  // Mobile off AND no premises is a half-filled record rather than a business
  // model, so this is written to be true either way it gets resolved: it
  // describes the work and sends nobody anywhere.
  return { title: 'We fit the glass', body: `We book a time that suits you. ${fitLine}` }
}

/** "Three steps, no shop visit" is a claim about a shop. */
export function processTitle(p: Premises): string {
  if (p.offersMobileService) return hasPremises(p) ? 'Three steps, no shop visit' : 'Three steps, we come to you'
  return 'Three simple steps'
}

/**
 * What follows a list of covered towns.
 *
 * " — shop and mobile" is the offer when both are true. With no premises the
 * only thing on offer is the mobile visit, and saying so is more useful than
 * saying nothing: a coverage list with no delivery method beside it reads as
 * an area they advertise in rather than one they drive to.
 */
export function coverageSuffix(p: Premises): string {
  if (!p.offersMobileService) return ''
  return hasPremises(p) ? ' — shop and mobile' : ' — mobile, we come to you'
}

/**
 * THE MAP STAYS FOR A SERVICE-AREA BUSINESS; WHAT IT SHOWS CHANGES.
 *
 * The first cut of this dropped the whole section, which threw away the one
 * thing on the page that answers "do they come out this far" — and for a
 * business whose entire identity is the area it covers, that is the section
 * that matters most. What has to go is the PIN ON A DOOR and the street
 * address beside it, not the map.
 *
 * THE QUERY IS THE CITY, NOT THE REGION, and the zoom carries the difference.
 * "Central Florida" is what the headlines say, but handing a region name to
 * the embed asks Google to resolve something it may resolve oddly or not at
 * all — and a map that lands in the wrong place is worse than one that is
 * merely zoomed in. A city always resolves. So when a market area IS named the
 * map is the same city one step further out, because a named region is by
 * definition broader than the city it is run from, and the towns themselves
 * are listed beside the map in text, which is the precise answer anyway.
 *
 * This is the same shape as the existing no-profile fallback in `MapSection`,
 * which already shows "their city, zoomed out — true, useful, nobody else's
 * pin". A service-area business gets it always, profile or not, because the
 * alternative for them is a pin on an address that does not take visitors.
 */
const CITY_ZOOM = 10
const REGION_ZOOM = 9

/**
 * ONLY A SERVICE-AREA BUSINESS GETS THE WIDER FRAME. A shop with no verified
 * profile reaches this same fallback, and there the map sits beside its own
 * street address — so the tighter frame is the more useful one, and it is
 * what that case has always rendered. Widening it too would have been an
 * unasked change to fourteen sites, made invisibly, while fixing one.
 */
export function areaMapQuery(
  p: Premises,
  place: { city: string; state: string; marketArea?: string | null }
): string {
  const named = (place.marketArea || '').trim()
  const widerArea = !!named && named.toLowerCase() !== (place.city || '').trim().toLowerCase()
  const zoom = !hasPremises(p) && widerArea ? REGION_ZOOM : CITY_ZOOM
  return `${encodeURIComponent(`${place.city}, ${place.state}`)}&z=${zoom}`
}

/**
 * The map section's eyebrow and heading when there is no live review feed to
 * lead with. With one, both shops and service-area businesses lead on the
 * rating — that is the strongest line either can carry.
 */
export function mapIntro(
  p: Premises,
  place: { area: string; city: string }
): { eyebrow: string; heading: string } {
  return hasPremises(p)
    ? { eyebrow: 'Find us', heading: `Visit the shop in ${place.city}` }
    : { eyebrow: 'Where we work', heading: `Serving ${place.area}` }
}

/**
 * Words that assert premises. Used by the check script to assert that nothing
 * the site can say about a service-area business contains one of them.
 *
 * Deliberately NOT a runtime screen on rendered output: the template's copy is
 * fixed and reviewed, so the place to catch this is a test over every
 * configuration, not a filter over strings at request time. Free text an
 * operator or a drafter writes is screened separately — `copy-claims.ts` has
 * the same rule for exactly that reason.
 */
export const PREMISES_WORDS: RegExp[] = [
  /* "THIS shop" is here because the screen missed it on a real page. The
     warranty band read "The cover this shop offers, in their own words" — a
     premises word AND the third person, template copy, live on every site.
     Two and three catch a possessive and an article; a demonstrative is the
     third way English names the same building. "repair shop" in the statutory
     sentence survives, because none of the three sits in front of it. */
  /* THE DETERMINER AND THE NOUN ARE USUALLY NOT ADJACENT, and requiring that
     was the hole. A shop names the town in between — "at our LITTLE ELM shop",
     "the ORLANDO shop", "our MAIN shop" — and that is the form that actually
     turns up in copy, because it is what you write when you have one. It sat
     in a live FAQ answer while this screen, the drafters' screen and the
     template check all read past it. Up to two words, each word-like, so it
     cannot jump punctuation or a sentence boundary; "your choice of repair
     shop" still survives, because "of" is not one of the three. */
  /\b(our|the|this)(?:\s+[\w'’-]+){0,2}\s+(shop|garage|facility|workshop|premises|store)\b/i,
  /\bin[- ]shop\b/i,
  /\bcome (in|by|down)\b/i,
  /\bbring (it|the vehicle|your (car|vehicle))\b/i,
  /\bdrop (in|it off|the car off|your car off)\b/i,
  /\bvisit (us|the)\b/i,
  /\bwaiting (room|area)\b/i,
]

/** The first premises assertion in `text`, or null. */
export function premisesClaim(text: string): string | null {
  for (const re of PREMISES_WORDS) {
    const hit = new RegExp(re.source, re.flags.replace('g', '')).exec(text)
    if (hit) return hit[0]
  }
  return null
}
