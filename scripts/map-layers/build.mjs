// Generates the per-state reference layers the map draws under its markers.
//
// Run offline, output committed to src/data/map-layers. Nothing here runs at
// build time or request time — the site only ever reads the JSON.
//
// Everything is projected with the SAME geoAlbersUsa instance the shop points
// use (src/lib/directory/usmap.ts), so a road and a marker that share a real
// location share an x/y. Get this wrong and the roads sit next to the shops
// instead of under them.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import * as topojson from 'topojson-client'

const OUT = process.argv[2]
if (!OUT) throw new Error('usage: node build.mjs <outDir>')
mkdirSync(OUT, { recursive: true })

const projection = geoAlbersUsa().scale(1300).translate([487.5, 305])
const path = geoPath(projection).digits(1)

const FIPS = JSON.parse(readFileSync(new URL('./fips.json', import.meta.url), 'utf8'))
const byFips = new Map(Object.entries(FIPS)) // '08' -> 'co'

// ---- state outlines, used to clip everything else -------------------------
const statesTopo = JSON.parse(
  readFileSync('/home/user/claude/node_modules/us-atlas/states-10m.json', 'utf8')
)
const stateFeatures = topojson.feature(statesTopo, statesTopo.objects.states).features
const stateByCode = new Map()
for (const f of stateFeatures) {
  const code = byFips.get(f.id)
  if (code) stateByCode.set(code, f)
}

// ---- counties -------------------------------------------------------------
const countiesTopo = JSON.parse(
  readFileSync('/home/user/claude/node_modules/us-atlas/counties-10m.json', 'utf8')
)

/** Interior county borders for one state, as a single mesh path. */
function countyMesh(stateFips) {
  const inState = (a) => String(a.id).slice(0, 2) === stateFips
  // a !== b keeps only shared edges, so the state's own outline isn't redrawn
  // over the top of the outline we already paint.
  const mesh = topojson.mesh(
    countiesTopo,
    {
      ...countiesTopo.objects.counties,
      geometries: countiesTopo.objects.counties.geometries.filter(inState),
    },
    (a, b) => a !== b
  )
  return path(mesh) || ''
}

// ---- geographic bbox per state, padded --------------------------------------
// Layers are clipped in lon/lat before projecting. Padding is deliberate: a
// road that stops dead at the state line looks like a bug, and neighbouring
// territory is visible in the viewport anyway.
function bboxOf(feature, padDeg) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < x0) x0 = c[0]
      if (c[0] > x1) x1 = c[0]
      if (c[1] < y0) y0 = c[1]
      if (c[1] > y1) y1 = c[1]
    } else for (const p of c) walk(p)
  }
  walk(feature.geometry.coordinates)
  return [x0 - padDeg, y0 - padDeg, x1 + padDeg, y1 + padDeg]
}

const inBox = ([lon, lat], b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]

/**
 * Split a linestring into the runs that fall inside the box.
 *
 * One point of overshoot is kept at each end so the line reaches the edge of
 * the frame instead of stopping short of it.
 */
function clipLine(coords, box) {
  const runs = []
  let run = null
  for (let i = 0; i < coords.length; i++) {
    if (inBox(coords[i], box)) {
      if (!run) {
        run = []
        if (i > 0) run.push(coords[i - 1])
      }
      run.push(coords[i])
    } else if (run) {
      run.push(coords[i])
      if (run.length > 1) runs.push(run)
      run = null
    }
  }
  if (run && run.length > 1) runs.push(run)
  return runs
}

function polygonIntersectsBox(geom, box) {
  let hit = false
  const walk = (c) => {
    if (hit) return
    if (typeof c[0] === 'number') {
      if (inBox(c, box)) hit = true
    } else for (const p of c) walk(p)
  }
  walk(geom.coordinates)
  return hit
}

/** Project a set of features and join them into one path string. */
function joinPaths(features) {
  const parts = []
  for (const f of features) {
    const d = path(f)
    if (d) parts.push(d)
  }
  return parts.join('')
}

