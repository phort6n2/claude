const { request } = require('playwright')
;(async () => {
  const ctx = await request.newContext({ proxy: { server: 'http://127.0.0.1:34685' }, ignoreHTTPSErrors: true })
  try {
    const r = await ctx.get('https://collision.glassleads.app/')
    console.log('playwright request ->', r.status(), (await r.text()).length, 'bytes')
  } catch (e) { console.log('ERR', e.message.split('\n')[0]) }
  await ctx.dispose()
})()
