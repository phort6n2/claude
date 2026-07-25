/* Builds the service and city pages from the landing page template.
   Every page keeps the same design, form, tracking and call handling —
   only the copy, metadata and FAQ change.

   BASE is the path prefix the site is served from. On the Vercel preview the
   mini-site lives under /hv-auto-glass-denver. Once quote.hvautoglassdenver.com
   points at the site root, set BASE to '' and rebuild — the slugs themselves
   already match the existing Google Ads final URLs. */

const fs = require('fs');
const path = require('path');
const { pages } = require('./pages.config.cjs');

const BASE = process.env.BASE !== undefined ? process.env.BASE : '/hv-auto-glass-denver';
const ORIGIN = 'https://quote.hvautoglassdenver.com';
const TEMPLATE = path.join(__dirname, 'hv-auto-glass-denver.html');
const OUTDIR = path.join(__dirname, '..', 'public', 'hv-auto-glass-denver');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const strip = s => String(s).replace(/<[^>]+>/g,'');

function cut(src, startMark, endMark, label){
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a + 1);
  if (a === -1 || b === -1) throw new Error('Could not locate ' + label);
  return [a, b];
}

function buildIntro(p){
  const bullets = p.intro.bullets.map(b => `        <li>${b}</li>`).join('\n');
  const paras = p.intro.paras.map(x => `        <p>${x}</p>`).join('\n');
  return `
<!-- ================= SERVICE DETAIL ================= -->
<section class="section-pad" id="detail">
  <div class="wrap">
    <div class="detail-grid">
      <div class="detail-copy">
        <span class="eyebrow cyan">${esc(p.eyebrow)}</span>
        <h2>${p.intro.heading}</h2>
${paras}
      </div>
      <ul class="detail-list">
${bullets}
      </ul>
    </div>
  </div>
</section>
`;
}

function buildFaq(p){
  return p.faq.map(([q,a]) => `      <div class="faq">
        <button aria-expanded="false"><span>${q}</span><span class="plus"></span></button>
        <div class="ans"><p>${a}</p></div>
      </div>`).join('\n');
}

// Styles for the service-detail block, appended to the template's stylesheet.
const DETAIL_CSS = `
  /* ===== Service detail block (service & city pages) ===== */
  .detail-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:46px;align-items:start}
  @media(max-width:860px){.detail-grid{grid-template-columns:1fr;gap:28px}}
  .detail-copy h2{font-size:clamp(24px,3.2vw,34px);margin:16px 0 16px}
  .detail-copy p{color:var(--muted);font-size:16.5px;margin-bottom:16px;max-width:62ch}
  .detail-copy p:last-child{margin-bottom:0}
  .detail-list{list-style:none;margin:0;padding:26px 28px;display:flex;flex-direction:column;gap:14px;
    background:var(--surface);border:1px solid var(--border);border-radius:var(--r)}
  .detail-list li{position:relative;padding-left:30px;color:var(--ink);font-size:15.5px;line-height:1.55}
  .detail-list li::before{content:"";position:absolute;left:0;top:7px;width:16px;height:16px;border-radius:50%;
    background:rgba(74,222,128,.14);
    box-shadow:inset 0 0 0 1.5px var(--success)}
  .detail-list li::after{content:"";position:absolute;left:5px;top:11px;width:6px;height:3px;
    border-left:1.5px solid var(--success);border-bottom:1.5px solid var(--success);transform:rotate(-45deg)}
`;