// mapshaper drops to a GeometryCollection when every feature has empty
// properties, so normalise both shapes to a plain feature array.
function load(f) {
  const j = JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'))
  if (j.features) return j.features
  return (j.geometries || []).map((g) => ({ type: 'Feature', properties: {}, geometry: g }))
}
const roads = load('roads.json')
const urban = load('urban.json')
const lakes = load('lakes.json')
const rivers = load('rivers.json')

/** "I- 25" / "Interstate 25" -> "I-25"; "US Hwy 285" -> "US 285". */
function shieldLabel(name, type) {
  if (!name) return null
  const n = name.replace(/\s+/g, ' ').trim()
  const m = n.match(/(\d+)/)
  if (!m) return null
  return type === 'I' ? `I-${m[1]}` : `US ${m[1]}`
}

const summary = []

for (const [code, feature] of stateByCode) {
  const fips = Object.entries(FIPS).find(([, c]) => c === code)[0]
  // Alaska and Hawaii are relocated by the composite projection, so a lon/lat
  // box around them still projects correctly — but Natural Earth features far
  // outside the composite's clip return null from geoPath and drop out anyway.
  const box = bboxOf(feature, code === 'ak' ? 2 : 0.4)

  // roads, split by class so the two can be styled apart
  const road = { I: [], U: [] }
  const shields = []
  const seenShield = new Map()
  for (const f of roads) {
    const t = f.properties.t
    if (t !== 'I' && t !== 'U') continue
    // Routes are dissolved by name, so most are MultiLineString by now.
    const lines =
      f.geometry?.type === 'LineString'
        ? [f.geometry.coordinates]
        : f.geometry?.type === 'MultiLineString'
          ? f.geometry.coordinates
          : []
    for (const run of lines.flatMap((l) => clipLine(l, box))) {
      road[t].push({ type: 'Feature', geometry: { type: 'LineString', coordinates: run } })
      const label = shieldLabel(f.properties.n, t)
      // Several candidate positions per route, spread along it. The client
      // draws at most one — but with a single fixed anchor a badge that landed
      // on a city name was simply dropped, and I-25 is exactly the label you
      // least want to lose.
      const used = seenShield.get(label) ?? 0
      if (label && used < 4 && run.length >= 8) {
        for (const frac of [0.5, 0.25, 0.75]) {
          if ((seenShield.get(label) ?? 0) >= 4) break
          const at = projection(run[Math.floor(run.length * frac)])
          if (!at) continue
          seenShield.set(label, (seenShield.get(label) ?? 0) + 1)
          shields.push({ t: label, x: +at[0].toFixed(1), y: +at[1].toFixed(1), i: t === 'I' })
        }
      }
    }
  }

  const out = {
    counties: countyMesh(fips),
    interstates: joinPaths(road.I),
    highways: joinPaths(road.U),
    urban: joinPaths(urban.filter((f) => polygonIntersectsBox(f.geometry, box))),
    lakes: joinPaths(lakes.filter((f) => polygonIntersectsBox(f.geometry, box))),
    rivers: joinPaths(
      rivers
        .filter((f) => f.geometry?.type === 'LineString')
        .flatMap((f) =>
          clipLine(f.geometry.coordinates, box).map((run) => ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: run },
          }))
        )
    ),
    shields: shields.slice(0, 90),
    places: [], // filled by places.mjs
  }

  writeFileSync(`${OUT}/${code}.json`, JSON.stringify(out))
  const kb = (JSON.stringify(out).length / 1024).toFixed(1)
  summary.push({ code, kb: +kb, shields: shields.length })
}

summary.sort((a, b) => b.kb - a.kb)
console.log('largest:', summary.slice(0, 6).map((s) => `${s.code} ${s.kb}KB`).join(', '))
console.log('smallest:', summary.slice(-4).map((s) => `${s.code} ${s.kb}KB`).join(', '))
const total = summary.reduce((t, s) => t + s.kb, 0)
console.log(`median ${summary[Math.floor(summary.length / 2)].kb}KB · total ${(total / 1024).toFixed(1)}MB across ${summary.length} states`)
