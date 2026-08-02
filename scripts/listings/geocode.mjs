// Geocode directory listings that have no coordinates.
//
// Uses the US Census Bureau's bulk geocoder: free, no API key, and the
// authoritative source for US street addresses. Only EXACT address matches are
// written back — an unmatched shop keeps no coordinates rather than being given
// a ZIP centroid, because "3.2 miles away" has to be true to be worth showing.
//
// Usage: node geocode.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ROOT = '/home/user/claude'
const SEED = `${ROOT}/src/data/directory-shops.json`
const CACHE = new URL('./geocode-cache.json', import.meta.url).pathname
const DRY = process.argv.includes('--dry')

const BATCH_URL = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
const ONELINE_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
const BENCHMARK = 'Public_AR_Current'
const CHUNK = 250 // well under the 10k cap; keeps each request quick to retry

const rejected = []
const shops = JSON.parse(readFileSync(SEED, 'utf8'))
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}

const needs = shops.filter(
  (s) => typeof s.lat !== 'number' || typeof s.lng !== 'number'
)
console.log(`${shops.length} shops, ${needs.length} without coordinates`)

// Census wants a bare street line. Suite/unit designators frequently break the
// match, so we submit the street as-is first and retry stripped (below).
function streetOf(s, stripUnit) {
  let st = (s.street || '').trim()
  if (stripUnit) {
    st = st
      .replace(/,?\s*(ste|suite|unit|apt|bldg|building|#)\s*[\w-]+\.?$/i, '')
      .replace(/,\s*$/, '')
      .trim()
  }
  return st
}

const csvCell = (v) => {
  const s = String(v ?? '').replace(/"/g, "'")
  return /[",\n]/.test(s) ? `"${s}"` : s
}

async function batchGeocode(rows, stripUnit) {
  const wantState = Object.fromEntries(rows.map((s) => [s.slug, s.state.toUpperCase()]))

  // id, street, city, state, zip — no header row.
  const csv = rows
    .map((s) =>
      [s.slug, streetOf(s, stripUnit), s.city, s.state.toUpperCase(), s.zip]
        .map(csvCell)
        .join(',')
    )
    .join('\n')

  const form = new FormData()
  form.append('benchmark', BENCHMARK)
  form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv')

  const res = await fetch(BATCH_URL, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`census returned ${res.status}`)
  const text = await res.text()

  const found = {}
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    // "id","input","Match","Exact","matched addr","lon,lat","tigerline","side"
    const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0) ?? []
    const clean = cells.map((c) => c.replace(/^"|"$/g, '').trim())
    const [id, , status, , matched, coords] = clean
    if (status !== 'Match' || !coords) continue
    const [lon, lat] = coords.split(',').map(Number)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    // Guard against a plausible-looking match in the wrong state — Census echoes
    // the address it matched as "STREET, CITY, ST, ZIP".
    const matchedState = matched?.split(',').slice(-2, -1)[0]?.trim().toUpperCase()
    if (matchedState && wantState[id] && matchedState !== wantState[id]) {
      rejected.push(`${id}: matched in ${matchedState}, expected ${wantState[id]}`)
      continue
    }
    found[id] = { lat: round(lat), lng: round(lon) }
  }
  return found
}

// One-line fallback for rows the batch endpoint couldn't parse.
async function onelineGeocode(s) {
  const address = [streetOf(s, true), s.city, `${s.state.toUpperCase()} ${s.zip}`]
    .filter(Boolean)
    .join(', ')
  const url = `${ONELINE_URL}?address=${encodeURIComponent(address)}&benchmark=${BENCHMARK}&format=json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) return null
    const j = await res.json()
    const m = j?.result?.addressMatches?.[0]?.coordinates
    if (!m || !Number.isFinite(m.y) || !Number.isFinite(m.x)) return null
    return { lat: round(m.y), lng: round(m.x) }
  } catch {
    return null
  }
}

// ~11 m of precision. More digits imply an accuracy the source doesn't have.
const round = (n) => Math.round(n * 1e5) / 1e5

const pending = needs.filter((s) => !cache[s.slug])
console.log(`${Object.keys(cache).length} already cached, ${pending.length} to look up\n`)

for (let i = 0; i < pending.length; i += CHUNK) {
  const rows = pending.slice(i, i + CHUNK)
  const label = `batch ${Math.floor(i / CHUNK) + 1}/${Math.ceil(pending.length / CHUNK)}`
  let got = {}
  for (const stripUnit of [false, true]) {
    const missing = rows.filter((s) => !got[s.slug] && !cache[s.slug])
    if (!missing.length) break
    try {
      const found = await batchGeocode(missing, stripUnit)
      got = { ...got, ...found }
      console.log(`${label}${stripUnit ? ' (retry, unit stripped)' : ''}: ${Object.keys(found).length}/${missing.length} matched`)
    } catch (e) {
      console.error(`${label} failed: ${e.message}`)
    }
  }
  for (const [slug, coords] of Object.entries(got)) cache[slug] = coords
  // Mark the misses so a rerun doesn't retry them forever; null = tried, no match.
  for (const s of rows) if (!(s.slug in cache)) cache[s.slug] = null
  writeFileSync(CACHE, JSON.stringify(cache, null, 1))
}

// Single-address retry for everything the batch endpoint missed.
const stillMissing = needs.filter((s) => cache[s.slug] === null)
console.log(`\nretrying ${stillMissing.length} misses one at a time…`)
let recovered = 0
for (const s of stillMissing) {
  const hit = await onelineGeocode(s)
  if (hit) {
    cache[s.slug] = hit
    recovered++
  }
}
writeFileSync(CACHE, JSON.stringify(cache, null, 1))
console.log(`recovered ${recovered}`)

// ---- write back --------------------------------------------------------
let written = 0
const out = shops.map((s) => {
  if (typeof s.lat === 'number' && typeof s.lng === 'number') return s
  const hit = cache[s.slug]
  if (!hit) return s
  written++
  // Keep key order stable: lat/lng go right after zip, matching the seed shape.
  const { services, mobileService, insurance, hours, description, claimed, featured, ...head } = s
  return { ...head, lat: hit.lat, lng: hit.lng, services, mobileService, insurance, hours, description, claimed, featured }
})

if (rejected.length) {
  console.log(`\nrejected ${rejected.length} wrong-state matches:`)
  rejected.forEach((r) => console.log('  ' + r))
}

const total = out.filter((s) => typeof s.lat === 'number').length
console.log(`\nwould add coordinates to ${written} shops`)
console.log(`directory coverage: ${total}/${out.length} (${Math.round((total / out.length) * 100)}%)`)

if (DRY) {
  console.log('\n--dry: seed file not written')
} else {
  writeFileSync(SEED, JSON.stringify(out, null, 1) + '\n')
  console.log('seed file updated')
}