function build(p){
  let s = fs.readFileSync(TEMPLATE, 'utf8');
  const canonical = `${ORIGIN}/${p.slug}`;

  // --- head ---
  s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)}</title>`);
  s = s.replace(/<meta name="description" content="[\s\S]*?">/,
                `<meta name="description" content="${esc(p.desc)}">`);
  s = s.replace('<meta name="theme-color" content="#0B0E12">',
    `<meta name="theme-color" content="#0B0E12">\n<link rel="canonical" href="${canonical}">\n` +
    `<meta property="og:title" content="${esc(p.title)}">\n` +
    `<meta property="og:description" content="${esc(p.desc)}">\n` +
    `<meta property="og:type" content="website">\n<meta property="og:url" content="${canonical}">`);

  // --- hero ---
  s = s.replace('<span class="eyebrow">Denver\'s Trusted Mobile Auto Glass Shop</span>',
                `<span class="eyebrow">${esc(p.eyebrow)}</span>`);
  s = s.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${p.h1}</h1>`);
  s = s.replace(/<p class="sub">[\s\S]*?<\/p>/, `<p class="sub">${p.sub}</p>`);

  // Preselect the matching service so the form arrives pre-filled
  if (p.svc) {
    s = s.replace(`<option>${p.svc}</option>`, `<option selected>${p.svc}</option>`);
  }

  // --- styles ---
  s = s.replace('</style>', DETAIL_CSS + '</style>');

  // --- insert the service detail section before SERVICES ---
  const SERVICES_MARK = '<!-- ================= SERVICES ================= -->';
  s = s.replace(SERVICES_MARK, buildIntro(p) + '\n' + SERVICES_MARK);

  // --- swap the FAQ items ---
  const [fa, fb] = cut(s, '<div class="faq-wrap">', '    </div>\n  </div>\n</section>', 'FAQ block');
  s = s.slice(0, fa) + '<div class="faq-wrap">\n' + buildFaq(p) + '\n' + s.slice(fb);

  // --- FAQ structured data helps Google understand the page ---
  const faqLd = {
    '@context':'https://schema.org','@type':'FAQPage',
    mainEntity: p.faq.map(([q,a])=>({'@type':'Question',name:strip(q),
      acceptedAnswer:{'@type':'Answer',text:strip(a)}}))
  };
  const bizLd = {
    '@context':'https://schema.org','@type':'AutoGlassShop',
    name:'HV Auto Glass Denver', telephone:'+1-720-232-0320',
    url:canonical, areaServed:'Denver, Colorado',
    address:{'@type':'PostalAddress',addressLocality:'Denver',addressRegion:'CO',addressCountry:'US'}
  };
  s = s.replace('</body>',
    `<script type="application/ld+json">${JSON.stringify(bizLd)}</script>\n` +
    `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>\n</body>`);

  // --- point in-page nav links at real pages, and fix the base path ---
  s = s.replace(/href="\/hv-auto-glass-denver\//g, `href="${BASE}/`);

  return s;
}

// Footer service links should go to the real pages rather than an anchor.
function relinkFooter(s){
  const map = [
    ['Windshield replacement','windshield-replacement'],
    ['Rock chip &amp; crack repair','rock-chip-repair'],
    ['ADAS calibration','adas-calibration'],
    ['Door &amp; back glass','back-glass-repair'],
    ['Mobile service','mobile-service'],
    ['Denver','windshield-replacement'],
    ['Aurora','auto-glass-repair-aurora'],
    ['Lakewood','auto-glass-repair-lakewood'],
    ['Arvada · Wheat Ridge','auto-glass-repair-arvada'],
    ['Thornton','auto-glass-repair-thornton'],
  ];
  map.forEach(([label,slug])=>{
    s = s.replace(`<a href="#services">${label}</a>`, `<a href="${BASE}/${slug}">${label}</a>`);
    s = s.replace(`<a href="#reviews">${label}</a>`, `<a href="${BASE}/${slug}">${label}</a>`);
  });
  return s;
}

let n = 0;
for (const p of pages){
  const dir = path.join(OUTDIR, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), relinkFooter(build(p)));
  n++;
}

// Rebuild the home page too, so its footer links point at the new pages.
{
  let home = fs.readFileSync(TEMPLATE, 'utf8');
  home = home.replace(/href="\/hv-auto-glass-denver\//g, `href="${BASE}/`);
  fs.writeFileSync(path.join(OUTDIR, 'index.html'), relinkFooter(home));
}

console.log(`built ${n} pages into ${OUTDIR} (BASE="${BASE}")`);
