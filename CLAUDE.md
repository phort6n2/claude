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

### White label

**A client must never learn which supplier produced their content.** Not
BabyLoveGrowth, not RobinReach, not any writer or scheduler added later. The
shops pay this platform; a supplier's name on their page is an invitation to
go straight to the supplier.

This is not satisfied by keeping vendor names out of UI copy — the strings
were never the leak. Nothing renders supplier content today (the Activity feed
reads the shop's own RSS, which has no author field), so the rule is currently
enforced by the format. `article-whitelabel.ts` keeps `VENDOR_HOSTS` and the
test; the next integration that RENDERS a supplier's content has to handle all
three of these, and none of them is a string:

- **Images** are copied onto our own storage at sync, so no vendor CDN host
  appears in a page source, a network tab or an `og:image`.
- **JSON-LD** is scrubbed at render: `author`/`publisher`/`creator` and the
  rest are rewritten to the shop, and any vendor URL is dropped. Machine
  readable, indexed and invisible on screen is the worst combination.
- **Links in the body** lose their `href` when they point at a vendor. The
  sanitiser asks whether markup can execute, not whose name is on it.

`VENDOR_HOSTS` is the list. Add every host a new vendor serves from, not just
their apex — CDNs and app subdomains are exactly what appears in a page source.

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

### The quote form

`WidgetMount` in `site-body.tsx` renders a **real, working `<form method="post">`**
server-side; `widget.js` upgrades it in place.

- **No JavaScript, still a lead.** The form posts urlencoded to the SAME intake
  the widget's fetch uses, so a no-script lead is dedup'd, attributed, alerted
  and forwarded identically. A parallel route would be a second copy of that
  behaviour waiting to drift.
- The intake branches on `Content-Type` and answers a form post with a **303**
  to `/quote-sent`, never JSON. 303, so a refresh cannot post the lead twice.
- The confirmation path comes from the **`Referer`**, because the same HTML
  serves a shop's own host and `/sites/{slug}` — a path baked in at render is
  wrong for one of them, and without JS there is nothing to put in a hidden
  field. A referer on another host is ignored.
- Scheme and **port** come from `x-forwarded-proto`/`x-forwarded-host`.
  `requestHost()` strips the port on purpose (it compares origins) and is the
  wrong tool for building a redirect.
- `widget.js` **carries across anything already typed** before it swapped the
  form — the script lands about a second after the HTML, and that is the one
  element the page exists for.

### Notifications

`lead-notifications.ts` — Resend email and Twilio SMS.

- **Recipients are ONLY what is set on the client.** No fallback to
  `Client.email`, no operator address from the environment, nothing. A lead
  alert carries a real customer's name, number and sometimes a photo of their
  car; a default recipient is how that reaches somebody nobody chose. An
  unconfigured client sends nothing and says so on its readiness badge.
- **SMS is billed per SEGMENT, and encoding decides the segment size.** One
  character outside GSM-7 drops the message from 160 characters per segment to
  70. An em dash and a middle dot in the body were doubling the cost of every
  alert ever sent. `sms-segments.ts` normalises to GSM-7 and `fitSegments`
  drops the least important lines until it fits one segment — name and number
  first, they are never dropped. A multi-segment body is logged as a warning,
  because nothing else in the app would show it.
 Emails come from
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

**Two logo slots, set on the Website tab** (`LogoCard`, `/api/clients/[id]/logo`).
`Client.logoUrl` is the header's, drawn on white and also used as the photo
watermark and the JSON-LD `logo`. `Client.footerLogoUrl` is only for the dark
footer band, and is empty for most shops — it exists because a logo that is
dark ink on transparency, which is most of them, is invisible down there. A
pasted address is COPIED to blob storage rather than referenced: these
addresses are usually on the old site this platform is replacing, and the
week it is switched off is the week the logo would vanish. When the copy
cannot be made the original is kept and the card says so.

**Which cities get pages is edited here too** (`ServiceAreaPlanner`). The
first `LOCATION_PAGE_LIMIT` of `Client.serviceAreas` (after shop cities merge
in front) get a page; the rest are coverage-band text, and the card marks
which is which. "Suggest nearby cities" (`nearby-cities.ts`) asks the model
for towns near the shop and then **geocodes every name it returns** — the
candidate survives only if Google resolves it to a real locality, and the
distance that orders the list is measured rather than claimed. It writes
nothing: coverage is a business fact, and a town twenty minutes away across a
river they never cross looks exactly like one they serve daily.

### Onboarding (intake → approval → walkthrough)

`client-intake.ts` (ONE field list read by the form, the review page and the
mapper), `intake-token.ts` + `/welcome/[token]` (the public form; the link
carries its own authority), `/admin/intakes` (review), `intake-email.ts` (the
invite), `portal-email.ts` (approval + login emails), and the portal-side
walkthrough (`GettingStartedCard`, `/api/portal/onboarding`,
`ClientOnboarding`).

- **Nothing is real until an admin approves.** Submit writes a draft; approve
  copies it onto a Client (NEW → created as ONBOARDING, EXISTING → diff
  applied), sets alert recipients, and puts hours on the primary location.
- **Approval emails the shop NOTHING.** The portal invite is a manual send —
  the Portal invite card on the client Overview (`portal-invite.ts`,
  `/api/clients/[id]/portal-invite`), pressed when the operator decides the
  setup is worth a first look. The card leans on the readiness count as its
  prompt but never blocks the send. It prefills the address the intake was
  SENT to — the one that has proven it reaches a human — creates the
  `ClientUser`, and mails the "portal is ready" note with a magic link.
  Re-sending mints a fresh link for the same account. An email already
  attached to another client's login is reported, not reassigned.
- **The portal signs in by emailed link, and that is the front door.**
  Intake-created users have no password. `/portal/login` defaults to
  "email me a sign-in link" (password behind a toggle), `request-link`
  actually sends the email (it used to log it to the console and answer
  "sent"), and the response is identical for known and unknown addresses —
  the endpoint is public, and a distinguishable miss is a directory of who
  uses the platform. The verify PAGE posts JSON to the verify API; that API
  had only a GET, so every magic link died on a 405. Both handlers exist now;
  don't remove either.
- **The walkthrough is four steps, two of which tick themselves.** Prove a
  test alert arrives (the shop presses "it arrived" — a 200 from Resend and a
  message a human saw are different facts, and the gap is the spam folder),
  put the portal on the home screen, then "first lead" and "first lead acted
  on" complete from data. Stored stamps live in `ClientOnboarding`
  (bootstrap: `CLIENT_ONBOARDING_SQL`); derived states are never stored.
- **The portal test button and the admin test button send the SAME message**
  (`test-alert.ts`). A test that only nearly matches a real alert re-creates
  the bug the faithful-replica rule exists to prevent. The send-test action
  refuses to stamp when nothing was handed to a provider — "sent, go check"
  about a message that never left teaches a shop to distrust the checklist.

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

### Google Ads scheduled checks (the heartbeat)

`google-ads-checks.ts`, the `AdsFinding` table (bootstrap: `ADS_FINDING_SQL`),
the morning cron `/api/cron/ads-daily`, and `/admin/ads-findings` ("Ads:
needs action" in the sidebar). Replaces the n8n/Airtable idea on purpose:
the credentials, the scheduler, the queue and the surface all already lived
in this app.

- **A finding is a structured claim with its evidence attached** — window,
  sample sizes, the numbers — never prose. Evaluators are pure (rows in,
  drafts out) so thresholds are testable against saved API responses.
- **Findings dedupe and live a lifecycle.** A persisting condition is ONE
  row whose `lastSeenAt` moves. It auto-RESOLVES when a run stops seeing it
  (only for checks whose fetch succeeded — an API hiccup must not read as
  all-clear), reopens the same row if it returns, and DISMISSED means "known,
  stop telling me" and is honoured until it resolves.
- **DAILY is anomalies only** — spend cliff/spike vs the prior-7 mean (with
  a $10/day floor so small campaigns stay silent), disapproved ads,
  budget-capped campaigns, account conversions gone to zero after a real
  prior week, and change_event edits by anyone (budget edits escalate to
  ALERT — the $150→$1 case). Slower checks belong to future WEEKLY/MONTHLY
  sweeps so the daily signal stays scary.
- **The digest emails ADMIN_EMAIL only when something NEW appeared**, so an
  empty morning sends nothing and the email means something.
- **WEEKLY is the optimization playbook** (`google-ads-playbook.ts`): the
  bidding maturity ladder (clicks → Maximize Conversions at ~20
  conversions → consider tCPA at 30, set AT/above observed CPA), budget
  under 2× target, search partners / Display expansion / geo-interest
  leaks, PMax URL expansion, and negatives candidates gated at 2× the
  campaign's observed CPA. Every recommendation is cooldown-checked
  against 30 days of change_event first — bidding touched inside 14 days
  means silence, and an unreadable change history means NO recommendations
  for that account. Thresholds are named constants;
  `docs/GOOGLE-ADS-PLAYBOOK.md` carries the expert sourcing, confidence
  labels and the disagreements.
- Read-only so far. The planned approve→execute layer must carry the exact
  mutation payload on the finding and replay it — never re-derive at
  execution time — and prefer reversible actions (pause over remove).

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

**One conversion setup in every account** — `google-ads-conventions.ts` holds
it, `docs/GOOGLE-ADS-SETUP.md` is the human checklist. Four actions, same
names everywhere: **AGMP Lead Form**, **AGMP Call From Ads**, **AGMP Website
Call** (all Primary) and **AGMP Sale** (the upload target, Secondary until a
shop has the volume for value bidding). They sit in four different categories
on purpose — Primary/Secondary is set per `CATEGORY~ORIGIN` goal, not per
action, so two lead actions in one category cannot be told apart by bidding.

- The audit **reads only**, on the Advertising tab per client and at
  `/api/admin/google-ads/conversion-audit` for all of them. An audit that
  fixes things is one nobody can run to find out what is wrong.
- **Landing pages are audited too** (`google-ads-landing.ts`, "Where the ads
  land" on the Advertising tab): every ENABLED ad (`final_urls` AND
  `final_mobile_urls`), PMax asset group, and sitelink at all three
  attachment levels, judged against the client's subdomain and custom
  domains. A click landing anywhere else spends the same money with none of
  the tracking, and Google cannot flag it because it does not know which
  host is ours. Enabled-only on purpose — paused strays are noise.
- **Rename, never recreate.** History, volume and bidding learning live on the
  action; a fresh one starts from zero and re-enters learning. So a right-shape
  action under a wrong name is reported as a rename, naming the action.
- **`AGMP Call` / `AGMP Form` are HighLevel's uploads and are LEGACY.** They
  sit in Converted lead — a lead that arrived by phone or form — and they are
  being retired as every client moves onto a Twilio tracking number in this
  app. ONE call conversion per shop: HighLevel's number means `AGMP Call`, a
  number from this app means `AGMP Website Call`. Both bidding counts one call
  twice, and it is invisible in the Ads UI because the two sit in different
  categories. The migration order is in `docs/GOOGLE-ADS-SETUP.md`; the part
  that bites is that Google's number swap must not be configured while
  HighLevel's pool is still swapping the same number.
- Reading the API: int64 fields (`clickThroughLookbackWindowDays`,
  `phoneCallDurationSeconds`) come back as **strings**, and
  `customer_conversion_goal.biddable` is **omitted when false** — a missing key
  is Secondary, not unknown. Both were found against live accounts.
- `compareToStandard()` is pure, separate from the fetch, so the rules can be
  re-checked against saved rows from a real account without credentials.

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
- **Their share host is a usable oracle: 200 for a token it knows, 404 for
  one it does not.** Verified against a real token and two invented ones. So
  a candidate token can be TESTED rather than guessed — which is how the
  scheduled_scan_id is tried when no campaign_link exists.
- **The campaign share token cannot be derived. It has to come from their
  dashboard.** Three things were tested and all are dead ends: their API does
  not issue `campaign_link` for a campaign it created (a completed run still
  returns `share_links: [image_link, dynamic_url]`); the `scheduled_scan_id`
  is not the share token (their host 404s it); and no endpoint creates one —
  they ship share-creation endpoints for AI Tracker, Projects and SERP, but
  not for scheduled scans. The two campaigns that DID have a `campaign_link`
  were the two opened by hand in their dashboard.
- **Per-KEYWORD maps are fully automatic and need none of that.** Their
  tokens ride in every webhook as `share_links.dynamic_url`, and on the
  white-label host they render the same way (verified: 200,
  `frame-ancestors *`). That is the default view — one keyword per tab — and
  it stays current on its own.
- The all-keywords map is the only thing that needs the manual step, and it is
  a PASTE: open the campaign in Local Dominator, copy the address, drop it into
  **Rankings → All-keywords map** on the client. Re-confirmed 2026-08-29 across
  all six live campaigns — `hasCampaignLink: false` on every one, detail
  `share_links` only ever `[image_link, dynamic_url]`, list endpoint empty. Try
  "Refresh map URLs" first anyway; it costs one press and stores anything the
  API does offer.
- **The paste survives.** Both the daily sweep and map-status only write when
  they FIND a link (`if (!url || url === client.rankMapUrl) continue`), and for
  these campaigns they find none — so a pasted URL is not overwritten. Clearing
  the field hands control back to the automatic capture.
- The field takes **any of the three forms** and keeps only the token: the bare
  token, our white-label URL, or their dashboard URL with its `taskId` and
  `link` parameters. That last one is what somebody actually has in their hand,
  and it was the one form the original regex rejected — storing the pasted
  string verbatim, which would have put `app.localdominator.co` in a client's
  portal. `rankMapTokenFrom()` reduces all three server-side.
- Do not spend another afternoon looking for an automatic route without new
  evidence.
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

### The content feed

`content-feed.ts` plus `/api/clients/[id]/content-feed` and the nightly cron
at `/api/cron/sync-content-feeds`.

**How the Activity tab learns that an article was published.** One field,
`Client.contentFeedUrl`, holds the RSS/Atom address of wherever the shop's
posts actually go up. We read it nightly and store what is new in
`SiteFeedItem`. That is the whole integration.

- **Read-only, no credential, vendor-agnostic.** Swap the writing tool and the
  feed keeps answering. Nothing to store encrypted, nothing to rotate. And a
  feed has no field for who wrote the post, so §2's white-label rule is
  enforced by the format rather than by our care.
- **Additive.** A post that scrolls off the end of the feed is NOT deleted:
  it was still published, and a history that shortens as it ages is not a
  history.
- Setting an address **checks it first** and syncs immediately. A feed that
  does not answer is worse than none — the Activity tab then reads as "nothing
  is being published" rather than "nothing is configured", so a failure is
  recorded on `contentFeedError` and shown on the tab.
- "Find it for me" reads `<link rel="alternate" type="application/rss+xml">`
  off the shop's own site, then tries the usual paths. Advertised first,
  because a guess that happens to 200 from a catch-all route is how you end up
  watching the wrong thing.
- The nightly sweep **adopts an advertised feed by itself** for any shop that
  has none, so the manual step disappears for every site that declares one. It
  will NOT adopt a path guess unattended — a catch-all that answers 200 would
  put another business's posts on this shop's Activity tab, and a client
  reading someone else's work as their own is far worse than reading none.
- The fetch goes through `validatePublicUrl` and uses **the URL that guard
  returns**, not the one it was handed — it upgrades http to https, and a
  guard you then bypass is not a guard.
- Parser precedence: the **unprefixed** tag wins over a namespaced one.
  `<dc:title>` beating `<title>` was a real bug caught by its unit test.

### Behaviour analytics (Microsoft Clarity)

`components/sites/analytics.tsx` (the tag) and `lib/clarity.ts` (reading it
back). Set up per shop on the admin **Advertising** tab, as a third tab beside
Google Ads and Microsoft Advertising — from that screen all three are the same
job (paste the id this platform gave you, for this one shop), so the panel's
own copy says what Clarity actually does rather than letting the shared tab bar
imply it reports conversions. The ads-only controls (enhanced conversions, Save
tracking, Check the live site) hide on that tab.

- **One project per shop.** A merged project averages away exactly the
  differences worth acting on — different traffic, geography and pages.
- **Paste the whole snippet.** `extractClarityProjectId` digs the id out of the
  tracking snippet, the tag URL or a dashboard URL. Demanding the bare code
  meant reading a `<script>` block and picking the right one of its quoted
  strings, with "clarity" and "script" sitting next to the one you want.
- **Two fields, treated differently.** `Client.clarityProjectId` is PUBLIC —
  it ships in the page source, because that is how the collector identifies
  itself — so it is stored in the clear. `Client.clarityApiToken` reads the
  data back and is encrypted.
- **The official snippet, inlined; not the npm package.** The package is a
  wrapper over the same `window.clarity` queue and would need a client
  component plus its bundle, on pages where hydration weight has been fought
  over twice. The snippet defines the queue synchronously, so tags set on the
  same tick are safe.
- **Tags are the point:** `shop`, `page_type`, `paid_click`. Without them the
  export API returns one undifferentiated pile per shop. `paid_click` is also
  the join to Google Ads, and a paid session gets `upgrade()`d because at
  auto-glass volumes an unprioritised replay is usually a bot.
- **The API returns AGGREGATES, NOT RECORDINGS**, a few calls per project per
  day, **last three days only** — which is why `/api/cron/sync-clarity` exists.
  A day not copied into `ClarityDay` inside that window cannot be fetched again
  at any price; it survives only in their dashboard, for a person to read by
  eye. The nightly job stores yesterday (not today, which is still
  accumulating) with the raw payload beside the extracted numbers, so a reader
  bug costs a recompute rather than a window that cannot be re-fetched. Replays and heatmaps are dashboard-only, human-eye
  things. A loop designed as "the model watches the recordings" is a loop that
  invents its findings.
- **The scoreboard is not in Clarity.** It is conversion rate in Google Ads on
  SEARCH campaigns — PMax mixes placements the landing page did not cause.
- Privacy: masking stays on, the quote form carries `data-clarity-mask` at its
  container so it is excluded explicitly rather than by trusting a dashboard
  setting, `identify()` is never called, and the shop's privacy page gains a
  "How this site is measured" section — **only** for a shop that actually has
  a project id, so no site claims a tool it does not use.

### Results (the monthly report)

`monthly-report.ts` + `components/MonthlyReport.tsx`, on the client's portal
(linked from the Booked tile, not a tab) and the admin's Results tab.

- **Every figure is the shop's own bookkeeping.** Booked counts and revenue are
  what they marked and what they typed. Nothing is estimated or grossed up — a
  revenue figure a client cannot reconcile against their own till costs trust
  rather than building it.
- A zero booked column reads as "this does not work" when it usually means
  nobody ticked the box, so the page **says which it is**, and reports how many
  enquiries are still open as the caveat on every figure.
- Empty months **in the middle** are shown; the empty tail before the shop
  existed is trimmed. A gap month is worth seeing; eleven blank rows read as a
  year of failure.
- **It is not emailed.** Building the numbers and mailing them to fifteen real
  business owners are different decisions.

### Response time

`response-time.ts`, shown on the admin client Overview. The answer when a
client says the leads are bad.

- Measured from **`Lead.firstTouchedAt`**, stamped once on the first move off
  NEW. NOT `statusUpdatedAt`, which holds the LATEST change — on a lead that
  went NEW → CONTACTED → SOLD that reports how long the job took, not how long
  the customer waited.
- **Median, with the mean beside it.** One lead answered five days late ruins
  an average while the typical response was twenty minutes. The gap between
  the two IS the finding: it says the shop is fine most of the time and drops
  some entirely.
- Leads predating the column are excluded **and counted as excluded**. A
  metric that quietly drops what it cannot measure reads as complete when it
  is not.

### Other pieces worth knowing

- `wordmark.ts` / `wordmark-image.tsx` — generated wordmark for shops with no
  logo. Initials come from the *distinctive* part of the name, because almost
  every client is "<something> Auto Glass" and first-two-words would badge
  them all identically. Header and footer draw it as live text; the PNG route
  exists for photo watermarks and downloads. Ships Inter Tight as TTF because
  Satori cannot read the WOFF2 `next/font` emits, and the font is read by
  path — so its routes are listed in `outputFileTracingIncludes` in
  `next.config.ts`. Miss that and it 500s in production while working in dev.
- **Fonts are bundled, never fetched at build.** `layout.tsx` loads Inter and
  Inter Tight through `next/font/local` from `src/assets/fonts/`, because
  `next/font/google` downloads from `fonts.gstatic.com` while the build runs.
  That download failed once on Vercel and took production down — the same
  commit having built green on the branch two seconds earlier, which is what a
  network dependency inside a build looks like when it breaks. Do not put it
  back. Refreshing the files means re-reading Google's `css2` output; they rev
  the URL when the font revs.
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
