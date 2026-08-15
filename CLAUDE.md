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
- `share_links.image_link` is an HTML page, not an image, so it can never be
  an `<img src>`. `dynamic_url` is their dashboard; it renders at 0,0 for a
  signed-out viewer, so it sits behind a button, never in place of our map.
- The map background is a **Static Maps** proxy (`/api/rank-map`), which needs
  the *Maps Static API* enabled on `GOOGLE_PLACES_API_KEY` — a key authorised
  only for Places returns 403 and the grid draws on plain grey.
- The raw payload is stored precisely so a reader bug costs a recompute
  rather than a re-scan: credits are billed per run.

### Syndicated SEO articles

`baby-love-growth.ts` (API client), `seo-articles.ts` (sync),
`seo-article-review.ts` (content scan), `sanitize-html.ts`.

BabyLoveGrowth writes articles; a nightly cron pulls them into `SeoArticle`
and the hosted sites serve them at `/blog`. Pull-only and rate limited, so
nothing may call their API per page view.

- An article reaches a site only if it **matches a shop** (its `orgWebsite`
  against the shop's custom domain, Business Profile website, or
  glassleads.app subdomain) **and passes the content scan**. Unmatched is
  held, never guessed — one shop's content under another's name is worse
  than no content.
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
