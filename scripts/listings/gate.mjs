// Apply the live-site verdicts to the accepted set, in place.
//
// Sits between ingest.mjs and merge.mjs. ingest decides whether a listing is
// well-formed and not a duplicate; this decides whether it is real.
//
//   confirmed  the site carries the phone number  -> keep
//   named      the site carries the business name -> keep
//   nosite     no website to check                -> keep, but count them; a
//              batch that is mostly nosite is a batch that wasn't researched
//   weak       site is live, corroborates neither -> keep, flag for review
//   dead       domain doesn't resolve             -> DROP, and drop it loudly
//
// A dead domain is the signature of a fabricated listing. It is also sometimes
// just a shop that let its hosting lapse — so the listing is dropped rather
// than the whole batch, and the names are printed so a pattern is visible.
import { readFileSync, writeFileSync } from 'node:fs'

const P = (f) => new URL(`./${f}`, import.meta.url).pathname
const verified = JSON.parse(readFileSync(P('accepted-verified.json'), 'utf8'))

const tally = {}
for (const r of verified) tally[r.verdict] = (tally[r.verdict] || 0) + 1

const kept = verified.filter((r) => r.verdict !== 'dead')
const dropped = verified.filter((r) => r.verdict === 'dead')
const weak = kept.filter((r) => r.verdict === 'weak')

console.log('verdicts:', tally)
console.log(`\nkeeping ${kept.length}, dropping ${dropped.length} dead`)

if (dropped.length) {
  console.log('\nDROPPED (dead site):')
  for (const r of dropped) {
    console.log(`  ${r.name} — ${r.city}, ${r.state} — ${r.website} (${r.detail})`)
  }
}
if (weak.length) {
  console.log(`\nWEAK (live site, no corroboration) — ${weak.length}:`)
  for (const r of weak.slice(0, 40)) {
    console.log(`  ${r.name} — ${r.city}, ${r.state} — ${r.website}`)
  }
  if (weak.length > 40) console.log(`  … and ${weak.length - 40} more`)
}

// Per-batch confirm rate. Trusted listings sit around 85% confirmed; a batch
// far below that is worth reading before it ships.
const byFile = {}
for (const r of verified) {
  const f = r._file || '?'
  byFile[f] ||= { n: 0, ok: 0 }
  byFile[f].n++
  if (r.verdict === 'confirmed' || r.verdict === 'named') byFile[f].ok++
}
console.log('\nper-batch corroboration:')
for (const [f, s] of Object.entries(byFile).sort()) {
  const pct = Math.round((s.ok / s.n) * 100)
  console.log(`  ${f.padEnd(16)} ${String(s.ok).padStart(3)}/${String(s.n).padStart(3)}  ${pct}%${pct < 55 ? '   <-- LOOK AT THIS' : ''}`)
}

// Strip the verifier's own fields; everything downstream expects Shop shape
// plus the two underscore bookkeeping fields merge.mjs removes.
const clean = kept.map(({ verdict, detail, ...rest }) => rest)
writeFileSync(P('accepted.json'), JSON.stringify(clean, null, 1))
console.log(`\nwrote ${clean.length} -> accepted.json`)
