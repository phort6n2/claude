/**
 * Where a Google place actually is — and what to do when Google will not say.
 *
 * WHY THIS IS ITS OWN MODULE. The grid centre for a rank scan comes from the
 * linked Business Profile, and the lookup was one line inside
 * `backfillCoordinates`: the LEGACY `maps.googleapis.com/maps/api/place/
 * details/json?fields=geometry` endpoint, whose refusal it swallowed and
 * returned `null` for. So a key that is not authorized for the legacy API and
 * a place that genuinely has no coordinates produced the identical answer, and
 * the card then said *"Google returned no coordinates for the linked Business
 * Profile"* — a confident claim about the business when the truth may be that
 * the API refused us.
 *
 * `gbp-reviews.ts` already records the cause, four files away: **newer API
 * projects are not authorized for the legacy details endpoint
 * (REQUEST_DENIED)**, which is why reviews moved to the Places API (New). The
 * coordinate lookup and the Business tab's own picker never followed.
 *
 * So: the NEW API first, the legacy one as a fallback, and Google's own words
 * in the error either way. A refusal and an absence are different facts, and
 * only one of them is about the shop.
 *
 * SERVICE-AREA BUSINESSES are why this matters now. A shop with no storefront
 * — MAG Mobile — has no address on its profile, and the grid centre for one is
 * a JUDGEMENT rather than a fact Google holds: it is the middle of the area
 * they actually serve, which only the operator knows. So `coordsFromText` is
 * not a fallback for a broken API, it is the right answer for that whole class
 * of client, and it takes what somebody actually has in their hand — the URL
 * out of the Google Maps address bar.
 */

export interface PlaceLocation {
  latitude: number
  longitude: number
}

export type PlaceLocationResult =
  | { ok: true; location: PlaceLocation; source: 'new' | 'legacy' }
  /** `refused` separates "Google said no to us" from "the place has none". */
  | { ok: false; error: string; refused: boolean }

/** Sanity, not geography: reject what cannot be a coordinate pair. */
export function plausibleLocation(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  // NULL ISLAND. 0,0 is the Atlantic off Ghana and is what a missing value
  // parses to when something upstream coerces rather than checks. This app has
  // already drawn one map centred there and it was not obvious from the page.
  if (lat === 0 && lng === 0) return false
  return true
}

/**
 * Read the location off a place, preferring the API that is actually
 * authorized. Field mask `location` is the whole request: no reviews, no
 * address, nothing that costs more than it needs to.
 */
export async function placeLocation(
  placeId: string,
  apiKey: string
): Promise<PlaceLocationResult> {
  let newApiError = ''
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'location',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      }
    )
    const data = await res.json().catch(() => null)
    if (res.ok) {
      const lat = data?.location?.latitude
      const lng = data?.location?.longitude
      if (typeof lat === 'number' && typeof lng === 'number' && plausibleLocation(lat, lng)) {
        return { ok: true, location: { latitude: lat, longitude: lng }, source: 'new' }
      }
      // Answered, and had nothing. That IS a fact about the place — but the
      // legacy endpoint is still worth asking before saying so.
      newApiError = 'the Places API (New) returned no location for it'
    } else {
      newApiError = `Places API (New): ${data?.error?.status || res.status}${
        data?.error?.message ? ` — ${data.error.message}` : ''
      }`
    }
  } catch (err) {
    newApiError = err instanceof Error ? err.message : 'Places API (New) request failed'
  }

  // The legacy endpoint, second. Kept because an OLDER API project may be
  // authorized for it and not for the new one — the reverse of the case that
  // moved reviews across — so between the two, one of them answers.
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    const data = await res.json().catch(() => null)
    const loc = data?.result?.geometry?.location
    if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number' && plausibleLocation(loc.lat, loc.lng)) {
      return { ok: true, location: { latitude: loc.lat, longitude: loc.lng }, source: 'legacy' }
    }
    // REQUEST_DENIED arrives as an HTTP 200 with a status in the body, which
    // is exactly how the old one-liner mistook it for an empty result.
    const status: string = data?.status || String(res.status)
    const refused = /REQUEST_DENIED|OVER_QUERY_LIMIT|INVALID_REQUEST/i.test(status)
    return {
      ok: false,
      refused: refused || /denied|not authorized|API_KEY/i.test(newApiError),
      error: refused
        ? `Google refused the lookup (${status}${data?.error_message ? `: ${data.error_message}` : ''}). ${newApiError}`
        : `${newApiError}, and the legacy endpoint answered ${status}`,
    }
  } catch (err) {
    return {
      ok: false,
      refused: /denied|not authorized|API_KEY/i.test(newApiError),
      error: `${newApiError}; the legacy endpoint also failed (${err instanceof Error ? err.message : 'request failed'})`,
    }
  }
}

/**
 * Coordinates out of whatever an operator pasted.
 *
 * They have a browser open on the place, so what is in their hand is a Google
 * Maps URL — not a number pair. Every form below is one somebody can actually
 * produce, and demanding a clean "lat, lng" means they go and edit a URL by
 * hand, which is where a transposed pair comes from.
 *
 * PRECEDENCE IS LOAD-BEARING. A Maps URL carries up to two different points
 * and they are not the same thing: `!3d…!4d…` is the PIN — where the place is
 * — while `@lat,lng,zoom` is where the CAMERA was when the URL was copied.
 * They differ by however far the map had been dragged, which for a
 * service-area business is exactly the kind of quiet error nobody would spot:
 * the grid is plausible, just centred on the wrong side of town.
 *
 * Pure: text in, a pair or null out.
 */
export function coordsFromText(input: string): PlaceLocation | null {
  const text = (input || '').trim()
  if (!text) return null

  const pairs: Array<[number, number]> = []
  const push = (lat: string, lng: string) => {
    const a = Number(lat)
    const b = Number(lng)
    if (plausibleLocation(a, b)) pairs.push([a, b])
  }

  // 1. The pin, in a place URL's data block.
  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) push(pin[1], pin[2])

  // 2. The camera.
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) push(at[1], at[2])

  // 3. An explicit query, which is what a "share" link or a q= URL carries.
  const query = text.match(/[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (query) push(query[1], query[2])

  // 4. A bare pair, typed or copied out of the coordinates readout.
  const bare = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (bare) push(bare[1], bare[2])

  if (!pairs.length) return null
  const [latitude, longitude] = pairs[0]
  return { latitude, longitude }
}
