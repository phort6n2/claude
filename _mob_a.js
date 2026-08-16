const { chromium } = require('playwright')
const { ProxyAgent } = require('undici')
const fs = require('fs')

// Chromium's TLS through the session egress proxy gets reset; node's does not.
// So external requests are fetched in node and fulfilled into the page.
const DISPATCHER = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined
async function routeViaNode(ctx) {
  await ctx.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    if (url.startsWith('http://127.0.0.1')) return route.continue()
    try {
      const headers = { ...req.headers() }
      delete headers['accept-encoding']
      const r = await fetch(url, {
        method: req.method(),
        headers,
        body: req.postDataBuffer() || undefined,
        dispatcher: DISPATCHER,
        redirect: 'follow',
      })
      const buf = Buffer.from(await r.arrayBuffer())
      const h = {}
      r.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) h[k] = v
      })
      await route.fulfill({ status: r.status, headers: h, body: buf })
    } catch (e) {
      await route.abort()
    }
  })
}

const OUT = '/tmp/claude-0/-home-user-claude/e5c63108-be08-5a94-ba18-a25ba8f42df2/scratchpad/mob-a'
fs.mkdirSync(OUT, { recursive: true })

const DEVICES = [
  { name: 'iphone14', width: 390, height: 844 },
  { name: 'android', width: 360, height: 800 },
  { name: 'iphonemax', width: 430, height: 932 },
]

const TARGETS = [
  { name: 'live-collision', url: 'https://collision.glassleads.app/' },
  { name: 'live-a1', url: 'https://a1windshield.glassleads.app/' },
  { name: 'local-test', url: 'http://127.0.0.1:3111/sites/test-shop' },
  { name: 'local-bare', url: 'http://127.0.0.1:3111/sites/bare-shop' },
]

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function measure(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight
    const vw = window.innerWidth
    const out = { vh, vw, elements: [], smallTaps: [], aboveFold: [] }
    function rect(sel, label) {
      const e = document.querySelector(sel)
      if (!e) return null
      const r = e.getBoundingClientRect()
      return {
        label,
        sel,
        top: Math.round(r.top + window.scrollY),
        vtop: Math.round(r.top),
        h: Math.round(r.height),
        w: Math.round(r.width),
        bottom: Math.round(r.bottom + window.scrollY),
      }
    }
    const picks = [
      ['header.site-hdr', 'header'],
      ['h1', 'h1'],
      ['#quote', 'quote container'],
      ['[data-glassleads-widget]', 'widget mount'],
      ['[data-gl-mobilebar]', 'sticky mobile bar'],
      ['main', 'main'],
    ]
    for (const [s, l] of picks) {
      const r = rect(s, l)
      if (r) out.elements.push(r)
    }
    // util bar
    const util = document.querySelector('.gl-site > div')
    // all tappable things above the fold
    const tappables = document.querySelectorAll('a, button, input, select, textarea, [role=button]')
    for (const t of tappables) {
      const r = t.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const absTop = r.top + window.scrollY
      const txt = (t.innerText || t.getAttribute('aria-label') || t.name || '').trim().slice(0, 40).replace(/\s+/g, ' ')
      if (r.height < 44 || r.width < 44) {
        out.smallTaps.push({ tag: t.tagName, txt, h: Math.round(r.height), w: Math.round(r.width), top: Math.round(absTop) })
      }
      if (absTop < vh) {
        out.aboveFold.push({ tag: t.tagName, txt, h: Math.round(r.height), top: Math.round(absTop) })
      }
    }
    out.docHeight = document.documentElement.scrollHeight
    // text visible above fold
    out.aboveFoldText = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    return out
  })
}

