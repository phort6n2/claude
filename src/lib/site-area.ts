/**
 * What the site's HEADLINES call the area this shop covers.
 *
 * A shop's address is in one city; the business it wants is the region. Auto
 * Glass Kings sit in Huntington Beach and work across Orange County, and a
 * homepage H1 that says "Huntington Beach" tells three quarters of the people
 * who land on it that they are on the wrong site. `Client.marketArea` is the
 * operator's answer to that: set it to "Orange County" and the headlines, the
 * page titles and the serving line say Orange County.
 *
 * WHAT IT DOES NOT TOUCH, and why the change is safe:
 *
 * - The ADDRESS, the LocalBusiness schema's `addressLocality`, the contact and
 *   location cards, and the legal pages. Those are facts about where the
 *   business IS, they are cross-checked against the Google Business Profile,
 *   and a region in place of a locality there is a broken NAP, not a wider
 *   catchment.
 * - The EYEBROW above the H1, which stays "· Huntington Beach, CA". It is the
 *   local keyword anchor, and it is also the honest answer to "where are
 *   these people, actually" for a reader who has just been told "Orange
 *   County".
 * - City pages, which are city pages.
 *
 * IT IS A CLAIM ABOUT COVERAGE, so it is typed by an operator and never
 * inferred. Nothing here can know whether a shop really works the whole
 * county, and § 2 of CLAUDE.md is explicit that the template may not invent a
 * fact about a business. Empty is the default and means "use the city", which
 * is what every site did before this existed.
 */

export interface AreaNaming {
  city: string
  state: string
  /**
   * REQUIRED, not optional, even though empty is the normal value.
   *
   * Every site page loads its client through an explicit Prisma `select`. An
   * optional field here means a page that forgot to select it type-checks
   * perfectly and then quietly renders the city forever — which is exactly
   * what happened the first time this shipped: the homepage said Huntington
   * Beach with "Orange County" sitting in the row. Required, and a missing
   * select is a compile error.
   */
  marketArea: string | null
}

const clean = (v: string | null | undefined): string => (v || '').trim()

/**
 * The name for headlines, titles and the serving line.
 *
 * Falls back to the city, so a client who has never opened the field reads
 * exactly as it always did.
 */
export function headlineArea(client: AreaNaming): string {
  return clean(client.marketArea) || clean(client.city)
}

/** True when the site is speaking about a region rather than its own city. */
export function usesMarketArea(client: AreaNaming): boolean {
  const area = clean(client.marketArea)
  return !!area && area.toLowerCase() !== clean(client.city).toLowerCase()
}

/**
 * "Orange County" / "Huntington Beach, CA" — the area, then the state, in the
 * form a page title or a meta description wants.
 *
 * A region does not take a state suffix the way a city does: "Orange County,
 * CA" reads like a postal address for something that is not one, and every
 * shop's county is already unambiguous inside its own state. A city keeps its
 * state, because "Springfield" alone is not a place.
 */
export function areaWithState(client: AreaNaming): string {
  const area = headlineArea(client)
  return usesMarketArea(client) ? area : `${area}, ${clean(client.state)}`
}

/**
 * The short form for a footer or a list lead-in.
 *
 * "and nearby" is dropped once a region is named: a county already IS the
 * nearby, and "Orange County and nearby" invites the question of which part
 * of Los Angeles they meant.
 */
export function servingShort(client: AreaNaming): string {
  return usesMarketArea(client)
    ? headlineArea(client)
    : `${clean(client.city)}, ${clean(client.state)} and nearby`
}

/**
 * The line that says who the site is for and where the shop actually is.
 *
 * Both halves on purpose. "Serving Orange County" alone loses the city that
 * makes the shop findable and believable; the city alone is the problem this
 * whole field exists to fix.
 */
export function servingLine(client: AreaNaming, mobile: boolean): string {
  const city = clean(client.city)
  const state = clean(client.state)
  if (!usesMarketArea(client)) {
    return mobile
      ? `Mobile service across ${city} & nearby — we come to your home or workplace`
      : `Serving ${city}, ${state} and nearby`
  }
  const area = headlineArea(client)
  return mobile
    ? `Mobile service across ${area} — we come to your home or workplace, from our shop in ${city}`
    : `Serving ${area} from our ${city}, ${state} shop`
}
