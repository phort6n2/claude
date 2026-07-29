import 'server-only'

/**
 * Geographic reference layers, one file per state.
 *
 * The map used to be shapes and dots on an empty field: once you zoomed past
 * the national view there was nothing on screen that was a *place*, so there
 * was no way to judge where a shop actually was. These are the layers a real
 * basemap draws at that zoom — highways, county lines, built-up areas, water,
 * and the names of towns — cut down to the few that carry orientation.
 *
 * Deliberately NOT part of /api/directory/map. That response is what the
 * homepage downloads on scroll, and it is 62 KB brotli. Adding these layers
 * nationally would take it past 180 KB, giving back most of what the homepage
 * weight-loss work bought, to serve a view most visitors never open. Loaded
 * per state on click they cost a median 18 KB gzipped.
 *
 * The files are generated offline and committed — see docs/map-layers.md.
 * Every geometry is projected with the same geoAlbersUsa instance the shop
 * points use, so a road and a marker at the same real location share an x/y.
 */
export interface StateLayers {
  /** Interior county borders, as one mesh path. */
  counties: string
  /** Interstate centrelines, joined into a single path. */
  interstates: string
  /** US highway centrelines, joined into a single path. */
  highways: string
  /** Built-up area polygons — turns dots-on-nothing into dots-on-a-city. */
  urban: string
  lakes: string
  rivers: string
  /** Route badges, e.g. `I-25`. `i` marks an interstate. */
  shields: { t: string; x: number; y: number; i: boolean }[]
  /** Town names, ranked 1 (major) to 3 (minor). */
  places: { n: string; x: number; y: number; r: 1 | 2 | 3 }[]
}

const cache = new Map<string, StateLayers | null>()

export async function getStateLayers(state: string): Promise<StateLayers | null> {
  const code = state.trim().toLowerCase()
  if (!/^[a-z]{2}$/.test(code)) return null
  if (cache.has(code)) return cache.get(code) ?? null
  let layers: StateLayers | null = null
  try {
    // Template import so Next traces all 51 files into the serverless bundle
    // while only ever evaluating the one asked for.
    layers = (await import(`@/data/map-layers/${code}.json`)).default as StateLayers
  } catch {
    // A state with no file (or a bad code) just draws without reference
    // layers — the map still works, it's only less legible.
    layers = null
  }
  cache.set(code, layers)
  return layers
}
