# Local-service landing site — build playbook

A reusable spec for building a Google Ads landing site for a local service
business: a static, multi-page mini-site with a custom lead form, first-party
Google Ads conversion reporting, HighLevel (GHL) integration, and Google
reviews that refresh themselves weekly.

Built and proven for HV Auto Glass Denver. Everything below is generic apart
from the worked examples. **Each business gets its own Vercel project and its
own domain.**

Paste this whole document into a new chat, fill in the intake form in §2, and
say "build this".

---

## 1. What you get

| | |
|---|---|
| **Stack** | Plain static HTML/CSS/JS. No framework, no build step beyond one Node script. |
| **Pages** | One home page plus one page per service and per city, on slugs that match the existing Google Ads final URLs. Plus Privacy and Terms. |
| **Form** | Custom-built, styled to the page. Posts to a GHL Inbound Webhook. |
| **Conversions** | Fired from the page via `gtag`, with enhanced conversions and the click ID. Not dependent on a CRM automation. |
| **Attribution** | 8 ad click IDs + 5 UTMs, persisted for the session, sent with every lead. |
| **Calls** | GHL number pool (dynamic number insertion) for tracked calls, plus a fixed Google call-asset number in the footer that must never be swapped. |
| **Reviews** | Real Google rating, count and quotes, pulled once a week by a GitHub Action and baked into the HTML. One API call per week; the key never reaches the browser. |
| **SEO/Ads** | Per-page canonical, Open Graph, `LocalBusiness` + `FAQPage` structured data, sitemap, robots, full internal linking. |
| **Perf** | Lighthouse ~96–100 across all four categories. LCP ~1.3s mobile. |

**Hosting model:** one Vercel project per business, root directory pointed at
the generated site folder, framework preset **Other**, no build command. Static
files only — deploys take seconds and cost nothing to build.

---

## 2. Intake — fill this in before starting

```
BUSINESS
  Name                    e.g. HV Auto Glass Denver
  Primary phone           the number shown on the page (gets swapped by DNI)
  Google call asset       second number, FOOTER ONLY, never swapped   [optional]
  Email
  Street address          verify it — see Gotcha #1
  City, State, ZIP
  Lat/long                for structured data
  Hours                   per day; state closures explicitly
  Year established
  Google Place ID         see Gotcha #1 before trusting it
  Google Maps CID         for the "read our reviews" link

DOMAIN
  Final domain            e.g. quote.example.com
  Existing site           crawl it — slugs must match existing Ads final URLs

GOOGLE ADS
  Conversion ID           AW-XXXXXXXXXX
  Conversion label        the part after the slash
  Average lead value      or 0
  GA4 ID                  optional

HIGHLEVEL
  Inbound webhook URL     services.leadconnectorhq.com/hooks/<loc>/webhook-trigger/<id>
  Location ID
  Number pool ID          optional, for call tracking

CONTENT
  Services                one page each
  Cities                  one page each — needs genuinely distinct local detail
  Real photos             actual job photos, not stock
  Logo                    light and dark variants
  Claims                  ONLY ones the owner can substantiate — see Gotcha #6
```

---

## 3. Repository layout

```
landing/
  <business>.html          master template — the home page, and the shell every
                           other page is generated from
  pages.config.cjs         all page content: slug, title, desc, h1, sub, body,
                           bullets, FAQ — one entry per page
  build-pages.cjs          generator
  fetch-reviews.cjs        weekly Google Places fetch
  make-ico.cjs             builds favicon.ico from PNGs
  reviews.json             generated; committed by the weekly Action
  legal-privacy.html       standalone
  legal-terms.html         standalone
  vercel-static.json       copied into the output as vercel.json
  img/                     source images, logo, favicon set

<output-dir>/              GENERATED — never edit by hand
  index.html
  <slug>/index.html        one per page
  privacy/ terms/
  img/  favicon.ico  site.webmanifest  sitemap.xml  robots.txt  vercel.json

.github/workflows/refresh-reviews.yml
```

`package.json`:

```json
"build:landing": "node landing/build-pages.cjs"
```

**The output directory must NOT live inside another app's `public/`.** If it
does, the site becomes reachable from that app's domain, which is duplicate
content you don't control. Keep it at the repo root.

---

## 4. Tracking

### 4.1 Config block — the only place IDs are pasted

Put this near the top of `<head>`, before anything else:

