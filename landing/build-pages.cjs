/* Builds the service and city pages from the landing page template.
   Every page keeps the same design, form, tracking and call handling —
   only the copy, metadata and FAQ change.

   Two outputs, both generated from this one source so they cannot drift:

     quote-site/                    BASE=''  — the standalone site, served at
                                    the root of its own Vercel project and
                                    mapped to quote.hvautoglassdenver.com. The
                                    slugs match the existing Google Ads final
                                    URLs exactly.
     public/hv-auto-glass-denver/   BASE='/hv-auto-glass-denver' — the preview
                                    copy riding along with the Next.js app.
                                    Drop this once the domain is live.

   Override with the BASE and OUTDIR environment variables; `npm run
   build:landing` produces both. */

const fs = require('fs');
const path = require('path');
const { pages } = require('./pages.config.cjs');

// Live Google rating/reviews, refreshed weekly by fetch-reviews.cjs.
// Absent or unreadable => the page falls back to its neutral wording rather
// than showing invented numbers.
let REVIEWS = null;
try {
  REVIEWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'reviews.json'), 'utf8'));
  if (!REVIEWS.rating || !REVIEWS.count) REVIEWS = null;
} catch (e) { REVIEWS = null; }

const BASE = process.env.BASE !== undefined ? process.env.BASE : '/hv-auto-glass-denver';
const ORIGIN = 'https://quote.hvautoglassdenver.com';
const TEMPLATE = path.join(__dirname, 'hv-auto-glass-denver.html');
const OUTDIR = process.env.OUTDIR
  ? path.resolve(process.env.OUTDIR)
  : path.join(__dirname, '..', 'public', 'hv-auto-glass-denver');

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

// Business structured data, identical on every page bar the canonical url.
// The aggregate rating is attached only when reviews.json holds live Google
// numbers — never invented.
function businessLd(canonical){
  const ld = {
    '@context':'https://schema.org','@type':'AutoGlassShop',
    name:'HV Auto Glass Denver',
    telephone:'+1-720-232-0320',
    email:'hvautoglassdenver@gmail.com',
    url:canonical,
    image:`${ORIGIN}${BASE}/img/logo-amber.webp`,
    address:{'@type':'PostalAddress',streetAddress:'1440 Sheridan Blvd',
      addressLocality:'Denver',addressRegion:'CO',postalCode:'80214',addressCountry:'US'},
    geo:{'@type':'GeoCoordinates',latitude:39.7389384,longitude:-105.0555081},
    areaServed:['Denver','Aurora','Lakewood','Arvada','Wheat Ridge','Thornton'].map(n=>({'@type':'City',name:n})),
    openingHoursSpecification:[
      {'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday'],opens:'09:00',closes:'17:00'},
      {'@type':'OpeningHoursSpecification',dayOfWeek:'Saturday',opens:'09:00',closes:'14:00'}
    ]
  };
  if (REVIEWS && REVIEWS.rating && REVIEWS.count) {
    ld.aggregateRating = {'@type':'AggregateRating',
      ratingValue:String(REVIEWS.rating), reviewCount:String(REVIEWS.count),
      bestRating:'5', worstRating:'1'};
  }
  return ld;
}

