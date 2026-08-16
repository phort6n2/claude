const { chromium } = require('playwright')
const { ProxyAgent } = require('undici')
const D = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined
const OUT='/tmp/claude-0/-home-user-claude/e5c63108-be08-5a94-ba18-a25ba8f42df2/scratchpad/mob-a'
async function routeViaNode(ctx){await ctx.route('**/*',async r=>{const q=r.request();const u=q.url()
 if(u.startsWith('http://127.0.0.1'))return r.continue()
 try{const hd={...q.headers()};delete hd['accept-encoding']
  const x=await fetch(u,{method:q.method(),headers:hd,body:q.postDataBuffer()||undefined,dispatcher:D,redirect:'follow'})
  const bf=Buffer.from(await x.arrayBuffer());const h={};x.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding'].includes(k))h[k]=v})
  await r.fulfill({status:x.status,headers:h,body:bf})}catch(e){await r.abort()}})}
;(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
 const targets=[['collision','https://collision.glassleads.app/'],['a1','https://a1windshield.glassleads.app/'],['bare','http://127.0.0.1:3111/sites/bare-shop']]
 for(const [nm,url] of targets){
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})
  await routeViaNode(ctx); const p=await ctx.newPage()
  await p.goto(url,{waitUntil:'networkidle',timeout:60000}); await p.waitForTimeout(2200)
  // scroll past the form to see trust row
  const ys = await p.evaluate(()=>{
    const c=document.querySelector('[data-glassleads-widget]').getBoundingClientRect()
    return { afterForm: Math.round(c.bottom+scrollY-100), doc: document.documentElement.scrollHeight }
  })
  for (const [label, y] of [['trustrow', ys.afterForm], ['finalcta', ys.doc-1700]]) {
    await p.evaluate(v=>scrollTo(0,v), y); await p.waitForTimeout(700)
    await p.screenshot({path:`${OUT}/sec-${nm}-${label}.png`})
  }
  await ctx.close()
 }
 await b.close()
})()
