/**
 * Every control on the quote form has an accessible name.
 *
 *   node scripts/check-form-labels.mjs [url]        (default: the local site)
 *
 * WHY A SCRIPT AND NOT AN EYEBALL. The form is built by widget.js at runtime
 * inside a shadow DOM, so nothing in the repo shows its finished markup, and
 * "does this control have a name" is invisible to anyone looking at the page
 * — the label is drawn on screen either way. The file input shipped with the
 * label pointing at the DIV around it rather than at the input, and it took
 * PageSpeed's agent-accessibility audit to notice.
 *
 * It needs the site running (see CLAUDE.md § 7), which is why it is a script
 * rather than one of the pure trap suites beside it.
 *
 * Naming follows the parts of the accname algorithm that this form can
 * actually use: aria-label, label[for], an ancestor <label>, a button's own
 * text, title. Anything hidden from the accessibility tree is skipped — the
 * honeypot is display:none and aria-hidden, and giving it a name would defeat
 * the point of it.
 */
import { chromium } from 'playwright'

const url = process.argv[2] || 'http://localhost:3111/sites/bare-shop'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
await page.goto(url, { waitUntil: 'networkidle' })
// widget.js lands about a second after the HTML and replaces the no-JS form.
await page.waitForTimeout(2500)

// Open the optional drawer first. Its fields are hidden until somebody asks
// for them, so an audit of the page as loaded — PageSpeed's included — never
// looks at the VIN, the insurance radios or the carrier select at all.
const more = page.locator('.more-btn')
if (await more.count()) {
  await more.first().click()
  await page.waitForTimeout(300)
}

const controls = await page.evaluate(() => {
  const roots = []
  const walk = (node) => {
    if (node.shadowRoot) roots.push(node.shadowRoot)
    for (const child of node.children || []) walk(child)
  }
  walk(document.body)

  const hidden = (el) => {
    for (let n = el; n && n !== document; n = n.parentElement || n.getRootNode().host) {
      if (!n.getAttribute) continue
      if (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('hidden')) return true
      const style = n.ownerDocument.defaultView.getComputedStyle(n)
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return true
    }
    return false
  }

  const out = []
  for (const scope of [document, ...roots]) {
    for (const el of scope.querySelectorAll('input, select, textarea, button')) {
      if (hidden(el)) continue
      const forLabel = el.id ? scope.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null
      const wrapping = el.closest('label')
      const name = (
        el.getAttribute('aria-label') ||
        (forLabel && forLabel.textContent) ||
        (wrapping && wrapping.textContent) ||
        (el.tagName === 'BUTTON' ? el.textContent : '') ||
        el.title ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        cls: typeof el.className === 'string' ? el.className : '',
        name: name.slice(0, 60),
      })
    }
  }
  return out
})

await browser.close()

let bad = 0
for (const c of controls) {
  if (!c.name) bad += 1
  const what = `<${c.tag}${c.type ? ' type=' + c.type : ''}${c.cls ? ' .' + c.cls.split(' ')[0] : ''}>`
  console.log(`${c.name ? 'ok  ' : 'FAIL'}  ${what.padEnd(28)} ${c.name || '(no accessible name)'}`)
}
console.log(
  bad === 0
    ? `\nAll ${controls.length} visible controls are named.`
    : `\n${bad} control(s) with no name.`
)
process.exit(bad === 0 ? 0 : 1)
