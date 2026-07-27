// ============================================
// DIRECTORY — US MAP GEOMETRY (server-only)
// ============================================
// Turns state boundaries and shop coordinates into plain SVG numbers so the
// browser gets no geo library at all — d3-geo and the 1.5 MB TopoJSON stay on
// the server, and the client component is pure React and SVG.
//
// Everything here runs at build time (the map page is statically generated), so
// the projection cost is paid once rather than per request.
//
// The one rule that matters: state outlines and shop markers MUST come from the
// SAME projection instance. Project them differently and every pin lands in the
// wrong place — subtly enough that it looks plausible.

import { geoAlbersUsa, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import statesTopo from 'us-atlas/states-10m.json'
import type { Topology } from 'topojson-specification'

/** us-atlas ships pre-fitted to this box; keeping it avoids re-fitting. */
export const MAP_WIDTH = 975
export const MAP_HEIGHT = 610

export interface StateShape {
  /** Lowercase 2-letter code, matching Shop.state. */
  state: string
  name: string
  /** SVG path in MAP_WIDTH × MAP_HEIGHT space. */
  d: string
  /** [minX, minY, maxX, maxY] — drives the zoom viewBox on click. */
  bounds: [number, number, number, number]
  /** Label anchor. Not always inside the shape (Florida, Louisiana). */
  centroid: [number, number]
}

export interface MapPoint {
  slug: string
  name: string
  city: string
  state: string
  x: number
  y: number
}

// FIPS → postal code. TopoJSON identifies states by FIPS id, and our shop
// records use postal codes, so one of the two has to be translated.
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'al', '02': 'ak', '04': 'az', '05': 'ar', '06': 'ca', '08': 'co',
  '09': 'ct', '10': 'de', '11': 'dc', '12': 'fl', '13': 'ga', '15': 'hi',
  '16': 'id', '17': 'il', '18': 'in', '19': 'ia', '20': 'ks', '21': 'ky',
  '22': 'la', '23': 'me', '24': 'md', '25': 'ma', '26': 'mi', '27': 'mn',
  '28': 'ms', '29': 'mo', '30': 'mt', '31': 'ne', '32': 'nv', '33': 'nh',
  '34': 'nj', '35': 'nm', '36': 'ny', '37': 'nc', '38': 'nd', '39': 'oh',
  '40': 'ok', '41': 'or', '42': 'pa', '44': 'ri', '45': 'sc', '46': 'sd',
  '47': 'tn', '48': 'tx', '49': 'ut', '50': 'vt', '51': 'va', '53': 'wa',
  '54': 'wv', '55': 'wi', '56': 'wy',
}

// geoAlbersUsa is the composite projection: it relocates Alaska and Hawaii into
// insets rather than dropping them, which matters — we list shops in both.
const projection = geoAlbersUsa().scale(1300).translate([487.5, 305])
// One decimal place. The 10m boundaries carry far more precision than a 975-unit
// wide map can render — full precision costs 211 KB of path data to draw the
// same pixels. 0.1 units stays sub-pixel even at the 9× state zoom.
const pathBuilder = geoPath(projection).digits(1)

let cachedStates: StateShape[] | null = null

export function getStateShapes(): StateShape[] {
  if (cachedStates) return cachedStates

  const topo = statesTopo as unknown as Topology
  const collection = feature(
    topo,
    topo.objects.states
  ) as unknown as FeatureCollection<Geometry, { name: string }>

  const shapes: StateShape[] = []
  for (const f of collection.features) {
    const code = FIPS_TO_STATE[String(f.id).padStart(2, '0')]
    // Territories (Puerto Rico et al.) have no postal code here and no shops.
    if (!code) continue
    const d = pathBuilder(f as unknown as GeoPermissibleObjects)
    if (!d) continue
    const [[x0, y0], [x1, y1]] = pathBuilder.bounds(f as unknown as GeoPermissibleObjects)
    const c = pathBuilder.centroid(f as unknown as GeoPermissibleObjects)
    shapes.push({
      state: code,
      name: f.properties?.name ?? code.toUpperCase(),
      d,
      bounds: [x0, y0, x1, y1],
      centroid: [c[0], c[1]],
    })
  }
  cachedStates = shapes.sort((a, b) => a.name.localeCompare(b.name))
  return cachedStates
}

/**
 * Project one shop. Returns null when the point falls outside the composite —
 * geoAlbersUsa has genuine gaps between the mainland and the AK/HI insets, and
 * a null there is correct rather than an error: the alternative is a pin
 * floating in the Pacific.
 */
export function projectPoint(lat: number, lng: number): [number, number] | null {
  const p = projection([lng, lat])
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null
  return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]
}