```html
<script>
  window.HV_CONFIG = {
    GOOGLE_ADS_ID:    "AW-XXXXXXXXXX",   // Ads → Tools → Conversions → your
    GOOGLE_ADS_LABEL: "AbC-D_efGh12",    // action → Tag setup → Use Google tag
    GA4_ID: "",                          // optional
    LEAD_VALUE: 0,
    CURRENCY: "USD"
  };

  (function(){
    var c = window.HV_CONFIG;
    var primary = c.GOOGLE_ADS_ID || c.GA4_ID;
    if(!primary) return;                 // nothing configured → no-op
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    gtag('js', new Date());
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(primary);
    document.head.appendChild(s);
    if(c.GOOGLE_ADS_ID){
      gtag('config', c.GOOGLE_ADS_ID, { allow_enhanced_conversions: true });
    }
    if(c.GA4_ID){ gtag('config', c.GA4_ID); }
  })();
</script>
```

Guard on empty config so the page is safe to deploy before IDs exist.

### 4.2 Attribution capture

```js
var ATTR_KEYS = ['gclid','gbraid','wbraid','gclsrc','msclkid','fbclid','ttclid','li_fat_id',
                 'utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
var attribution = (function(){
  var store = {};
  try{ store = JSON.parse(sessionStorage.getItem('attr') || '{}'); }catch(e){ store = {}; }
  var qs = new URLSearchParams(location.search), touched = false;
  ATTR_KEYS.forEach(function(k){
    var v = qs.get(k);
    if(v){ store[k] = v; touched = true; }        // newest click wins
  });
  if(!store.landing_page){ store.landing_page = location.href.split('#')[0]; touched = true; }
  if(!store.referrer){ store.referrer = document.referrer || ''; touched = true; }
  if(touched){ try{ sessionStorage.setItem('attr', JSON.stringify(store)); }catch(e){} }
  return store;
})();
```

`gbraid` and `wbraid` matter — Google sends those **instead of** `gclid` on iOS
and consent-mode traffic. Capturing only `gclid` silently loses that segment.

Session storage, not a page variable, so attribution survives navigation across
the mini-site and still attaches if the visitor submits from a different page.

### 4.3 Conversion fire

```js
function fireAdsConversion(lead){
  var c = window.HV_CONFIG || {};
  if(!c.GOOGLE_ADS_ID || !c.GOOGLE_ADS_LABEL || !window.gtag) return;

  var txnId = 'lead-' + (attribution.gclid || 'direct') + '-' +
              String(lead.phone || '').replace(/\D/g,'').slice(-10);
  try{
    if(sessionStorage.getItem('conv_' + txnId)) return;   // already reported
    sessionStorage.setItem('conv_' + txnId, '1');
  }catch(e){}

  try{
    gtag('set', 'user_data', {          // gtag.js hashes these before sending
      email: lead.email || undefined,
      phone_number: lead.phone || undefined   // E.164
    });
  }catch(e){}

  gtag('event', 'conversion', {
    send_to: c.GOOGLE_ADS_ID + '/' + c.GOOGLE_ADS_LABEL,
    value: Number(c.LEAD_VALUE) || 0,
    currency: c.CURRENCY || 'USD',
    transaction_id: txnId
  });
}
```

Rules that matter:

- **Fire only after the lead is confirmed delivered.** A conversion for a lead
  that never arrived is worse than a missed one.
- **Dedupe on `transaction_id` and `sessionStorage`** so a refresh or a
  double-click can't report twice.
- **Normalise the phone to E.164** for both the webhook and enhanced
  conversions — it matches far more reliably than a formatted string.
- Set the conversion action to **page load**, not click, in the Ads UI. The
  page fires it explicitly.

### 4.4 Who reports what

| Event | Reported by |
|---|---|
| Form submission | **The page**, via `gtag` (above) |
| Phone calls | **GHL**, via its Number Pool Calling trigger |

Do not let both report form submissions. If GHL has an "Add to Google Ads"
action on the form workflow, **turn it off** — otherwise every lead counts
twice.

---

## 5. HighLevel integration

### 5.1 Lead delivery

POST JSON to the Inbound Webhook URL. Send flat keys — GHL maps flat fields far
more easily than nested objects:

```js
{
  name, email, phone,            // E.164
  phone_formatted,               // (xxx) xxx-xxxx for humans
  zip, vehicle, vin, service, insurance, carrier,
  gclid, gbraid, wbraid, msclkid, fbclid,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  landing_page, referrer, page_path, submitted_at
}
```

