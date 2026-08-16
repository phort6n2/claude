const { chromium, request } = require('playwright')
const fs = require('fs')
const crypto = require('crypto')
const OUT = '/tmp/claude-0/-home-user-claude/e5c63108-be08-5a94-ba18-a25ba8f42df2/scratchpad/mob-b'

let api = null
async function attachRelay(page, bytes, hashes) {
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith('http://127.0.0.1') || url.startsWith('data:')) return route.continue()
    try {
      const req = route.request()
      const resp = await api.fetch(url, {
        method: req.method(),
        headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !['host', 'connection', 'accept-encoding'].includes(k.toLowerCase()))),
        maxRedirects: 5, timeout: 30000,
      })
      const body = await resp.body()
      const type = resp.headers()['content-type'] || ''
      bytes.push({ url, bytes: body.length, type: type.split(';')[0] })
      if (type.startsWith('image/')) hashes.push({ url, hash: crypto.createHash('md5').update(body).digest('hex'), bytes: body.length })
      const headers = { ...resp.headers() }
      delete headers['content-encoding']; delete headers['content-length']; delete headers['content-security-policy']
      await route.fulfill({ status: resp.status(), headers, body })
    } catch (e) { await route.abort() }
  })
}

const JOBS = [
  { name: 'collision', url: 'https://collision.glassleads.app/', shots: [12200, 13500, 14100, 14843, 15342, 15763, 16600] },
  { name: 'a1', url: 'https://a1windshield.glassleads.app/', shots: [6700, 8826, 11808, 12916, 13426, 14005, 14426] },
  { name: 'test', url: 'http://127.0.0.1:3111/sites/test-shop', shots: [10108, 10820, 11359, 11780] },
  { name: 'bare', url: 'http://127.0.0.1:3111/sites/bare-shop', shots: [6700, 7209, 7548, 7970, 8400] },
]

;(async () => {
  api = await request.newContext({ proxy: { server: process.env.HTTPS_PROXY }, ignoreHTTPSErrors: true })
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const summary = {}
  for (const j of JOBS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    const bytes = [], hashes = []
    await attachRelay(page, bytes, hashes)
    try { await page.goto(j.url, { waitUntil: 'networkidle', timeout: 60000 }) } catch (e) {}
    await page.waitForTimeout(2000)
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150))
      }
    })
    await page.waitForTimeout(2500)
    for (const y of j.shots) {
      await page.evaluate(v => window.scrollTo(0, v), y)
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${OUT}/${j.name}-deep-${y}.png` })
    }
    // duplicate-image detection
    const byHash = {}
    for (const h of hashes) { (byHash[h.hash] ||= []).push(h.url) }
    const dupes = Object.entries(byHash).filter(([, u]) => new Set(u).size > 1)
    const totalImg = bytes.filter(b => b.type.startsWith('image/')).reduce((a, b) => a + b.bytes, 0)
    const total = bytes.reduce((a, b) => a + b.bytes, 0)
    const imgs = bytes.filter(b => b.type.startsWith('image/')).sort((a, b) => b.bytes - a.bytes)
    summary[j.name] = { total, totalImg, nImg: imgs.length, top: imgs.slice(0, 12).map(i => `${(i.bytes / 1024).toFixed(0)}KB ${i.type} ${i.url.slice(-60)}`), dupes: dupes.map(([h, u]) => [...new Set(u)].map(x => x.slice(-55))) }
    await ctx.close()
  }
  console.log(JSON.stringify(summary, null, 2))
  fs.writeFileSync(`${OUT}/weight.json`, JSON.stringify(summary, null, 2))
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
