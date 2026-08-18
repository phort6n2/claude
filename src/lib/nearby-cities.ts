import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { LOCATION_PAGE_LIMIT } from '@/lib/site-locations'

/**
 * Proposes the service-area cities a shop's location pages are built from.
 *
 * Location pages exist per city in `Client.serviceAreas`, and until now that
 * list could only be typed in by hand or come back from an import of the
 * shop's own website — so a shop whose old site never listed its towns got no
 * location pages at all, and nothing on screen said which towns were missing.
 *
 * TWO STEPS, and the second is the point. A model asked "what towns are near
 * Hillsboro, Oregon" answers fluently and is mostly right; mostly is not good
 * enough to decide which five pages get built and indexed. So every name it
 * returns is looked up against Google's geocoder, which gives back real
 * coordinates — the candidate is kept only if it resolves, and the distance
 * that orders the list is measured, not claimed. A name that resolves nowhere
 * is dropped silently; the model is a source of candidates, not of facts.
 *
 * Nothing here writes to the client. Every candidate is a suggestion an admin
 * ticks, because the shop's actual coverage is a business fact only the shop
 * knows — a town twenty minutes away across a river they never cross looks
 * identical to one they serve daily.
 */

/** Beyond this, a "service area" is a claim about driving nobody made. */
const MAX_MILES = 35
/** Enough to fill the page cap several times over after verification drops some. */
const ASK_FOR = 14

export interface AreaCandidate {
  city: string
  /** Straight-line miles from the shop. Null when it could not be measured. */
  miles: number | null
  /** Google resolved it to a real place at real coordinates. */
  verified: boolean
}

export interface AreaSuggestion {
  candidates: AreaCandidate[]
  /** Cities already on the client, so the UI can say what it skipped. */
  alreadyListed: string[]
  /** Plain-language account of what ran and what did not. */
  note: string
}

async function settingOrEnv(key: string, envKey: string): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key } })
    if (setting) {
      if (setting.encrypted) {
        try {
          return decrypt(setting.value)
        } catch {
          return null
        }
      }
      return setting.value
    }
  } catch {
    // fall through to env
  }
  return process.env[envKey] || null
}

/** Straight-line miles. Good enough to order towns; nobody is navigating by it. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

interface GeocodeHit {
  lat: number
  lng: number
  /** Google's own name for the place, which is the spelling worth keeping. */
  name: string
}

/**
 * Resolve one "City, ST" through Google's geocoder.
 *
 * Returns null for anything that is not a locality — a query that lands on a
 * street or a business is a name the model made up, and a location page for
 * it would be a page about a place that does not exist.
 */
async function geocodeCity(city: string, state: string, key: string): Promise<GeocodeHit | null> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${city}, ${state}`)}` +
    `&components=country:US&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const data = await res.json()
  if (data.status === 'REQUEST_DENIED') throw new Error(data.error_message || 'REQUEST_DENIED')
  const hit = (data.results || [])[0]
  if (!hit) return null
  const types: string[] = hit.types || []
  if (!types.some((t) => t === 'locality' || t === 'postal_town' || t === 'neighborhood')) return null
  const loc = hit.geometry?.location
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null
  const named = (hit.address_components || []).find((c: { types: string[] }) =>
    c.types.includes('locality')
  )
  return { lat: loc.lat, lng: loc.lng, name: named?.long_name || city }
}

export async function suggestServiceAreas(
  clientId: string
): Promise<{ ok: true; result: AreaSuggestion } | { ok: false; error: string }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      businessName: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      serviceAreas: true,
      offersMobileService: true,
      locations: { select: { city: true, state: true } },
    },
  })
  if (!client) return { ok: false, error: 'Client not found' }
  if (!client.city || !client.state) {
    return { ok: false, error: 'Set the shop’s city and state on the Business tab first.' }
  }

  const anthropicKey = await settingOrEnv('ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    return { ok: false, error: 'No Anthropic API key configured (Settings → API keys).' }
  }

  const shopCities = client.locations.map((l) => l.city).filter(Boolean)
  const listed = [...new Set([...shopCities, ...(client.serviceAreas || []), client.city])]
  const listedLower = new Set(listed.map((c) => c.trim().toLowerCase()))

  const prompt = `List the towns and cities nearest to ${client.city}, ${client.state}, USA.

