/**
 * The brand-colour rules, against the hues that actually break them.
 *
 *   npx tsx scripts/check-brand-color.ts
 *
 * The portal is themed with a colour an operator types into a text field, and
 * the shell used to hand that same raw hex to three incompatible jobs: the
 * fill behind white text, the colour OF text on white, and a pale wash. A
 * navy shop looked perfect, so nothing ever surfaced it — a yellow one had
 * unreadable links and an invisible wash.
 *
 * There is no test runner in this repo. This is a script on purpose — it
 * imports the real functions and exits non-zero when one of them is wrong.
 */
import {
  normalizeHex,
  contrast,
  onBrand,
  readableInk,
  brandVariables,
} from '@/lib/brand-color'

let bad = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
}

// The hues a shop actually picks, including the ones that were broken.
const BRANDS: Array<[string, string]> = [
  ['navy (safe already)', '#1e40af'],
  ['bright yellow', '#ffd400'],
  ['safety orange', '#ff6a00'],
  ['lime', '#a3e635'],
  ['red', '#dc2626'],
  ['near-black', '#111111'],
  ['white', '#ffffff'],
  ['cyan', '#22d3ee'],
  ['hot pink', '#ec4899'],
  ['forest', '#166534'],
]

console.log('--- ink is readable on white, for every hue ---')
for (const [name, hex] of BRANDS) {
  const ink = readableInk(hex)
  const ratio = contrast(ink, '#ffffff')
  check(`${name}: ink ${ink} on white = ${ratio.toFixed(2)}:1`, ratio >= 4.5, 'below AA for body text')
}

console.log('\n--- text ON the solid brand is legible, for every hue ---')
for (const [name, hex] of BRANDS) {
  const on = onBrand(hex)
  const ratio = contrast(on, hex)
  check(`${name}: ${on} on ${hex} = ${ratio.toFixed(2)}:1`, ratio >= 4.4, 'white was hardcoded here before')
}

console.log('\n--- the ink keeps the hue rather than becoming a generic dark ---')
// A yellow shop should get a dark gold, not navy: red stays the dominant
// channel through the darkening.
const gold = readableInk('#ffd400')
const [gr, gg, gb] = [1, 3, 5].map((i) => parseInt(gold.slice(i, i + 2), 16))
check(`yellow ink ${gold} is still warm`, gr >= gg && gg > gb, `r${gr} g${gg} b${gb}`)

console.log('\n--- a garbage value falls back rather than throwing ---')
for (const junk of ['', null, undefined, 'blue', '#12', 'rgb(1,2,3)', '#zzzzzz']) {
  const out = normalizeHex(junk as string)
  check(`${JSON.stringify(junk)} -> ${out}`, /^#[0-9a-f]{6}$/.test(out))
}
check('#ABC expands', normalizeHex('#ABC') === '#aabbcc', normalizeHex('#ABC'))
check('already valid is kept', normalizeHex('#1E40AF') === '#1e40af')

console.log('\n--- every variable is a usable CSS colour ---')
for (const [name, hex] of BRANDS) {
  const vars = brandVariables(hex)
  const allValid = Object.values(vars).every((v) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v))
  check(`${name}: ${Object.keys(vars).length} variables`, allValid, JSON.stringify(vars))
}

console.log(bad === 0 ? '\nALL CASES PASS' : `\n${bad} CASE(S) FAILED`)
process.exit(bad === 0 ? 0 : 1)
