// agent-out/*.jsonl -> agent-out/*.json, which is what ingest.mjs reads.
//
// Agents append one object per line so a crash mid-run still leaves usable
// output. That also means a truncated final line is normal, and a line that
// won't parse is a dropped shop rather than a dropped batch — so report the
// count instead of throwing.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'

const DIR = new URL('./agent-out/', import.meta.url).pathname
let total = 0
let bad = 0

for (const f of readdirSync(DIR).filter((f) => f.endsWith('.jsonl'))) {
  const lines = readFileSync(DIR + f, 'utf8').split('\n')
  const rows = []
  for (const line of lines) {
    const t = line.trim().replace(/,$/, '')
    if (!t || t === '[' || t === ']') continue
    try {
      const o = JSON.parse(t)
      if (o && typeof o === 'object' && !Array.isArray(o)) rows.push(o)
      else if (Array.isArray(o)) rows.push(...o.filter((x) => x && typeof x === 'object'))
    } catch {
      bad++
    }
  }
  const out = f.replace(/\.jsonl$/, '.json')
  writeFileSync(DIR + out, JSON.stringify(rows, null, 1))
  unlinkSync(DIR + f)
  total += rows.length
  console.log(`${f}: ${rows.length} rows -> ${out}`)
}

console.log(`\ntotal ${total} rows, ${bad} unparseable lines`)