In GHL, map `gclid` to the **standard GCLID field** — it exists already, no
custom field needed, and it's where the "Add to Google Ads" action looks. Create
custom fields for `gbraid`/`wbraid` if they aren't standard.

### 5.2 Things to know before promising anything

- **Inbound Webhook is a premium/paid trigger** in GHL. Confirm the client's
  plan covers it.
- The webhook URL **is visible in page source**. Unavoidable for any
  browser-side post. It's write-only, but anyone can call it — keep spam
  filtering on in GHL.
- GHL's Google Ads integration is **offline conversion import only**. It needs a
  click ID on the contact and only fires from an allowlisted set of triggers.
  **Number Pool Calling is on that list; Inbound Webhook is not.** This is
  precisely why form conversions are fired from the page instead.
- GHL has **no** native enhanced conversions. Another reason to fire from the page.

### 5.3 Call tracking

Load at the very end of `<body>`, so every number is in the DOM before the swap:

```html
<script src="https://backend.leadconnectorhq.com/appengine/loc/<LOCATION_ID>/pool/<POOL_ID>/number_pool.js"></script>
<script src="https://backend.leadconnectorhq.com/appengine/js/user_session.js"></script>
```

**The Google call-asset number must not be swapped.** Google verifies that number
appears on the site; if DNI rewrites it, verification fails. Mark it:

```html
<a class="ghl-no-swap" data-no-swap="true" href="tel:+1XXXXXXXXXX">+1 XXX-XXX-XXXX</a>
```

Footer only. And never bake a phone number into an image — DNI can't rewrite
pixels, so anyone calling it bypasses attribution entirely. Crop images so
printed numbers are out of frame.

---

## 6. Google reviews, refreshed weekly

One Places API call per week, from CI. Visitors never trigger the API and the
key never reaches the browser.

### 6.1 Setup

1. Enable **Places API (New)** — `places.googleapis.com`.
   **Not** `places-backend.googleapis.com`, which is the legacy API and will 403.
2. Create an API key. Application restrictions **None** (it runs from CI, not a
   browser); API restrictions → **Places API (New)** only.
3. Add it as a GitHub repo secret `GOOGLE_PLACES_API_KEY`.
4. Bake the Place ID into the script — Place IDs are public, they appear in Maps
   URLs. Only the key is secret.

Cost: ~4 calls a month, far inside the free tier. Billing must still be enabled
on the Cloud project.

### 6.2 The fetcher — with the guard that matters

```js
const EXPECT_NAME    = /(auto\s*glass|windshield)/i;   // tune per vertical
const EXPECT_ADDRESS = /(,\s*CO\b|Colorado)/i;         // tune per market

const d = await get(
  `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
  'displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews'
);

const placeName = (d.displayName && d.displayName.text) || '';
const addr = d.formattedAddress || '';
const wrong = !EXPECT_NAME.test(placeName) ? 'the name is not the right business'
            : !EXPECT_ADDRESS.test(addr)   ? 'the address is in the wrong area'
            : null;
if (wrong) bail(`resolved listing is "${placeName}" (${addr}) — ${wrong}.`);
```

**Read Gotcha #1. Do not skip this guard.**

Also:
- `bail()` must `process.exit(0)`, never fail the build — a transient API error
  must leave the last good data in place rather than blanking the site.
- Sanity-check the values (`rating` 1–5, `count` ≥ 1) before overwriting.
- Filter reviews to 5-star, 60–400 characters, top 3.

### 6.3 Workflow

```yaml
on:
  schedule: [{ cron: '17 9 * * 1' }]     # Mondays
  workflow_dispatch:
permissions: { contents: write }
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - env: { GOOGLE_PLACES_API_KEY: "${{ secrets.GOOGLE_PLACES_API_KEY }}" }
        run: node landing/fetch-reviews.cjs
      - run: npm run build:landing
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --quiet && exit 0
          git add landing/reviews.json <output-dir>
          git commit -m "Refresh Google reviews"
          git push
```

**Scheduled workflows only run from the default branch.** On a feature branch
GitHub won't even register the workflow. See Gotcha #3.

### 6.4 No data, no claims

When `reviews.json` is absent, the build must **strip** every rating claim and
replace the review cards with a link to the real Google listing. Never ship
invented ratings or testimonials — it's a credibility problem and an Ads policy
risk. Attach `aggregateRating` to structured data **only** when live data exists.

---

## 7. The generator

`build-pages.cjs` reads the template and, per page, replaces title, meta
description, canonical, OG tags, eyebrow, H1, sub, body section, FAQ, and
pre-selects the matching service in the form dropdown. It then emits
`LocalBusiness` + `FAQPage` JSON-LD, sitemap, robots, favicon, manifest, and
copies images.

```js
const BASE   = process.env.BASE   !== undefined ? process.env.BASE : '';
const OUTDIR = process.env.OUTDIR ? path.resolve(process.env.OUTDIR)
                                  : path.join(__dirname, '..', '<output-dir>');