They are for the service-area pages of a local auto glass shop based there${
    client.offersMobileService ? ', which runs a mobile unit to the customer' : ''
  }.

RULES
1. Real, separately named populated places only — incorporated cities, towns, or census-designated places that people give as their own address. No neighbourhoods or districts of ${client.city} itself, no counties, no regions.
2. Within about ${MAX_MILES} miles by road. Closest first.
3. Same state where possible; a nearer town over a state line is fine if people there genuinely drive to ${client.city}.
4. Do NOT include any of these, which are already covered: ${listed.join(', ')}
5. Return ${ASK_FOR} of them. If there genuinely are not that many, return fewer — do not pad the list with places further away than the rule allows.

Return ONLY a JSON array of names, no other text: ["Name", "Name"]`

  let names: string[]
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = message.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') return { ok: false, error: 'No text in the response.' }
    const match = block.text.match(/\[[\s\S]*\]/)
    if (!match) return { ok: false, error: 'Could not read the list that came back.' }
    names = (JSON.parse(match[0]) as unknown[])
      .filter((n): n is string => typeof n === 'string')
      .map((n) => n.trim())
      .filter(Boolean)
  } catch (error) {
    console.error('Nearby-city suggestion failed:', error)
    return { ok: false, error: error instanceof Error ? error.message : 'Suggestion failed' }
  }

  // Whatever it says, anything already covered is dropped here too — rule 4
  // is an instruction, not a guarantee.
  const fresh = names.filter((n) => !listedLower.has(n.toLowerCase()))

  const placesKey = await settingOrEnv('GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACES_API_KEY')
  const origin =
    typeof client.latitude === 'number' && typeof client.longitude === 'number'
      ? { lat: client.latitude, lng: client.longitude }
      : null

  if (!placesKey) {
    return {
      ok: true,
      result: {
        candidates: fresh.map((city) => ({ city, miles: null, verified: false })),
        alreadyListed: listed,
        note: 'Unverified — no Google API key is configured, so these names were not checked against a map. Confirm each one before adding it.',
      },
    }
  }

  const seen = new Set<string>()
  const candidates: AreaCandidate[] = []
  let geocoderRefused = false

  for (const name of fresh) {
    if (geocoderRefused) break
    try {
      const hit = await geocodeCity(name, client.state, placesKey)
      if (!hit) continue
      const key = hit.name.trim().toLowerCase()
      if (seen.has(key) || listedLower.has(key)) continue
      const miles = origin ? Math.round(milesBetween(origin, hit) * 10) / 10 : null
      // Measured, not claimed. A town the model called nearby and the map puts
      // fifty miles out is exactly the page that should never be built.
      if (miles !== null && miles > MAX_MILES) continue
      seen.add(key)
      candidates.push({ city: hit.name, miles, verified: true })
    } catch (error) {
      // One refusal is the key's answer for all of them; stop spending calls.
      geocoderRefused = true
      console.warn('[NearbyCities] geocode refused:', error)
    }
  }

  if (geocoderRefused) {
    return {
      ok: true,
      result: {
        candidates: fresh.map((city) => ({ city, miles: null, verified: false })),
        alreadyListed: listed,
        note: 'Unverified — Google refused the lookup, usually because the Geocoding API is not enabled on the key. Confirm each name before adding it.',
      },
    }
  }

  candidates.sort((a, b) => (a.miles ?? 999) - (b.miles ?? 999))

  const short = listed.length + candidates.length < LOCATION_PAGE_LIMIT + 1
  return {
    ok: true,
    result: {
      candidates,
      alreadyListed: listed,
      note: origin
        ? `Checked against Google: ${candidates.length} of ${fresh.length} resolved to a real town within ${MAX_MILES} miles, ordered by distance from the shop.${
            short ? ' That is fewer than the five pages the site can build.' : ''
          }`
        : `Checked against Google: ${candidates.length} of ${fresh.length} resolved to a real town. Distances are missing because the shop has no coordinates — search for the business on the Business tab to set them.`,
    },
  }
}