async function shadowForm(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-glassleads-widget] > div')
    if (!host || !host.shadowRoot) return { mounted: false }
    const sr = host.shadowRoot
    const fields = []
    sr.querySelectorAll('input, select, textarea, button').forEach((el) => {
      const r = el.getBoundingClientRect()
      const lab = el.id ? sr.querySelector('label[for="' + el.id + '"]') : null
      fields.push({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        inputmode: el.getAttribute('inputmode'),
        autocomplete: el.getAttribute('autocomplete'),
        label: lab ? lab.innerText.trim() : null,
        h: Math.round(r.height),
        w: Math.round(r.width),
        visible: r.height > 0,
        text: (el.innerText || '').trim().slice(0, 40),
      })
    })
    const card = sr.querySelector('.card')
    const cr = card ? card.getBoundingClientRect() : null
    const btn = sr.querySelector('.btn')
    const br = btn ? btn.getBoundingClientRect() : null
    return {
      mounted: true,
      cardTop: cr ? Math.round(cr.top + window.scrollY) : null,
      cardHeight: cr ? Math.round(cr.height) : null,
      submitTop: br ? Math.round(br.top + window.scrollY) : null,
      submitH: br ? Math.round(br.height) : null,
      fields,
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const report = {}
  for (const dev of DEVICES) {
    for (const t of TARGETS) {
      const key = `${t.name}__${dev.name}`
      const ctx = await browser.newContext({
        viewport: { width: dev.width, height: dev.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: UA,
      })
      await routeViaNode(ctx)
      const page = await ctx.newPage()
      try {
        await page.goto(t.url, { waitUntil: 'networkidle', timeout: 45000 })
      } catch (e) {
        report[key] = { error: String(e).slice(0, 200) }
        await ctx.close()
        continue
      }
      await page.waitForTimeout(1800)
      await page.screenshot({ path: `${OUT}/${key}-fold.png` })
      const m = await measure(page)
      const f = await shadowForm(page)
      report[key] = { measure: m, form: f }
      // full page only for one device to save time
      if (dev.name === 'iphone14') {
        await page.screenshot({ path: `${OUT}/${key}-full.png`, fullPage: true })
        // scroll to quote form
        await page.evaluate(() => document.querySelector('#quote')?.scrollIntoView())
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${OUT}/${key}-quote.png` })
        // scroll into middle of the page to check sticky bar
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.55))
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${OUT}/${key}-mid.png` })
        report[key].barMid = await page.evaluate(() => {
          const b = document.querySelector('[data-gl-mobilebar]')
          if (!b) return null
          const r = b.getBoundingClientRect()
          const cs = getComputedStyle(b)
          return { vtop: Math.round(r.top), h: Math.round(r.height), display: cs.display, position: cs.position, bottomGap: Math.round(window.innerHeight - r.bottom), paddingBottom: cs.paddingBottom }
        })
      }
      await ctx.close()
    }
  }

  // ---- interaction pass on local only ----
  for (const slug of ['test-shop', 'bare-shop']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: UA,
    })
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:3111/sites/${slug}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const sr = page.locator('[data-glassleads-widget] > div').first()
    // submit empty to see errors
    await page.evaluate(() => {
      const host = document.querySelector('[data-glassleads-widget] > div')
      host.shadowRoot.querySelector('.btn').click()
    })
    await page.waitForTimeout(500)
    await page.evaluate(() => document.querySelector('#quote')?.scrollIntoView())
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/interact-${slug}-errors.png`, fullPage: false })
    await page.screenshot({ path: `${OUT}/interact-${slug}-errors-full.png`, fullPage: true })

    // check sticky bar while form focused
    await page.evaluate(() => {
      const host = document.querySelector('[data-glassleads-widget] > div')
      host.shadowRoot.querySelector('input[name=full_name]').focus()
    })
    await page.waitForTimeout(400)
    const barFocus = await page.evaluate(() => {
      const b = document.querySelector('[data-gl-mobilebar]')
      return b ? getComputedStyle(b).display : 'none-el'
    })
    // open drawer
    await page.evaluate(() => {
      const host = document.querySelector('[data-glassleads-widget] > div')
      host.shadowRoot.querySelector('.more-btn').click()
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/interact-${slug}-drawer.png`, fullPage: true })

    // fill and check scroll distance from top-of-form to submit
    const geom = await page.evaluate(() => {
      const host = document.querySelector('[data-glassleads-widget] > div')
      const sr = host.shadowRoot
      const set = (n, v) => { const e = sr.querySelector(`[name=${n}]`); if (e) { e.value = v } }
      set('full_name', 'Test Person')
      set('phone', '7145550142')
      set('postal_code', '92614')
      set('vehicle', '2021 Toyota RAV4')
      const card = sr.querySelector('.card').getBoundingClientRect()
      const btn = sr.querySelector('.btn').getBoundingClientRect()
      return { cardTop: Math.round(card.top + scrollY), btnTop: Math.round(btn.top + scrollY), vh: innerHeight }
    })
    report[`interact-${slug}`] = { barDisplayWhenFocused: barFocus, geom }

    // actually submit (LOCAL ONLY)
    await page.evaluate(() => {
      const host = document.querySelector('[data-glassleads-widget] > div')
      host.shadowRoot.querySelector('.btn').click()
    })
    await page.waitForTimeout(3500)
    await page.evaluate(() => document.querySelector('#quote')?.scrollIntoView())
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/interact-${slug}-success.png` })
    report[`interact-${slug}`].success = await page.evaluate(() => {
      const host = document.querySelector('[data-glassleads-widget] > div')
      const ok = host.shadowRoot.querySelector('.ok')
      const err = host.shadowRoot.querySelector('.err')
      const b = document.querySelector('[data-gl-mobilebar]')
      return {
        okText: ok ? ok.innerText.slice(0, 400) : null,
        errText: err && err.className.includes('on') ? err.innerText : null,
        barDisplay: b ? getComputedStyle(b).display : null,
      }
    })
    await ctx.close()
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2).slice(0, 200))
  await browser.close()
})()
