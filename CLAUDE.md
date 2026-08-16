# glassleads.app

Lead capture, call coaching and hosted websites for independent auto glass
shops. About 15 shops run on it.

This file is loaded automatically at the start of every Claude Code session in
this repo. It is the operating brief: what the product is, the rules that are
not negotiable, and the handful of things about this codebase that will waste
your afternoon if you do not know them.

**Companion docs.** `OPEN-ITEMS.md` is the live punch list — open decisions,
things waiting on the owner, and the ranked backlog. `docs/HANDOFF.md` is a
longer narrative of the lead pipeline (written 2026-08-09; still accurate on
attribution and dedup, predates call tracking, notifications and the landing
page work). The root `README.md` is a short public-facing summary.

---

## 1. What it is

A shop pays **$297/mo** self-serve, or **$497/mo** with done-for-you Google
Ads management. For that they get:

- A hosted website on `{subdomain}.glassleads.app` (or their own domain),
  built from their real photos, warranty, service area and Google reviews.
- A quote form — on that site, and embeddable on any site they already have.
- Instant lead alerts by **email (Resend)** and **SMS (Twilio)**, with one-tap
  call, text-back, and "did this one book?" buttons.
- **Twilio tracking numbers**: calls recorded, transcribed and scored, so
  missed calls surface the same day and whoever answers the phone gets
  coached rather than guessed at.
- **Attribution end to end**: the Google click id rides with the lead, and
  jobs marked booked upload back into Google Ads as offline conversions.

The attribution loop is the moat. Competitors send leads; almost nobody
closes the loop back to the ad that paid for them.

---

## 2. Rules that are not negotiable

### Content and claims

These sites speak on behalf of real businesses in a regulated trade. The
template may only say things that are true for **every** shop it renders, or
that are gated on a per-shop flag.

- **Never invent a fact about a business.** Not hours, not certifications,
  not years in business, not a testimonial.
- **No timing promises** ("same day", "30 minutes") unless that specific shop
  stated it. The platform cannot promise scheduling for 15 different shops.
- **No deductible-waiver offers** ("we pay your deductible"). Illegal to
  advertise in several states.
- **No "approved by" or "preferred provider"** claims about insurers.
- **No fabricated ratings or reviews.** Ratings come from a live Google
  Business Profile feed; a shop without one shows nothing.
- **A named warranty must state its terms.** Naming one without defining it
  is the failure the content rules exist to prevent.
- Sections **strip themselves when their data is empty**. An untouched editor
  means a leaner site, never a broken one.

Two per-shop flags gate claims the template used to assert for everyone —
both default `false`, both set on the admin Business tab:

- `Client.filesInsuranceClaims` — off: the site says they will check coverage
  and give the carrier what it needs. On: they deal with the carrier directly.
- `Client.smsCapable` — gates every "text us a photo" path. An `sms:` link to
  a landline is a dead end that costs the lead.

### Security

- **The repo is public.** Never commit credentials, and never paste key values
  into a chat transcript. Keys live in the encrypted `Setting` table (via
  Settings → API keys) or in Vercel env vars.
- Admin-entered URLs that the server fetches go through `validatePublicUrl`
  (https-only, no private/link-local hosts) — see `src/lib/site-import.ts`.

---

## 3. Stack

Next.js 16 (App Router) · React 19 · Prisma 6 · Tailwind v4 · Postgres ·
Vercel · NextAuth.

Vercel project `agmp-paa-pro`. Deploys on push to `main`.

---

## 4. The database model that will bite you

**There are no Prisma migrations.** Schema changes ship as idempotent SQL in
`src/lib/schema-bootstrap.ts`, applied two ways:

1. `ensureCallTrackingSchema()` runs from `instrumentation.ts` at boot.
2. `POST /api/admin/setup-db` runs the same statements on demand.

Three consequences, each of which has already caused a production incident:

- **DDL cannot use the pooled connection.** The pooled `prisma+postgres://`
  role (`PRISMA_DATABASE_URL`) has no DDL rights. Anything running `ALTER
  TABLE` must build its own client on `DIRECT_URL`. `ensureCallTrackingSchema`
  does exactly this; it passed locally for weeks because local dev uses a
  direct connection, and silently failed in production. A local pass on DDL
  code means nothing.
- **Prisma selects every scalar on a model.** Add a column to the schema and
  every existing query against that table breaks until the SQL has run. Add
  the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `schema-bootstrap.ts` in
  the same commit, always.
- Add new statements to the right array (`CALL_TRACKING_SQL`,
  `OFFLINE_CONVERSION_SQL`, `CLAIM_FLAGS_SQL`) so `BOOTSTRAP_SQL` picks them
  up and the boot hook and setup endpoint can never disagree.

---

## 5. Subsystems

### Leads

`src/app/api/webhooks/highlevel/lead/route.ts` is the main intake. Leads also
arrive from the hosted sites' own form and from embedded widgets.

- **Origin policy** (`lead-origin-policy.ts`): a lead is accepted when the
  page's Origin host matches the request Host (app-served), when there is no
  Origin at all (server-to-server), or when the client has explicitly opted
  the domain into `allowedOrigins`. Embedded third-party forms are a supported
  feature, not an attack.
- **Dedup** (`lead-dedup.ts`): the earliest same-day row for a contact wins,
  computed *after* insert so concurrent posts cannot both think they are
  first. Attribution from later duplicates merges onto the canonical row
  null-only — never overwriting a click id that is already there.
- **Attribution** (`ads-tracking.ts`): `gclid`/`gbraid`/`wbraid` plus UTMs are
  captured client-side, persisted, and travel with the lead. `paid_click`
  is tracked separately from the site's nominal source.

### Notifications

`lead-notifications.ts` — Resend email and Twilio SMS. Emails come from
**"AUTO GLASS LEAD"** with subject `[NEW LEAD - {shop}] - Call Immediately`,
and carry Call / Text / damage-photo / "did this one book?" buttons.

The admin "send test" button is a **faithful replica** of a real alert. This
matters: a test that omits pieces is how missing pieces go unnoticed, and also
how present pieces get reported as broken. That exact bug has happened here.

### Call tracking and coaching

`twilio-voice.ts`, `call-lead.ts`, `lib/call-analysis/`, and the Twilio
webhook routes.

- Numbers are bought in-app (`/api/clients/[id]/tracking-numbers`) with the
  VoiceUrl set in the purchase request.
- TwiML uses `answerOnBridge` and dual-channel `record-from-answering-dual`.
- Twilio signature validation rebuilds the public URL from forwarded headers.
- Recording URLs need Basic auth, so recordings are copied to Blob storage.
- Webhook responses: `new Response(null, { status: 204 })`. A 204 **with** a
  body throws, which returns 500, which makes Twilio retry, which runs the
  analysis twice.
- `site-phone.ts` swaps the displayed number to the tracking number at the
  data layer. The LocalBusiness JSON-LD and the contact/locations cards keep
  the **real** number for NAP consistency — schema is built before the swap,
  and that order is load-bearing.

### Hosted sites

`src/app/sites/[slug]/` (home, `services/[service]`, `locations/[city]`,
privacy, terms) rendering `components/sites/shared.tsx` and `site-body.tsx`.
Middleware rewrites `{sub}.glassleads.app/*` to `/sites/{sub}/*`.

Every page type is the same body with a different hero and lead-in. Page
order is deliberate: hero and quote form, services, how it works, insurance
and cost, warranty, gallery, reviews, **the shop's own story**, map, FAQ,
service areas, closing CTA. The story sits after the proof on purpose — it is
the block that talks about the business rather than the customer, and ahead of
the proof it stood between a paid visitor and every section that answers
"what will this cost me".

### The importer

`site-import.ts` crawls a shop's existing website and drafts their content.

