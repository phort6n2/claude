const { chromium } = require('playwright')
const { ProxyAgent } = require('undici')
const D = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined
async function rv(ctx){await ctx.route('**/*',async r=>{const q=r.request();const u=q.url()
 if(u.startsWith('http://127.0.0.1'))return r.continue()
 try{const hd={...q.headers()};delete hd['accept-encoding']
  const x=await fetch(u,{method:q.method(),headers:hd,dispatcher:D,redirect:'follow'})
  const bf=Buffer.from(await x.arrayBuffer());const h={};x.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding'].includes(k))h[k]=v})
  await r.fulfill({status:x.status,headers:h,body:bf})}catch(e){await r.abort()}})}
;(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
 for(const w of [360,390,430]){
  for(const [nm,url] of [['a1','https://a1windshield.glassleads.app/'],['collision','https://collision.glassleads.app/'],['bare','http://127.0.0.1:3111/sites/bare-shop']]){
   const ctx=await b.newContext({viewport:{width:w,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})
   await rv(ctx); const p=await ctx.newPage()
   await p.goto(url,{waitUntil:'networkidle',timeout:60000}); await p.waitForTimeout(1500)
   console.log(w, nm, JSON.stringify(await p.evaluate(()=>{
     const wm=document.querySelector('header .truncate')
     const util=document.querySelector('.gl-site .truncate')
     const reviewsCount=document.querySelector('header .min-\\[390px\\]\\:inline')
     return { wordmark: wm?{t:wm.innerText,cut:wm.scrollWidth>wm.clientWidth+1}:'logo-img',
       util: util?{t:util.innerText.slice(0,50),cut:util.scrollWidth>util.clientWidth+1}:null,
       utilVisible: !!(util && util.offsetParent) }
   }))))
   await ctx.close()
  }
 }
 await b.close()
})()
