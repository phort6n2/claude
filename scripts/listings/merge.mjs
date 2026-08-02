// Append validated listings to the seed file, keeping source URLs in a
// separate provenance file (the app doesn't need them, but being able to show
// where a listing came from matters if a shop ever asks).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ROOT = '/home/user/claude'
const SEED = `${ROOT}/src/data/directory-shops.json`
const PROV = `${ROOT}/src/data/directory-shops-sources.json`

const accepted = JSON.parse(readFileSync(new URL('./accepted.json', import.meta.url).pathname, 'utf8'))
const seed = JSON.parse(readFileSync(SEED, 'utf8'))
const before = seed.length

// Final guard: never write a duplicate slug into the seed file.
const taken = new Set(seed.map((s) => s.slug))
const clean = []
for (const a of accepted) {
  if (taken.has(a.slug)) {
    console.error(`DROP duplicate slug: ${a.slug}`)
    continue
  }
  taken.add(a.slug)
  clean.push(a)
}

const provenance = existsSync(PROV) ? JSON.parse(readFileSync(PROV, 'utf8')) : {}
// Strip BOTH underscore fields — they're ingest bookkeeping, not Shop fields,
// and tsc would reject them against the Shop interface.
const shops = clean.map(({ _source, _sourceTier, ...shop }) => {
  provenance[shop.slug] = {
    source: _source,
    // 'aggregator' means the data came off a scraped directory rather than the
    // shop's own site — those are the ones worth phone-verifying first.
    tier: _sourceTier,
    addedAt: new Date().toISOString().slice(0, 10),
  }
  return shop
})

// 1-space indent matches the existing seed file, so the diff is additions only.
writeFileSync(SEED, JSON.stringify([...seed, ...shops], null, 1) + '\n')
writeFileSync(PROV, JSON.stringify(provenance, null, 1) + '\n')

console.log(`seed: ${before} -> ${before + shops.length}  (+${shops.length})`)
console.log(`provenance entries: ${Object.keys(provenance).length}`)