// The home page's FAQ lives in the template rather than pages.config, so read
// the questions and answers back out of the markup we are about to ship.
function homeFaqLd(html){
  const qs = [...html.matchAll(
    /<button aria-expanded="false"><span>([\s\S]*?)<\/span>[\s\S]*?<div class="ans"><p>([\s\S]*?)<\/p>/g)];
  return {
    '@context':'https://schema.org','@type':'FAQPage',
    mainEntity: qs.map(m=>({'@type':'Question',name:strip(m[1]).trim(),
      acceptedAnswer:{'@type':'Answer',text:strip(m[2]).trim()}}))
  };
}

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
  s = s.replace('</body>',
    `<script type="application/ld+json">${JSON.stringify(businessLd(canonical))}</script>\n` +
    `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>\n</body>`);

  // --- live Google rating, count and review quotes ---
  s = applyReviews(s);

  // --- point in-page nav links at real pages, and fix the base path ---
  s = s.replace(/="\/hv-auto-glass-denver\//g, `="${BASE}/`);

  return s;
}

// Swap the rating, review count and review cards for live Google data.
// With no data file we strip the specific claims instead of inventing them.
function applyReviews(s){
  const has = !!REVIEWS;
  const rating = has ? REVIEWS.rating : null;
  const count  = has ? REVIEWS.count  : null;

  if (has) {
    s = s.split('>4.9<').join(`>${rating}<`);
    s = s.replace('<span class="big">4.9<span class="rating-stars">',
                  `<span class="big">${rating}<span class="rating-stars">`);
    s = s.replace(/200\+ Google reviews/g, `${count} Google reviews`);
    s = s.replace(/Based on 200\+ verified Google reviews · Since 2018/g,
                  `Based on ${count} verified Google reviews · Since 2018`);
    s = s.replace(/Denver drivers rate us 4\.9 stars/g,
                  `Denver drivers rate us ${rating} stars`);
  } else {
    // No live data yet: strip every unverifiable specific rather than shipping
    // invented ratings or testimonials, which is both a credibility problem and
    // a Google Ads policy risk.
    s = s.replace('<span class="big">4.9<span class="rating-stars"> \u2605\u2605\u2605\u2605\u2605</span></span><small>200+ Google reviews</small>',
                  '<span class="big">Google reviewed</span><small>Rated by Denver drivers</small>');
    s = s.replace('Based on 200+ verified Google reviews \u00b7 Since 2018',
                  'Verified Google reviews \u00b7 Serving Denver since 2018');
    s = s.replace('Denver drivers rate us 4.9 stars', 'What Denver drivers say');
    s = s.replace('<div class="score">4.9</div>', '');
    s = s.replace(">4.9<", ">&nbsp;<");
    // stars imply a rating we can't yet substantiate
    s = s.replace('<span class="rating-stars" style="font-size:16px">\u2605\u2605\u2605\u2605\u2605</span>', '');

    // Swap the sample testimonials for a link to the real Google listing
    const a0 = s.indexOf('<div class="rev-cards">');
    if (a0 !== -1) {
      const b0 = s.indexOf('\n        </div>', a0);
      if (b0 !== -1) {
        s = s.slice(0, a0) + `<div class="rev-cards">
          <div class="rev">
            <p style="font-size:15.5px;color:var(--ink);margin-bottom:14px">Read what Denver drivers say about us in their own words \u2014 every review, unedited, on our Google listing.</p>
            <a class="btn btn-ghost" href="https://maps.google.com/?cid=13934619566903784372" target="_blank" rel="noopener">See our Google reviews \u2192</a>
          </div>` + s.slice(b0);
      }
    }
  }

  // Replace the three placeholder review cards with real ones when we have them
  if (has && REVIEWS.reviews && REVIEWS.reviews.length) {
    const colors = ['#5AD1F0','#FFC53D','#4ADE80'];
    const cards = REVIEWS.reviews.map((r,i)=>{
      const initials = r.author.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const stars = '★'.repeat(Math.round(r.rating));
      const text = strip(r.text).replace(/"/g,'&quot;');
      return `          <div class="rev">
            <div class="rev-top">
              <div class="rev-av" style="background:${colors[i%3]}">${esc(initials)}</div>
              <div><div class="rev-nm">${esc(r.author)}</div><div class="rev-meta">${esc(r.when)}</div></div>
              <div class="rev-stars">${stars}</div>
            </div>
            <p>&ldquo;${text}&rdquo;</p>
            <div class="verified"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>Verified Google review</div>
          </div>`;
    }).join('\n');
    const a = s.indexOf('<div class="rev-cards">');
    if (a !== -1) {
      const b = s.indexOf('\n        </div>', a);
      if (b !== -1) s = s.slice(0,a) + '<div class="rev-cards">\n' + cards + s.slice(b);
    }
  }
  return s;
}

// The nav and footer links in the template are real hrefs, so no relinking is
// needed — only the BASE prefix is rewritten, which build() already does.

// A crawlable link to every page, so nothing depends on a stale sitemap.
function sitemapUrls(){
  return [`${ORIGIN}/`, ...pages.map(p=>`${ORIGIN}/${p.slug}`),
          `${ORIGIN}/privacy`, `${ORIGIN}/terms`];
}

let n = 0;
for (const p of pages){
  const dir = path.join(OUTDIR, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), build(p));
  n++;
}

// --- Home page -------------------------------------------------------------
// It gets the same head treatment as every other page. Previously it shipped
// with no canonical, no Open Graph tags and no structured data, which made the
// most important page in the account the weakest one technically.
{
  let home = fs.readFileSync(TEMPLATE, 'utf8');
  const canonical = `${ORIGIN}/`;
  const title = (home.match(/<title>([\s\S]*?)<\/title>/) || [,''])[1];
  const desc  = (home.match(/<meta name="description" content="([\s\S]*?)">/) || [,''])[1];

  home = home.replace('<meta name="theme-color" content="#0B0E12">',
    `<meta name="theme-color" content="#0B0E12">\n<link rel="canonical" href="${canonical}">\n` +
    `<meta property="og:title" content="${title}">\n` +
    `<meta property="og:description" content="${desc}">\n` +
    `<meta property="og:type" content="website">\n<meta property="og:url" content="${canonical}">`);

  home = home.replace('</body>',
    `<script type="application/ld+json">${JSON.stringify(businessLd(canonical))}</script>\n` +
    `<script type="application/ld+json">${JSON.stringify(homeFaqLd(home))}</script>\n</body>`);

  home = applyReviews(home);
  home = home.replace(/="\/hv-auto-glass-denver\//g, `="${BASE}/`);
  fs.writeFileSync(path.join(OUTDIR, 'index.html'), home);
}

