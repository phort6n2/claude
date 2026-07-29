// Adds place labels to the per-state layer files.
//
// Two jobs, one dataset:
//
//  1. Context labels. The map only names cities where we have a shop, so a
//     reader can't tell an area with no shops from an area we haven't mapped.
//     Naming the towns we DON'T serve, in grey, makes the gaps honest.
//  2. Label priority. Our own city labels are all the same weight today, so
//     which ones survive collision is effectively the order the API returned
//     them in — Denver can lose its label to Broomfield. Ranking places by
//     land area gives a stable, data-derived hierarchy.
//
// Census cartographic boundary files carry no population, so land area is the
// proxy. It correlates well enough to sort Denver above Broomfield, which is
// all the label pass needs.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { geoAlbersUsa } from 'd3-geo'

const GEO = new URL('.', import.meta.url).pathname
const OUT = process.argv[2]
if (!OUT) throw new Error('usage: node places.mjs <outDir>')

const projection = geoAlbersUsa().scale(1300).translate([487.5, 305])
const FIPS = JSON.parse(readFileSync(`${GEO}/fips.json`, 'utf8'))

/**
 * Real population for the places that have it.
 *
 * Land area alone ranked Aurora above Denver — Aurora covers more ground —
 * so a merged Front Range cluster came out labelled "Aurora area". Natural
 * Earth carries population for ~770 US places, which is exactly the set where
 * getting the order right matters. Everything below that stays on area.
 */
const POP = new Map()
{
  const j = JSON.parse(readFileSync(`${GEO}/pop.json`, 'utf8'))
  for (const f of j.features ?? []) {
    const { n, p, s } = f.properties
    if (!n || !p || !s) continue
    const key = `${s.toLowerCase()}|${n.toLowerCase()}`
    POP.set(key, Math.max(POP.get(key) ?? 0, p))
  }
}
const STATE_NAME = {}
{
  const t = JSON.parse(readFileSync('/home/user/claude/node_modules/us-atlas/states-10m.json', 'utf8'))
  for (const g of t.objects.states.geometries) {
    const code = FIPS[g.id]
    if (code) STATE_NAME[code] = g.properties.name
  }
}

/** Drop the Census legal suffix — nobody calls it "Denver city". */
function tidy(name) {
  return name
    .replace(/ (city|town|village|borough|CDP|municipality|urban county)$/i, '')
    .replace(/ \(.*\)$/, '')
    .trim()
}

const MAX_PER_STATE = 140
let totalAdded = 0

for (const [fips, code] of Object.entries(FIPS)) {
  const zip = `${GEO}/places/p${fips}.zip`
  let geo
  try {
    // -points centroid gives one label anchor per place; the polygon itself is
    // never drawn, so there's no reason to carry it.
    execFileSync(
      'npx',
      [
        'mapshaper',
        `${zip}`,
        '-filter', 'ALAND > 15000000',
        '-each', 'this.properties={n:NAME,a:ALAND}',
        '-points', 'centroid',
        '-o', 'precision=0.0001', 'format=geojson', `${GEO}/tmp-place.json`,
      ],
      { cwd: GEO, stdio: 'pipe' }
    )
    geo = JSON.parse(readFileSync(`${GEO}/tmp-place.json`, 'utf8'))
  } catch {
    console.warn(`skip ${code}: no place file`)
    continue
  }

  const feats = geo.features ?? []
  const rows = []
  for (const f of feats) {
    const p = projection(f.geometry.coordinates)
    if (!p) continue
    rows.push({ n: tidy(f.properties.n), a: f.properties.a, x: +p[0].toFixed(1), y: +p[1].toFixed(1) })
  }
  // Population where we have it, land area otherwise. Sorting the two groups
  // separately rather than mixing the scales: a place with a real population
  // figure is always a bigger deal than one ranked only by its footprint.
  const stateName = (STATE_NAME[code] ?? '').toLowerCase()
  for (const r of rows) r.p = POP.get(`${stateName}|${r.n.toLowerCase()}`) ?? 0
  rows.sort((a, b) => (b.p - a.p) || (b.a - a.a))
  const kept = rows.slice(0, MAX_PER_STATE).map(({ n, x, y }, i) => ({
    n,
    x,
    y,
    // 1 = major, 2 = mid, 3 = minor. Drives both grey-label sizing and the
    // priority our own shop-city labels are sorted by.
    r: i < 8 ? 1 : i < 32 ? 2 : 3,
  }))

  const file = `${OUT}/${code}.json`
  const layer = JSON.parse(readFileSync(file, 'utf8'))
  layer.places = kept
  writeFileSync(file, JSON.stringify(layer))
  totalAdded += kept.length
}

console.log(`places: ${totalAdded} across ${Object.keys(FIPS).length} states`)

const sizes = readdirSync(OUT)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, kb: readFileSync(`${OUT}/${f}`).length / 1024 }))
  .sort((a, b) => b.kb - a.kb)
console.log('largest:', sizes.slice(0, 4).map((s) => `${s.f} ${s.kb.toFixed(0)}KB`).join(', '))
console.log(`median ${sizes[Math.floor(sizes.length / 2)].kb.toFixed(0)}KB`)