```

Write asset paths in the template with a fixed prefix and rewrite them at build
time. **Rewrite every attribute, not just `href`** — and handle the bare form:

```js
s = s.replace(/="\/PREFIX(?=["/])/g, `="${BASE || '/'}`)
     .replace(/="\/PREFIX\//g, `="${BASE}/`);
```

Missing `src=` means every image 404s from a root-served build. Missing the bare
form leaves `/PREFIX` dangling. Both bugs shipped here before being caught.

**The home page needs the same head treatment as every other page.** It's easy
to generate sub-pages properly and leave the most important page in the account
with no canonical, no OG tags and no structured data.

---

## 8. Content rules that drive Quality Score

Landing page experience and ad relevance are two of the three Quality Score
inputs. These are the things that actually moved the needle:

1. **Every page must be linked from every other page.** Pages reachable only by
   clicking an ad read as doorway pages. Put all of them in the footer. Add a
   header nav on desktop. Measure it: list every output directory, subtract every
   linked slug, and assert the difference is empty.
2. **City pages must be genuinely different.** One template with the name swapped
   is close to Google's own definition of a doorway page and risks an
   "insufficient original content" disapproval. Write each around what actually
   differs about that place — the roads, the local damage pattern, the commute,
   proximity to the shop. Measure with 5-gram shingle overlap on the body copy:
   **target under 5%**. (This project went from 84% to 0.2%.)
3. **Unique H1, title and meta description on every page.** Assert it in the build.
4. **Include the city and the head keyword in the H1.**
5. **No unsubstantiated claims.** "Preferred shop for all major carriers" is a
   specific contractual status. "We bill all major carriers direct" says the same
   thing to a customer and is verifiable. Audit every trust claim against what
   the owner can actually prove.
6. **Privacy Policy and Terms must be live and reachable.** Google Ads requires
   it. Write them specific to what the site actually collects: form fields, click
   IDs, call tracking, hashed conversion data, state privacy rights.
7. **Sequential heading levels**, 24px minimum tap targets, 16px minimum font on
   inputs.

---

## 9. Deployment — one project per business

**Do not use a host-based rewrite to serve multiple sites from one project.**
Separate projects mean an unrelated deploy can't take the site down, and a review
refresh doesn't rebuild someone else's app.

1. Vercel → **Add New → Project → Import** the repo
2. **Root Directory** → the generated output folder ← the setting that matters
3. Framework Preset → **Other**; Build, Output and Install commands all empty
4. Deploy (seconds — there's no build)
5. **Settings → Domains** → add the domain
6. DNS: `CNAME <subdomain> → cname.vercel-dns.com`

`vercel.json` inside the output folder:

```json
{
  "trailingSlash": false,
  "headers": [{
    "source": "/img/(.*)",
    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
  }]
}
```

Because Root Directory is set, Vercel reads *this* `vercel.json`, not the repo
root one — so a monorepo's crons and function settings stay with their own project.

⚠️ Pointing the DNS is a **live cutover** if the domain currently serves
something else. Verify the Vercel URL fully before touching DNS.

---

## 10. Gotchas — every one of these cost real time

**#1 — Verify the Google Place ID against the business name. This is the big one.**
A client-supplied Place ID resolved to a *different company* two doors down. The
job cheerfully published **another business's 3.9★ from 58 reviews** — including
a review thanking them for a radiator flush — across all 22 pages. A wrong Place
ID fails completely silently, because the numbers it returns look perfectly
plausible. Always assert the resolved `displayName` and `formattedAddress` before
publishing. Cross-check the returned CID against the business's known Maps link.

**#2 — Verify the street address independently.** The wrong listing above was at
1395 of the same street; the real business was at 1440. A wrong address goes into
the footer, both legal pages, and the structured data on every page, and it hurts
local relevance.

**#3 — Scheduled GitHub workflows only run from the default branch.** On a feature
branch, `list_workflows` returns zero — GitHub doesn't register it at all. It can't
be dispatched from the Actions tab either. Merge to the default branch before
expecting any cron to fire.

**#4 — Vercel's Root Directory picker only reads the default branch.** If the
output folder exists only on a feature branch, it won't appear in the import
dialog. The Settings field accepts free text, but the branch must be set first or
validation fails. Simplest fix: get the folder onto the default branch first.

**#5 — Production Branch has moved in the Vercel UI.** It's under
**Settings → Environments → Production → Branch Tracking**, not Settings → Git.

**#6 — Never invent reviews, ratings or testimonials.** Placeholder content has a
way of shipping. Build the "no data" path first so the page degrades to honest
neutral wording.

**#7 — GHL renders plain text inputs with no `type` attribute.** If you style a
native GHL form, `input[type="text"]` matches nothing and those fields stay white
on a dark card. Select by exclusion instead.

**#8 — Inputs below 16px make iOS Safari zoom on focus** and never zoom back.
That's a conversion loss in the middle of the form.

**#9 — Put the logo link to `/`, not `#top`.** On sub-pages `#top` just scrolls up,
leaving an ad visitor with no way to the home page.

**#10 — Watch CSS source order when patching.** An "audit fixes" block appended
*after* the media queries overrode them at every width, because specificity was
equal. Two P0 mobile bugs came from exactly that.

**#11 — A `1fr` grid track won't shrink below its content's min-content width.**
A non-breaking space in a label caused real horizontal page scroll below 384px.
Use `minmax(0,1fr)`.

**#12 — Test at 320px.** Most breakage lives below 360.

**#13 — Playwright uses the LAST matching route.** Register broad stubs first and
specific handlers after, or your specific handler never runs and you'll misread a
working feature as broken.

**#14 — A sandboxed browser usually has no outbound network.** Stub every
third-party script, and serve JS content-type for `.js` requests or the page dies
on a parse error. Use a local HTTP server, not `file://`, so absolute paths resolve.

---

## 11. Verification checklist

Run before handing over. Automate what you can.

**Build**
- [ ] Unique H1, title, meta description on every page
- [ ] Zero orphan pages — every output dir linked from every page
- [ ] City-page body-copy overlap under 5%
- [ ] Every internal `href` and `src` resolves to a file on disk
- [ ] Canonical + OG + JSON-LD on every page, home page included
- [ ] `favicon.ico`, manifest, icons, `sitemap.xml`, `robots.txt` all 200

**Rendering** — at 320/360/390/414/768/1024/1280/1440
- [ ] No horizontal overflow at any width
- [ ] No tap target under 24px
- [ ] No console errors
- [ ] Favicon legible at 16px on light *and* dark browser chrome

**Tracking** — submit the form in a real browser with `?gclid=TEST123`
- [ ] `dataLayer` shows `config` with `allow_enhanced_conversions: true`
- [ ] `set user_data` with email and E.164 phone
- [ ] `event conversion` with the right `send_to` and the gclid in `transaction_id`
- [ ] Webhook POST contains the gclid and all UTMs
- [ ] Second submit fires no second conversion
- [ ] Nothing fires when the config block is empty

**Live**
- [ ] Real test lead arrives in GHL
- [ ] Conversion appears in Google Ads (3–24h; **requires a real ad click** —
      a direct visit has no gclid, so Google records nothing)
- [ ] Number pool swaps the header number
- [ ] Google call-asset number in the footer is **not** swapped
- [ ] Lighthouse mobile ≥90 across all four categories

**Reviews**
- [ ] First run logs the **correct** business name and address
- [ ] Missing key / API error leaves the site untouched and exits 0
- [ ] Rating, count and quotes appear on all pages
- [ ] `aggregateRating` present in structured data

---

## 12. Prompt to start a new build

> I want to build a Google Ads landing site for **[BUSINESS]** following the
> attached playbook. Domain: **[DOMAIN]**. It gets its own Vercel project.
>
> [paste the §2 intake]
>
> Start by crawling the existing site and listing every URL — the new slugs must
> match so the current Ads final URLs keep working. Then propose the page list
> before writing anything.
>
> Follow §10 without exception, especially #1: verify the Google Place ID
> resolves to the correct business before publishing any review data.

---

## 13. Reference implementation

`phort6n2/claude` → `landing/` and `quote-site/`, live at
`quote.hvautoglassdenver.com`.

Final state: 22 pages, zero orphans, 0.2% city-page overlap, Lighthouse
96/100/96/100, LCP ~1.3s mobile, real 4.8★ from 191 Google reviews refreshing
weekly.
