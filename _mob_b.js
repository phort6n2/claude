const { chromium, request } = require('playwright')
const fs = require('fs')

// Chromium has no outbound network in this sandbox (ERR_CONNECTION_RESET even
// through the agent proxy), but the Node-side APIRequestContext does. So every
// non-localhost request is fulfilled from Node.
let api = null
async function attachRelay(page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith('http://127.0.0.1') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue()
    }
    try {
      const req = route.request()
      const resp = await api.fetch(url, {
        method: req.method(),
        headers: Object.fromEntries(
          Object.entries(req.headers()).filter(([k]) => !['host', 'connection', 'accept-encoding'].includes(k.toLowerCase()))
        ),
        ...(req.postDataBuffer() ? { data: req.postDataBuffer() } : {}),
        maxRedirects: 5,
        timeout: 30000,
      })
      const headers = { ...resp.headers() }
      delete headers['content-encoding']
      delete headers['content-length']
      delete headers['content-security-policy']
      await route.fulfill({ status: resp.status(), headers, body: await resp.body() })
    } catch (e) {
      await route.abort()
    }
  })
}

const OUT = '/tmp/claude-0/-home-user-claude/e5c63108-be08-5a94-ba18-a25ba8f42df2/scratchpad/mob-b'

const TARGETS = [
  { name: 'collision', url: 'https://collision.glassleads.app/' },
  { name: 'a1', url: 'https://a1windshield.glassleads.app/' },
  { name: 'test', url: 'http://127.0.0.1:3111/sites/test-shop' },
  { name: 'bare', url: 'http://127.0.0.1:3111/sites/bare-shop' },
]

const PROFILES = [
  { w: 390, h: 844, tag: '390' },
  { w: 360, h: 800, tag: '360' },
  { w: 430, h: 932, tag: '430' },
]

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const out = { pageHeight: doc.scrollHeight, vw: window.innerWidth, sections: [] }
    // main landmark sections
    const secs = Array.from(document.querySelectorAll('main section, main > *, footer'))
    const seen = new Set()
    for (const el of secs) {
      if (seen.has(el)) continue
      seen.add(el)
      const r = el.getBoundingClientRect()
      const top = Math.round(r.top + window.scrollY)
      const h = Math.round(r.height)
      if (h < 20) continue
      // label: first eyebrow / h2 / h1
      const eye = el.querySelector('p.uppercase, h2, h1')
      let label = eye ? eye.textContent.trim().slice(0, 60) : el.tagName.toLowerCase()
      out.sections.push({ tag: el.tagName.toLowerCase(), label, top, h })
    }
    // CTAs
    out.ctas = Array.from(document.querySelectorAll('a[href^="tel:"], a[href="#quote"], a[href^="sms:"]')).map(a => {
      const r = a.getBoundingClientRect()
      return {
        href: a.getAttribute('href').slice(0, 30),
        text: a.textContent.trim().slice(0, 40),
        top: Math.round(r.top + window.scrollY),
        w: Math.round(r.width), h: Math.round(r.height),
        sticky: !!a.closest('[data-gl-mobilebar]') || !!a.closest('header'),
      }
    })
    // images
    out.images = Array.from(document.images).map(i => ({
      src: (i.currentSrc || i.src).slice(-70),
      natural: i.naturalWidth + 'x' + i.naturalHeight,
      css: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height),
      loading: i.loading,
      top: Math.round(i.getBoundingClientRect().top + window.scrollY),
    }))
    // horizontal overflow
    out.overflowX = doc.scrollWidth > window.innerWidth ? doc.scrollWidth : 0
    const wide = []
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.width > window.innerWidth + 1 || r.right > window.innerWidth + 1) {
        wide.push({ t: el.tagName, c: (el.className || '').toString().slice(0, 60), right: Math.round(r.right), w: Math.round(r.width) })
      }
    })
    out.wide = wide.slice(0, 12)
    // small tap targets among links/buttons/summary
    out.smallTaps = []
    document.querySelectorAll('a, button, summary, input, select, textarea').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (r.height < 44) {
        out.smallTaps.push({
          t: el.tagName, txt: el.textContent.trim().slice(0, 32),
          h: Math.round(r.height), w: Math.round(r.width),
          top: Math.round(r.top + window.scrollY),
        })
      }
    })
    // font sizes of body copy
    const fs = {}
    document.querySelectorAll('p, h1, h2, h3, li, blockquote, summary, span').forEach(el => {
      if (!el.textContent.trim()) return
      const s = getComputedStyle(el)
      const k = el.tagName + ':' + s.fontSize
      fs[k] = (fs[k] || 0) + 1
    })
    out.fontSizes = fs
    return out
  })
}

