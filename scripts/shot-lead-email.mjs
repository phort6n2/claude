/**
 * Screenshot a rendered lead alert at phone width.
 *
 *   npx tsx scripts/preview-lead-email.ts /tmp/lead-email.html
 *   node scripts/shot-lead-email.mjs /tmp/lead-email.html [out.png]
 *
 * It also reports the SMALLEST rendered text in the message and how far the
 * widest element overflows the screen — the two numbers that told the story
 * when the alert's details table was arriving at half size: a value with
 * nowhere to break made the table wider than the phone, and the mail client
 * scaled it down to fit.
 */
import { chromium } from 'playwright'

const file = process.argv[2] || '/tmp/lead-email.html'
const out = process.argv[3] || '/tmp/lead-email.png'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 1400 } })
await page.goto('file://' + file, { waitUntil: 'networkidle' })

const stats = await page.evaluate(() => {
  let smallest = 999
  let widest = 0
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el)
    if (el.textContent && el.textContent.trim() && !el.children.length) {
      smallest = Math.min(smallest, parseFloat(style.fontSize))
    }
    widest = Math.max(widest, el.scrollWidth)
  }
  return { smallest, widest, viewport: document.documentElement.clientWidth }
})

await page.screenshot({ path: out, fullPage: true })
await browser.close()

console.log(`smallest rendered text: ${stats.smallest}px`)
console.log(`widest element: ${stats.widest}px against a ${stats.viewport}px screen`)
console.log(stats.widest > stats.viewport ? 'OVERFLOWS — a mail client will scale this down' : 'fits')
console.log(`wrote ${out}`)