// --- Legal pages: canonical + robots, built from the standalone sources -----
for (const [src, slug] of [['legal-privacy.html','privacy'], ['legal-terms.html','terms']]) {
  const from = path.join(__dirname, src);
  if (!fs.existsSync(from)) continue;
  let h = fs.readFileSync(from, 'utf8');
  const canonical = `${ORIGIN}/${slug}`;
  if (!/rel="canonical"/.test(h)) {
    h = h.replace('</head>', `<link rel="canonical" href="${canonical}">\n</head>`);
  }
  // Match the bare "/hv-auto-glass-denver" home link as well as prefixed
  // paths, so BASE='' rewrites it to "/" rather than leaving it dangling.
  h = h.replace(/="\/hv-auto-glass-denver(?=["/])/g, `="${BASE || '/'}`)
       .replace(/="\/hv-auto-glass-denver\//g, `="${BASE}/`);
  const dir = path.join(OUTDIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), h);
}

// --- Vercel static config -------------------------------------------------
// Only meaningful for the standalone build, which is the root of its own
// Vercel project. Harmless in the preview copy, which sits inside public/.
if (BASE === '') {
  fs.copyFileSync(path.join(__dirname, 'vercel-static.json'), path.join(OUTDIR, 'vercel.json'));
}

// --- images ---------------------------------------------------------------
// landing/img is the source of truth; each build target gets its own copy so
// the output directory is self-contained and can be served on its own.
{
  const from = path.join(__dirname, 'img');
  const to = path.join(OUTDIR, 'img');
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
}

// --- sitemap.xml + robots.txt ---------------------------------------------
fs.writeFileSync(path.join(OUTDIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapUrls().map(u=>`  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);
fs.writeFileSync(path.join(OUTDIR, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

console.log(`built ${n} pages + home, legal, sitemap into ${OUTDIR} (BASE="${BASE}")`);
