// Corroborate agent-sourced listings against the shop's own website.
//
// The validator in ingest.mjs catches listings that are malformed, duplicated,
// a chain, or obviously boilerplate. What it cannot catch is a listing that is
// well-formed and entirely invented — which has happened, and reached
// production once.
//
// This closes that gap the only way it can be closed: go and look. Fetch the
// site the agent cited and check the business actually claims that phone
// number or that name. A fabricated shop fails because the domain doesn't
// resolve, or resolves to something with no connection to the listing.
//
// Verdicts:
//   confirmed  site is live and carries the phone (strongest signal)
//   named      site is live and carries the business name
//   weak       site is live but corroborates neither — needs a human look
//   dead       domain doesn't resolve, or returns 4xx/5xx
//   nosite     no website given; nothing to check here
import { readFileSync, writeFileSync } from 'node:fs'

const IN = process.argv[2]
const OUT = process.argv[3]
if (!IN || !OUT) throw new Error('usage: node verify-live.mjs <in.json> <out.json>')

const rows = JSON.parse(readFileSync(IN, 'utf8'))
const CONCURRENCY = 12
const TIMEOUT_MS = 12000

const digits = (s) => (s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')

/** Distinctive words from a business name — drops the ones every shop shares. */
function nameTokens(name) {
  const stop = new Set([
    'auto', 'glass', 'windshield', 'window', 'repair', 'replacement', 'mobile',
    'service', 'services', 'the', 'and', 'inc', 'llc', 'co', 'company', 'of',
  ])
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
}

async function check(row) {
  if (!row.website) return { ...row, verdict: 'nosite' }
  let url = row.website.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        // Some small-business hosts refuse an empty UA outright.
        'User-Agent':
          'Mozilla/5.0 (compatible; WindshieldRepairHQ-DirectoryBot/1.0; +https://windshieldrepairhq.com)',
      },
    })
    if (!res.ok) {
      // A firewall refusing an unknown bot says nothing about whether the
      // business exists — and most small-business hosts do exactly that.
      // Only "this resource is not here" counts as evidence against a listing.
      const gone = res.status === 404 || res.status === 410
      return {
        ...row,
        verdict: gone ? 'dead' : 'blocked',
        detail: `HTTP ${res.status}`,
      }
    }
    const html = (await res.text()).slice(0, 400_000)
    const flat = html.toLowerCase()
    // Strip separators so "(713) 555-0111" and "713.555.0111" both match.
    const flatDigits = html.replace(/[^\d]/g, '')

    if (row.phone && digits(row.phone).length === 10 && flatDigits.includes(digits(row.phone))) {
      return { ...row, verdict: 'confirmed' }
    }
    const toks = nameTokens(row.name)
    const hits = toks.filter((t) => flat.includes(t)).length
    if (toks.length && hits >= Math.min(2, toks.length)) {
      return { ...row, verdict: 'named' }
    }
    return { ...row, verdict: 'weak' }
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timeout' : String(err?.cause?.code || err?.message || err)
    // NXDOMAIN is the real signal: nobody has ever registered this host, so a
    // listing citing it cannot be genuine. A timeout or a transient resolver
    // failure is just a slow server.
    const nx = /ENOTFOUND|NXDOMAIN/i.test(msg)
    return { ...row, verdict: nx ? 'dead' : 'blocked', detail: msg }
  } finally {
    clearTimeout(timer)
  }
}

const out = []
let cursor = 0
async function worker() {
  while (cursor < rows.length) {
    const i = cursor++
    out[i] = await check(rows[i])
    if (out.filter(Boolean).length % 50 === 0) {
      process.stderr.write(`  ${out.filter(Boolean).length}/${rows.length}\n`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const tally = {}
for (const r of out) tally[r.verdict] = (tally[r.verdict] || 0) + 1
console.log('verdicts:', tally)

writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log(`wrote ${out.length} → ${OUT}`)
