/**
 * Headings on a hosted site page descend one level at a time.
 *
 *   node scripts/check-heading-order.mjs [url]      (default: the local site)
 *
 * Same reasoning as check-form-labels.mjs: the quote card is built by
 * widget.js at runtime inside a shadow DOM, so the page's real heading
 * sequence exists only in a browser and nothing in the repo shows it. The
 * card's title shipped as an h3 directly under the hero's h1 — a level
 * skipped, which is what a screen-reader user navigating by heading actually
 * trips over, and what PageSpeed's heading-order audit reported.
 *
 * Shadow roots are walked in document order along with the light DOM, because
 * that is the order the accessibility tree sees them in.
 */
import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:3111/sites/bare-shop'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
await page.goto(url, { waitUntil: 'networkidle' })
// widget.js lands about a second after the HTML and replaces the no-JS form.
await page.waitForTimeout(2500)

const headings = await page.evaluate(() => {
  const out = []
  const visit = (node) => {
    for (const child of node.children || []) {
      if (/^H[1-6]$/.test(child.tagName)) {
        const style = getComputedStyle(child)
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          out.push({ level: Number(child.tagName[1]), text: child.textContent.trim().slice(0, 52) })
        }
      }
      if (child.shadowRoot) visit(child.shadowRoot)
      visit(child)
    }
  }
  visit(document.body)
  return out
})

await browser.close()

let bad = 0
let previous = 0
for (const h of headings) {
  const skipped = previous > 0 && h.level > previous + 1
  if (skipped) bad += 1
  console.log(
    `${skipped ? 'FAIL' : 'ok  '}  h${h.level}  ${h.text}${skipped ? `  <- jumped from h${previous}` : ''}`
  )
  previous = h.level
}
if (headings.filter((h) => h.level === 1).length !== 1) {
  console.log(`FAIL  the page has ${headings.filter((h) => h.level === 1).length} h1s; it should have exactly one`)
  bad += 1
}
console.log(bad === 0 ? `\n${headings.length} headings, none skipping a level.` : `\n${bad} problem(s).`)
process.exit(bad === 0 ? 0 : 1)