- The logo is **scored, not first-matched**: JSON-LD logo, then `<img>`
  candidates scored on name tokens, theme classes and document position, with
  penalties for footer position, partner brands and car makes. A negative
  score returns null, because no logo beats another brand's logo. Auto sites
  carry "makes we service" strips whose files are literally named
  `cars_logo_acura.jpg`, and a first-match finder ships Acura's badge as the
  shop's — that shipped to production once.
- Photos are judged **by sight** (candidate images are attached to the model
  request), not by filename. Photo pools are a **preference, not a filter**:
  imagery that looks like this specific shop leads the gallery, generic or
  stock-looking imagery fills the rest. Stock the shop published on their own
  site is kept — the compliance problem was ever only the *claim* that a
  gallery was their own completed work, and that heading is gone.
- Prompt bias is **keep by default**. A drop-biased prompt once kept 1 photo
  of 17 by judging filenames it could not judge.

### Google Ads offline conversions

`google-ads.ts` (`API_VERSION`, bumped roughly yearly — v21 sunset
2026-08-05, currently **v25**) and `google-ads-offline.ts`.

Candidates are leads marked SOLD with a sale value, a click id, inside the
click window (85 days used against Google's 90), not already uploaded.
`orderId` is the lead id, so re-uploads dedupe. Uploads use
`partialFailure: true`; per-operation failures come back inside
`partialFailureError` on an HTTP **200**, indexed by
`location.fieldPathElements` — a 200 does not mean success. "Check without
sending" runs `validateOnly` and leaves no trace.

### Local rank tracking

`local-dominator.ts` plus the webhook at
`/api/webhooks/localdominator/[clientId]`. Their scheduler runs the campaign
and posts each finished run back, so nothing is polled.

- The delivered payload is **not** the documented `ResultsJson`. The grid is
  `content` — one entry per row, keyed `"0".."9"` — not `compressed_grid`.
- **Cells are zero-indexed positions: 0 is first place.** Reading 0 as "did
  not appear" inverts every map and shipped twice. The proof is arithmetic:
  their `average_rank` is the mean of every raw cell (a 10×10 summing to 113
  reports 1.13), and their docs deliver a genuinely missing point as `null`.
  `/api/admin/rank-campaigns/repair` asserts that equality on every run.
- **One URL per client does the whole job: `Client.rankMapUrl`.** It is the
  campaign token from `share_links.campaign_link`, served from our white-label
  host, and on that host it renders EVERY keyword in one map with their own
  controls. Do not embed `campaign_link` as given — on THEIR host that same
  URL is a standalone marketing page, which is what put marketing chrome in a
  client's portal. Only the token travels.
- The daily sweep captures and refreshes it, so rendering costs no request.
- **Their API does not CREATE the campaign share link.** A campaign made via
  the API comes back with `share_links: [image_link, dynamic_url]` and no
  `campaign_link`, even after a run has completed; the two campaigns that had
  one were the two opened by hand in their dashboard. There is no endpoint to
  create it (they have share-creation endpoints for AI Tracker, Projects and
  SERP — not for scheduled scans). So a new client needs the campaign opened
  once in Local Dominator, then "Refresh map URLs" — or the URL pasted into
  the client's Map URL field, which accepts the bare token too.
- The sweep only CREATES for clients with no `rankTrackingId`; it never
  touches an existing campaign. Changing an existing one goes through PATCH:
  `syncCampaignTier` on a tier flip, `/respace` for geometry, `/reschedule`
  for the cron.
- Flipping `Client.seoClient` PATCHes the live campaign — four keywords and
  weekly, or two and monthly. A downgrade sets the extra terms `inactive`
  rather than removing them, because a removed term takes its history with
  it and the series is the whole point.
- **Embed the CAMPAIGN's share link, not a run's.** `GET /v1/scheduled-scans/{id}`
  → `share_links.dynamic_url` is, per their docs, derived from the newest
  notified run *that has resolvable share URLs*. So it is stable (their
  scheduler repoints it as each run completes — one URL, always current) and
  it can never point at an empty record. A per-run link taken from a webhook
  can, and their page renders an empty record as a blank world map centred on
  0,0 — the Atlantic. That cannot be detected by fetching the page: it
  returns the same 200 and the same shell either way.
- **Prefer the WHITE-LABEL form of the report:** `https://{share host}/{link}`,
  where the host is the `LOCALDOMINATOR_SHARE_HOST` setting (our own domain
  pointed at them) and `link` is the UUID out of `dynamic_url`. It is the same
  page on our domain, and the only one of the three that advertises
  `content-security-policy: frame-ancestors *` — built to be embedded. A
  client reading their own rankings should not see a vendor's domain.
- **The same report on their host: `share_links.dynamic_url`.** The fallback
  when no share host is configured. It is
  public — fetched with a real `link` token and no cookies it answers 200,
  sends no `X-Frame-Options` and no `frame-ancestors`, and never redirects to
  their login. It is a client-side app that reads `heatmapRecordId` and `link`
  off its own query string, so all it needs is the URL passed through
  untouched — it once drew the Atlantic only because the frame carried
  `referrerPolicy="no-referrer"`.
- **Never probe their routes with a made-up token.** An invalid token refuses
  exactly like a missing route, and reading one as the other wrote the
  interactive map off as login-only twice. `/api/admin/rank-campaigns/embed-check`
  probes every URL shape with the real tokens from a stored payload.
- `share_links.image_link` is an HTML page despite the name — never an
  `<img src>` — and 307s to `/share/static-images/heat-map-image?...`. It is
  the fallback when the interactive report cannot be reached.
- `share_links.campaign_link` is their standalone marketing page for a
  campaign, not the report. The report is what it links to. Not used.
- Whether their page can be framed is probed **server-side** before render
  (`rank-embed.ts`, cached a day), because an iframe fails silently and a
  blank box in front of a client is worse than our own map. Ours is the
  fallback.
- **We do not draw a map of our own.** There was one; it disagreed with
  theirs in front of a client (2.8 against their 1.80) and was deleted along
  with its Static Maps proxy. When theirs cannot be framed the page says so
  and links out.
- **Scans run on a weekday, in business hours** (`0 19 * * 2`). A geogrid
  measures the pack as it stands at that moment, and the weekend pack is not
  the one that sells jobs — competitors with weekend hours surface and closed
  shops get demoted, moving the grid for reasons unrelated to the SEO. The
  monthly cron `0 19 1-7 * 2` means "first Tuesday" only if their scheduler
  ANDs day-of-month with day-of-week; Vixie cron ORs them, which would be
  weekly. `/api/admin/rank-campaigns/reschedule` proves it on ONE campaign by
  reading `next_run_at` back, and falls back to `0 19 2 * *` if it does not
  land on a Tuesday.
- `distance` is **metres between adjacent pins**, and a 10x10 spans NINE
  gaps. 1207m = 0.75 miles apart, 6.75 miles across. Their scheduler holds
  the geometry, so changing `SCAN_PRESETS` does nothing to existing
  campaigns — `/api/admin/rank-campaigns/respace` PATCHes each one in place
  (never delete-and-recreate: that orphans stored runs and burns credits).
- The raw payload is stored precisely so a reader bug costs a recompute
  rather than a re-scan: credits are billed per run.

### Syndicated SEO articles

`baby-love-growth.ts` (API client), `seo-articles.ts` (sync),
`seo-article-review.ts` (content scan), `sanitize-html.ts`.

BabyLoveGrowth writes articles; a nightly cron pulls them into `SeoArticle`
and the hosted sites serve them at `/blog`. Pull-only and rate limited, so
nothing may call their API per page view.

- **Each shop is its own BabyLoveGrowth organisation with its own key**, held
  encrypted on `Client.blgApiKey` and switched on with `Client.seoContentEnabled`
  (admin → client → SEO tab). The key identifies the shop, so nothing has to
  be matched. An account-wide key in Settings still works as a fallback and
  falls back to matching `orgWebsite` against the shop's custom domain,
  Business Profile website, or glassleads.app subdomain.
- An article reaches a site only if it is **placed with a shop** and **passes
  the content scan**. Unplaced is held, never guessed — one shop's content
  under another's name is worse than no content.
- `seoContentEnabled` is enforced at **render**, not only at sync: the blog
  pages, the sitemap and the portal all require it, so switching it off takes
  live pages down rather than only stopping the next pull.
- The scan enforces §2's content rules on copy nobody at the shop reads
  before it goes up: turnaround promises, deductible offers, insurer
  relationships, asserted ratings, credentials, years in business. It
  **holds, never rewrites** — a claim about a real business is a human's
  call. It is a floor: it catches known phrasings, not a fabricated fact
  stated plainly.
- Bodies are third-party HTML on the shop's own origin, next to their quote
  form, so they go through an **allow-list** sanitiser at render (not at
  sync, so a fix applies to everything already stored).
- Clients see the work in the portal's SEO tab and cannot act on it. That is
  deliberate — read-only, no approvals, no scheduling.

### Other pieces worth knowing

- `wordmark.ts` / `wordmark-image.tsx` — generated wordmark for shops with no
  logo. Initials come from the *distinctive* part of the name, because almost
  every client is "<something> Auto Glass" and first-two-words would badge
  them all identically. Header and footer draw it as live text; the PNG route
  exists for photo watermarks and downloads. Ships Inter Tight as TTF because
  Satori cannot read the WOFF2 `next/font` emits, and the font is read by
  path — so its routes are listed in `outputFileTracingIncludes` in
  `next.config.ts`. Miss that and it 500s in production while working in dev.
- `insurance-rules.ts` — per-state glass deductible rules, and
  `heroCostLineFor()` for the above-the-fold cost line. All of it already
  compliance-reviewed; reuse it rather than writing new insurance copy.
- `vin-decode.ts` — free NHTSA vPIC decode. **Blank driver-assist fields mean
  unknown, not absent**, so there is no "no camera" verdict — only likely /
  possible / unknown. A wrong "no calibration needed" gets one skipped.
- `contact-links.ts` — `toE164`, `telHref`, `smsHref`. The `sms:` body
  separator is `?&` (iOS reads the `&`, Android the `?`) and must be
  `&amp;`-escaped inside HTML attributes.
- `lead-outcome-token.ts` + `/o/[token]` — HMAC capability URLs for the
  one-tap booked/didn't-book buttons in alerts.

---

## 6. Conventions

- **Autosaving admin UI.** Newer cards (tracking numbers, site content) save
  on change with a status line, no save button. Flip optimistic state first,
  then reconcile — a controlled checkbox that waits on a round trip feels
  broken.
- **Comments explain why, not what.** Several comments in this codebase record
  a production incident. Do not delete them for brevity; they are the reason
  the bug has not recurred.
- **Verify against reality.** Screenshot the page, curl the live site, read
  the row back out of the database. A build that compiles is not evidence the
  feature works.

---

## 7. Local development

```bash
# Postgres on 5433 (superuser role `dev`)
su -s /bin/sh nobody -c '/usr/lib/postgresql/16/bin/pg_ctl \
  -D /tmp/pgtest/pgdata -o "-p 5433 -k /tmp/pgtest" -l /tmp/pgtest/pg.log start'

npm run build
DATABASE_URL=postgresql://dev@127.0.0.1:5433/glassleads \
AUTH_TRUST_HOST=true NEXTAUTH_URL=http://localhost:3111 PORT=3111 \
  ./node_modules/.bin/next start
```

Notes:

- Prisma CLI is `./node_modules/.bin/prisma` (no global install).
- Playwright must be launched with `executablePath: '/opt/pw-browsers/chromium'`.
- Kill a stale server with `pgrep -x next-server | xargs -r kill` — a bare
  `pkill -f next` also matches your own shell and kills the command running it.
- The importer and any model-backed feature need `ANTHROPIC_API_KEY`, which is
  usually absent locally. Those paths cannot be tested here; say so rather
  than claiming they were verified.

---

## 8. Git

Work on `claude/handoff-doc-review-js930f`, then merge to `main`. Push with
`git push -u origin <branch>`. Do not open a pull request unless asked.