async function run() {
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy
  api = await request.newContext({ proxy: { server: proxyServer }, ignoreHTTPSErrors: true })
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const report = {}
  for (const t of TARGETS) {
    report[t.name] = {}
    for (const p of PROFILES) {
      const ctx = await browser.newContext({
        viewport: { width: p.w, height: p.h },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      })
      const page = await ctx.newPage()
      await attachRelay(page)
      try {
        await page.goto(t.url, { waitUntil: 'networkidle', timeout: 60000 })
      } catch (e) {
        try { await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 }) } catch (e2) {}
      }
      await page.waitForTimeout(2500)
      // force lazy images to load by scrolling through
      await page.evaluate(async () => {
        const step = window.innerHeight
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(1500)
      const m = await measure(page)
      report[t.name][p.tag] = m
      // full page screenshot
      await page.screenshot({ path: `${OUT}/${t.name}-${p.tag}-full.png`, fullPage: true })
      // viewport slices every screen-height, only at 390
      if (p.tag === '390' || p.tag === '360') {
        const slices = Math.min(14, Math.ceil(m.pageHeight / p.h))
        for (let i = 0; i < slices; i++) {
          await page.evaluate(y => window.scrollTo(0, y), i * p.h)
          await page.waitForTimeout(350)
          await page.screenshot({ path: `${OUT}/${t.name}-${p.tag}-v${String(i).padStart(2, '0')}.png` })
        }
      }
      await ctx.close()
    }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  // console summary
  for (const [n, prof] of Object.entries(report)) {
    for (const [tag, m] of Object.entries(prof)) {
      console.log(`\n=== ${n} @ ${tag}px — page ${m.pageHeight}px (${(m.pageHeight / (tag === '360' ? 800 : tag === '430' ? 932 : 844)).toFixed(1)} screens) overflowX=${m.overflowX}`)
      if (tag !== '390') continue
      m.sections.forEach(s => console.log(`   ${String(s.top).padStart(6)}  h=${String(s.h).padStart(5)}  ${s.tag}  ${s.label.replace(/\s+/g, ' ')}`))
      console.log('  CTAs:')
      m.ctas.forEach(c => console.log(`   ${String(c.top).padStart(6)} ${c.w}x${c.h} ${c.sticky ? '[sticky]' : ''} ${c.href} "${c.text.replace(/\s+/g, ' ')}"`))
      console.log('  IMAGES:')
      m.images.forEach(i => console.log(`   ${String(i.top).padStart(6)} nat=${i.natural} css=${i.css} ${i.loading} ${i.src}`))
      console.log('  SMALL TAPS (<44px):')
      m.smallTaps.slice(0, 40).forEach(s => console.log(`   ${String(s.top).padStart(6)} ${s.w}x${s.h} ${s.t} "${s.txt.replace(/\s+/g, ' ')}"`))
      if (m.wide.length) { console.log('  WIDE:'); m.wide.forEach(w => console.log(`   ${w.t} r=${w.right} w=${w.w} ${w.c}`)) }
    }
  }
  await browser.close()
}
run().catch(e => { console.error(e); process.exit(1) })
