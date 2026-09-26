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
  `OFFLINE_CONVERSION_SQL`, `CLAIM_FLAGS_SQL`) **and spread that array into
  `BOOTSTRAP_SQL`**, so the boot hook and the setup endpoint can never
  disagree. **DECLARING THE ARRAY AND NOT SPREADING IT IN IS INVISIBLE**: it
  compiles, lints, passes every other check here and deploys, because the only
  thing that notices is a query against a table nothing created.
  `INSURANCE_PROGRAM_SQL` shipped that way — written in the same commit as the
  model exactly as the rule above requires, verified locally against a real
  render because a scratch script had created the table directly, and the
  first press of Save in production answered 500 with `P2021: The table
  public.ClientInsuranceProgram does not exist`. `scripts/check-schema-
  bootstrap.ts` now reads the module's own exports and fails on any `*_SQL`
  array that is not applied, so an array added tomorrow is covered without
  anybody remembering the script exists. It also asserts every statement
  re-runs without RAISING — the test is "does it throw", not "does it look
  guarded", because the boot hook stops at the first error and the statements
  after it silently never run.

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
- **THE COUNTRY IS IN TWILIO'S PATH, AND IT WAS HARDCODED `US`**
  (`phone-country.ts`, `twilioCountryFor`). The search route takes a client id
  and never read it, so a British Columbian shop's 604 was searched against
  the US inventory — and the US and Canada share +1 and the same area-code
  plan, so that is a perfectly VALID request: HTTP 200,
  `available_phone_numbers: []`. Indistinguishable from "Twilio has none left
  in 805". The operator pressed search, nothing appeared, and there was
  nothing anywhere to read. **The PROVINCE beats `Client.country`**, because
  country defaults on old records while `state: BC` is typed from the address
  and no province code is shared between the two countries — deferring to
  `country` would reproduce the bug on the very client it was found on. `CA`
  is the one ambiguous code and the two live in different fields: `state: CA`
  is California, `country: CA` is Canada. The route also stopped swallowing
  Twilio's `message` and `code` — a refusal here is usually about the ACCOUNT
  (a country not enabled on it, a regulatory requirement for that country's
  local numbers) and Twilio says which, while "HTTP 400" is the one sentence
  nobody can act on. **An empty list now carries a note** naming the country
  it searched and why. `scripts/check-phone-country.ts` holds the stale-country
  case first.
- **TwiML is built by `dialTwiml()`, and `<Dial record>` must be one of FIVE
  documented values** (`DIAL_RECORD_VALUES`). Twilio does not reject an
  attribute value it cannot parse — it warns in the account debugger, drops
  the attribute and connects the call. This app dialled with
  `record-from-answering-dual`, one letter off `record-from-answer-dual`, and
  therefore ran on the default `do-not-record` for months. Every other part of
  the feature worked perfectly — the caller reached the shop, the status
  callback fired, the lead was written, the alert email went out — there was
  simply never a recording, so never a recording callback, so never an
  analysis row. An absence of scored calls is indistinguishable from a client
  nobody has got to yet. Found only when a shop had a ten-minute call and
  somebody went looking for the recording of a call they knew had happened.
  `scripts/check-twiml.ts` generates the real document and asserts on it,
  because this is the one output of the feature that nothing here reads back.
- TwiML uses `answerOnBridge`, and records dual-channel so the transcript can
  tell the two speakers apart.
- Twilio signature validation rebuilds the public URL from forwarded headers.
- **`(await import('twilio')).default`, never the namespace.** The package is
  CommonJS, so `await import('twilio')` returns a namespace object whose
  `validateRequest` is `undefined`. Reading it off the namespace threw on every
  inbound call: the voice webhook answered 500 with no TwiML, Twilio played an
  error message to a real customer, and the phone never rang. Seventeen calls
  over two weeks, and nothing surfaced it — no lead was written, so there was
  no wrong row to notice, only an absence that looks exactly like a quiet
  fortnight. All four Twilio routes share `verifyTwilioSignature`, so voice,
  whisper, recording and status were broken together while SMS kept working,
  because `lead-notifications.ts` had the correct form all along.
  `scripts/check-twilio-signature.ts` signs a request with Twilio's own
  algorithm and asserts we accept it — because BOTH failure modes here are
  invisible from outside: throwing drops every call, and always-returning-false
  drops every call too while reading in the logs as an attack.
- **`verifyTwilioSignature` reports, it does not throw.** The voice route's
  contract is that whatever goes wrong the caller still reaches the shop, and
  every path in it returns TwiML — which the signature check broke by throwing
  above the comment that says so.
- **"NOBODY PICKED UP" IS A CLAIM ABOUT THE SHOP, and three of the four missed
  statuses do not support it** (`callOutcome` in `call-display.ts`).
  `MISSED_CALL_STATUSES` is `no-answer | busy | failed | canceled`, and every
  one of them produced that single sentence. Only `no-answer` means it rang and
  nobody answered. `busy` is an engaged line, `canceled` is the caller hanging
  up mid-ring, and **`failed` means Twilio could not place the forwarded call
  at all** — a `forwardTo` changed at the shop and not here, a disconnected
  line, a carrier rejection, a geo permission. Reported by a shop who got
  "Missed Call — Nobody picked up" and said their phone never rang: both were
  true, and the alert was the thing that was wrong. The copy now names which it
  was, says plainly when the phone never rang, and OWNS the `failed` case as
  ours — a shop reading that has done nothing wrong, and telling them to answer
  faster would be the worst sentence in the app. `canceled` reports `rang:
  null`, never a guess: how much of the ringing reached the handset depends on
  the carrier.
- **"MISSED" MEANT TWO OPPOSITE THINGS, AND SHOPS READ THE WRONG ONE**
  (`callBadge()` in `lib/call-analysis/rating.ts`, `CallBadgeChip`). The
  coaching rating put "🙁 Missed" on an ANSWERED call the model graded poorly —
  shorthand for "opportunities were missed" — while the portal leads list
  never selected `callStatus`, so a call that genuinely rang out carried NO
  marker. The home screen's "3 missed calls in the last 7 days" sent the shop
  into a list where those three were unmarked and three answered ones said
  "Missed": exactly backwards, on the screen whose job is who to ring back.
  - **"Missed call" now means a call nobody answered, and nothing else uses
    the word.** It is the only RED badge, because it is the only one needing
    action; `failed` reads "Call didn't connect" (ours, per the note above) and
    is still red because the caller still needs ringing back.
  - **The coaching grade names what happened ON THE CALL** — Booked on call,
    Quote given, Callback set, Well handled, Coaching tips — never a lead
    state. "In progress" read as the lead's status and kept saying so after
    the shop marked the job booked; "Quote given" is still true a month later.
    The coaching report used to show "Quote Sent" in a badge beside a face
    reading "😐 In progress" — one call, two vocabularies, one card. It now
    asks the same function the lists do.
  - **A question is not graded as a sale.** `info_only` shows "Question call":
    the rubric is a sales rubric, and "are you open Saturday?" answered
    perfectly scores badly against it.
  - **`COMPETENT_SCORE` (65) is read by the prompt AND the display.** The
    prompt calls 65–80 competent; the display split that band at 70, so a call
    the model scored competent was shown as "opportunities were missed".
  - **The row's badge is its LATEST call** (`latestCall`): someone whose first
    call rang out and whose second got through has been spoken to.
  - **A call's row arrives before its outcome** — `recordCall` writes it as the
    call comes in — so the portal stream now re-sends call facts as
    `lead-call` and the page MERGES only those fields; without it a live
    missed call sat unmarked until refresh. Verified against a render: the row
    arrived bare and turned "Missed call" when the status landed.
  - `scripts/check-call-badge.ts` holds the collision first, both directions.
- **THE GRADER GIVES FEEDBACK THE WAY THE RESEARCH SAYS ADULTS CAN USE IT**
  (`coaching-prompt.ts`). Kluger & DeNisi's meta-analysis (1996) found over a
  third of feedback interventions made performance WORSE, and worse the more
  it pointed at the person rather than the task; Hattie & Timperley (2007)
  found praise of the person diverts attention from the work; and the
  "feedback sandwich" changes how feedback feels but not what people do, and
  trains them to hear praise as the warning before a "but". So: feedback is
  about moments on the call, never traits; praise is specific, quoted, and
  never a warm-up for criticism; a tip looks FORWARD ("Next time, try …",
  with words the rep can use); one tip in the note. The report says "Try
  next time", not "Better approach".
  - **A BOOKED CALL IS CELEBRATED.** Floor `BOOKED_SCORE_FLOOR` (80), a
    praise-only note, two specific things done well, at most one "idea for
    next time" and only if something risked the booking. The floor is
    ENFORCED in code (`settleAnalysis`, in the pipeline) as well as asked for
    in the prompt — a model does not follow every instruction every time, and
    a booked call scored low shows as a dip on the week the shop did best.
  - **§2 IN THE RUBRIC.** "Mentioned differentiators — warranty, OEM glass,
    certified techs, ADAS (10)" paid a shop to make those claims, and a shop
    without certified techs could only earn the points by saying something
    untrue. The rubric now credits whatever the rep actually said about why to
    choose them, never deducts for a missing claim, and never suggests a claim
    the transcript does not show is true. The focus-area label lost its list
    of claims for the same reason.
  - **Question-only calls are not graded as sales** at the source now, as
    well as in the display.
- **CALL QUALITY OVER TIME** (`quality-trend.ts`, `CallQualityTrend`,
  `/api/portal/call-quality`, on Reports → Calls in the portal, linked from
  "Top 3 things to work on"). Weekly average score for sales calls over twelve
  weeks, headlined by the last four weeks against the four before — the
  sentence is the point, the chart is the evidence.
  - **Every silence is deliberate**, because the chart makes a claim about
    PEOPLE in front of their boss: no verdict under `MIN_CALLS_HEADLINE` calls
    a side (2 v 2 is a coin toss), within ±2 points is "holding steady", an
    empty week is a GAP never a zero, and averages are pooled over calls, not
    weeks, so one bad call in a quiet week cannot weigh like twelve.
  - **Per rep, only from what the rep SAID.** Every call forwards to the
    shop's one line, so nothing here knows who picked up; the grader records
    `rep_name` from the rep's own introduction ("this is Mike") and nothing
    else. `normalizeRepName` runs on write and again on read. It handles any
    letter — the first cut stripped accents, turning "José" into "Jos", and its
    own test asserted the mangled form. Unnamed calls count for the team.
  - **Four lines at most** (team + `MAX_REP_LINES` 3): the reference palette
    order is validated for colour-blind separation as a set of four, and two
    of its hues sit under 3:1 on white, so a table view ships with the chart.
  - The y floor follows the data but never above 40, with the top pinned at
    100: 0-100 left half the plot empty, and a scale zoomed to the data turns
    a two-point wobble into a cliff.
  - Weeks are Monday–Sunday in the SHOP's timezone.
    `scripts/check-call-quality-trend.ts` holds the Sunday-11pm-in-LA case,
    the silent cases first.
- **`Lead.callStatus` was stored from day one and rendered NOWHERE.** Counted
  and bucketed, never shown — so "the client says it never rang" could only be
  answered from Twilio's console, which is the one place the person asking is
  not. The lead page now names the outcome, whether the phone rang, Twilio's
  own word for it and the number dialled.
- **A FORWARD THAT NEVER CONNECTS IS THE `<Dial record>` FAILURE WITH A WRONG
  ROW INSTEAD OF NO ROW, WHICH IS WORSE** (`call-connect-health.ts`, check
  `calls-not-connecting`, in the daily sweep). A `failed` dial still writes a
  lead, still sends the alert and still counts in the monthly report, so
  nothing is absent and nothing looks broken: the paid clicks keep arriving,
  the phone never rings, and the report tells the shop every month that they
  missed every call. The only person who can see it is the shop, and what they
  see is us blaming them. **ONLY `failed` FILES A FINDING** — `busy`,
  `no-answer` and `canceled` are facts about the shop or the caller, and firing
  on those files one against every shop that has ever been engaged, which is
  how a queue goes permanently red and people stop reading it. ALERT when
  nothing connects, REVIEW past `FAILURE_SHARE`, silent for a stray, and
  `judged: false` under `MIN_CALLS` so a quiet week cannot resolve a live
  finding. `scripts/check-call-connect.ts` holds both directions, the silent
  cases first.
  - **BUSY TO EVERYTHING, NEVER ONCE RINGING, is its own REVIEW.** A busy line
    is normally a busy shop and files nothing — but a destination that returns
    busy to every call for a week while nothing ever rings is rejecting them,
    not engaged on them: call waiting off, Do Not Disturb left on, a handset
    silencing unknown callers. A single `no-answer` or `completed` in the
    window proves the line works and it stays quiet. Found by reading a real
    day rather than reasoning about it — NorthStar's 9:19 call came back
    `no-answer` after 26 seconds, which is the proof that made the three
    lunchtime busies an ordinary engaged line and not a fault.
- **Vercel's runtime logs ARE the Twilio log for the last day** (Pro retention
  is 24h; wider windows return nothing and a broad query times out — scope to
  an hour or two). `[Twilio Voice]` names the client, the tracking number and
  the `forwardTo`; `[Twilio Status]` names the `DialCallStatus` and the
  duration. Those two lines answer "what happened on this call" without Twilio
  credentials, which this environment does not have.
- Recording URLs need Basic auth, so recordings are copied to Blob storage.
- Webhook responses: `new Response(null, { status: 204 })`. A 204 **with** a
  body throws, which returns 500, which makes Twilio retry, which runs the
  analysis twice.
- **TEXTS TO A TRACKING NUMBER LAND IN THE APP** —
  `/api/webhooks/twilio/sms`, `twilio-sms.ts`, `sms-lead.ts`,
  `LeadMessage` (bootstrap: `SMS_INBOX_SQL`). The hosted sites have always
  said "text a photo of the damage, it is the fastest way to a firm price",
  and every one of those texts used to be swallowed: numbers were bought with
  a VoiceUrl and nothing else, so Twilio had no instruction for a message. No
  error, no missing row anybody expected, and the customer believed they had
  sent it — the same invisible absence as the `<Dial record>` typo.
  - **THE ATTACHMENT IS THE POINT, and it is what differs from
    `call-lead.ts`.** The common case is not a stranger: it is somebody who
    submitted the quote form thirty seconds ago — carrying a gclid, a vehicle,
    a postcode — then sent the photo the confirmation asked for. So an inbound
    text finds the same-day canonical lead for that number
    (`findSameDayDuplicateCanonical`, the rule the form and the calls already
    use) and joins it. A new row would split one enquiry in two and leave the
    photo on the row with no attribution while the click sat on the row with
    no photo.
  - **The MessageSid is the retry guard AND the unique index is the real
    guarantee.** Twilio retries by firing a second request, and two identical
    webhooks arriving together both pass a `findUnique` before either writes —
    so a `P2002` on insert is not an error, it is the other copy winning, and
    it reports itself as a retry. Found by reading the log of a real retry
    that raced its original.
  - **Photos are COPIED to Blob storage**, exactly as recordings are: Twilio's
    media URLs need Basic auth, so nothing in a browser or an email can render
    one, and they do not outlive the message. A copy that fails costs the
    photo, never the message or the alert.
  - The first image is also written to `formData.damage_photo_url`, **fill-in
    only**, because that is where all three existing readers already look — the
    alert email renders it inline, and the admin and portal lead views read it.
    A photo the customer attached to the form is the one they chose first.
  - **NO AUTO-REPLY.** An automated answer from the shop's number is this
    platform speaking as the shop to their customer, and the only useful thing
    it could say is a timing promise §2 forbids. The shop gets an urgent alert
    with the picture in it and answers as themselves. A decision, not an
    omission: changing it needs a per-shop flag and copy that promises nothing.
  - STOP/CANCEL/QUIT and the rest are matched on the WHOLE message, because
    *"stop by tomorrow and I will show you the crack"* is an enquiry and the
    best kind. `scripts/check-sms-inbox.ts` holds those traps and the media
    reader (`NumMedia` is a **string**; ten is Twilio's cap).
  - Numbers bought from now on carry `SmsUrl` in the purchase request, for the
    same reason `VoiceUrl` does — no window where the number exists and a text
    to it goes nowhere. Everything bought earlier needs
    **Maintenance → "Point every tracking number's texts at the app"**
    (`/api/admin/twilio/resms`, dry run first; it re-sets `VoiceUrl` too so a
    number cannot end up half-configured).
- `site-phone.ts` swaps the displayed number to the tracking number at the
  data layer. The LocalBusiness JSON-LD and the contact/locations cards keep
  the **real** number for NAP consistency — schema is built before the swap,
  and that order is load-bearing.
- **ONE `phone` FIELD WAS DOING TWO OPPOSITE JOBS, and the rule is DIRECTION.**
  `withSitePhone` now returns `callbackPhone` beside the swapped `phone`, and
  every caller takes both (`Object.assign`, not `client.phone = …`).
  - **Inbound** — every "call us" link, header, footer, mobile bar, the
    widget's call button — is the DISPLAY number, so the call is recorded and
    attributed. That is what the swap is for.
  - **Outbound, and anything the customer will see ARRIVE** — the shop's own
    line. The quote confirmation said *"They will call from (689) 366-6860 —
    save the number so you do not miss it"* while naming the TRACKING number:
    the shop dials back from their handset, so the call that arrives shows a
    different number from the one the customer was just told to save. That is
    the missed call the sentence exists to prevent.
  - **`sms:` paths were outbound and are now INBOUND** — the one reversal
    here. They pointed at the shop's handset because a text to a tracking
    number was swallowed: bought with a VoiceUrl and nothing else, Twilio had
    no instruction for a message. There is a webhook now (see below), so the
    site texts the TRACKED number again, which is the point of it.
  - Missing, the copy omits the number rather than naming the wrong one, and
    with no tracking number at all the two are identical and everything reads
    as it always did. `scripts/check-site-phone.ts` holds all three
    configurations.
- **The site speaks as the SHOP: "we", never "they".** The confirmation read
  "Your request is with X. They will call…", which is a lead broker handing
  the customer on — the one thing this platform is not, and the last thing a
  shop wants said on their own page.
- **TWO NUMBERS ON ONE CARD NEED TWO ROLES**, or the pair reads as a mistake:
  "we will call you from (714)" directly above a button saying "call (689)"
  leaves the customer wondering which one is the shop and whether they
  misread. So the sentence is the call WE make and the button is the call THEY
  make — *"We will call you from {real} … save it so you know it is us"* over
  *"Rather not wait? Call {tracked}"*. Labelled by **ACTION, never by naming a
  department**: "our dedicated quote team" was the suggested framing and
  cannot go in a template that renders for fifteen shops, most of them one or
  two people in a van — it is §2's invented fact about a business, the same
  staffing claim `copy-claims.ts` refuses for the drafters. When a shop has no
  tracking number the two are the same number and the split would be nonsense,
  so that case keeps the single sentence it always had — which is twelve of
  the fifteen.

### Hosted sites

`src/app/sites/[slug]/` (home, `services/[service]`, `locations/[city]`,
privacy, terms, and the catch-all that serves kept pages, flat city addresses
and the insurance-claim page) rendering `components/sites/shared.tsx` and
`site-body.tsx`.
Middleware rewrites `{sub}.glassleads.app/*` to `/sites/{sub}/*`.

Every page type is the same body with a different hero and lead-in. Page
order is deliberate: hero and quote form, services, how it works, insurance
and cost, warranty, gallery, reviews, **the shop's own story**, map, FAQ,
service areas, closing CTA. The story sits after the proof on purpose — it is
the block that talks about the business rather than the customer, and ahead of
the proof it stood between a paid visitor and every section that answers
"what will this cost me".

**AN "INSURANCE" AD GROUP NEEDS A PAGE ABOUT THE CLAIM**
(`insurance-programs.ts`, `components/sites/insurance-program-page.tsx`,
`ClientInsuranceProgram`, bootstrap: `INSURANCE_PROGRAM_SQL`, the card on the
Website tab). The full page shell — hero, quote widget, tracked number, gclid
capture — at its own flat address, which is the whole point: an ad can point
at it. Two kinds, one mechanism.

- **A NAMED PUBLIC INSURER** (`icbc`, `sgi`, `mpi`). Canada's provincial
  insurers are public monopolies with trademarked names, and a shop
  advertising "ICBC windshield repair" is naming somebody else's trademark in
  ad copy. The carve-out that makes that lawful turns on the LANDING PAGE
  being primarily about the trademarked service, so an ICBC ad group pointed
  at a general auto glass page is the ad text hanging on nothing. All seven of
  AGS's enabled ICBC ads had `final_urls: ["https://glassbc.com/"]`, the bare
  home page, while three of the ad groups were named ICBC, Insurance and
  Glass Express.
- **THE GENERAL PAGE** (`general`, `/insurance-glass-claims`) for everyone
  else. Its coverage section is the per-state rule out of `insurance-rules.ts`
  — copy that is ALREADY compliance-reviewed and already renders in the band
  — so it is complete the moment it is switched on and has NO publish gate.
  That asymmetry is the design: the lesson of the story sections is that a box
  an operator has to fill stays empty, and "do you take insurance" is the
  objection every shop's ads run into.
- **NO MODEL WRITES THIS PAGE, AND THE ICBC ONE STILL WRITES ITSELF**
  (`programDefaultCopy`). "What does ICBC cover" is the worst question to hand
  a model — it answers fluently, confidently, and with a deductible figure it
  invented. But that argument is about a MODEL, not about a SOURCE: a BC
  shop's own published ICBC page is a business's own statement about its own
  process, which is what §2 has always permitted and where the importer gets
  everything else. So the ICBC copy is a fixed paragraph and a fixed sequence,
  reviewed once, filled in when an operator picks the programme or ticks the
  network box, and edited freely afterwards — the `insurance-rules.ts` shape,
  not a drafter. SGI, MPI and the general page have NO default for the same
  reason they have no network name: a paragraph nobody checked is worse than
  an empty box, because the empty box is the one that gets filled in.
  Publishing is still REFUSED while a named programme has nothing
  programme-specific, because an empty page at an ad's destination costs the
  same per click as a full one and answers nothing.
- **A SOURCE IS A SOURCE, NOT A LICENCE.** The page that copy is drawn from
  also advertises "Premier Vendor with major insurance providers such as
  Family Insurance, BCAA, and Manitoba Public Insurance" and a bare "lifetime
  guarantee". The first is §2's preferred-provider claim — how insurers RANK a
  shop, rather than a network whose membership is checkable — and the second
  is a named warranty with no terms beside it. Copying from a real page is
  exactly when those slip through, which is why `check-insurance-program.ts`
  holds all of them as traps.
- **EVERY FILLED LINE IS GATED ON THIS SHOP'S OWN FLAGS**, so the page is true
  for the shop it is filled for rather than for the shop it was read from —
  and **NETWORK MEMBERSHIP IS NOT PERMISSION TO SAY WE FILE THE CLAIM.** The
  source runs the two together because at that shop both are true; they are
  separate facts and `filesInsuranceClaims` is the one §2 gates claim handling
  on. Ungated, the filled page said "we submit the claim for you" in the
  coverage note and "give ICBC what they need from our side" three inches
  below it — the page disagreeing with itself about the one thing the reader
  came to find out. It was in TWO places (`programDefaultCopy` and
  `networkSentence`) and was found by RENDERING the page, not by reading the
  code: the first check passed because it only tested the untick case.
- **`inNetwork` IS THE ONE CLAIM §2 OTHERWISE BANS**, so it is a TICK and not
  a text box — nobody can widen it into "approved by" on the way in — it says
  MEMBERSHIP and never endorsement, and it renders NOTHING for a programme
  whose network name this platform has not confirmed (SGI, MPI). A membership
  claim with nothing named is unfalsifiable, and a hedge would be worse than
  silence. The tick's real value to a reader is `networkProcessLine` — what
  being in the network CHANGES ("you do not need to contact ICBC yourself"),
  sourced from a BC shop's own published page — not the badge. Set on the
  **Website tab → Insurance claims page**, and the collapsed card names it for
  a shop in a public-insurer province, because "where do I mark them as in the
  network" is the question that brings somebody to this card and it used to
  talk only about landing pages.
- **THE DISCLAIMER HAD TO MOVE WITH IT.** The insurance band's small print
  ends "not affiliated with or endorsed by any insurance company" — true for
  fourteen of fifteen and flatly untrue on a site that says elsewhere the shop
  is in an insurer's repair network. So `affiliationLine()` decides it, every
  page type loads the record (`getInsuranceProgram`) to ask, and the band takes
  it as a REQUIRED prop with no copy of its own. Both halves published is a
  contradiction invisible from either page on its own, and the one under the
  network claim is what reads as the lie.
- **NO ROUTE FILE.** A `page.tsx` would give it a second address that also
  answers 200, which is what `site-paths.ts` exists to prevent; the catch-all
  imports it exactly as it imports the city and service pages, metadata
  included. The slugs are reserved in `pathOverrideProblem`, listed in the
  sitemap when published and listed as EXCLUDED with the reason when not —
  and **the page-kind list is a LEAF MODULE** (`sitemap-groups.ts`) because
  adding `insurance` to `SitemapGroup` left three hand-written copies in
  `SitePagesCard` behind. The header counts `entries.length` while the rows
  render per known group, so the card read "12 pages listed" and showed 11,
  with the missing one being the page somebody had just built — on the card
  whose whole job is answering "is this page in the sitemap". The union is now
  DERIVED from the ordered array and the labels are a `Record` over it, so a
  new group cannot compile without a position and a name. The
  operator-typed copy joins `editorialFields`, so the daily sweep reads it for
  rogue numbers and premises claims like any other editorial field — marked
  `writable: false`, because a near-miss rewrite of a coverage note changes
  what a shop promises about somebody's insurance.
- **THE MEMBERSHIP IS THE SELLING POINT, SO IT CANNOT LIVE ON ONE PAGE**
  (`networkHighlight`). It rendered in exactly two places — one sentence
  inside the claim page and the small print under the insurance band — so a
  visitor landing on the windscreen page, which is where most paid clicks go,
  never saw it. It is now the badge in the top bar, the first item in the
  footer trust bar, a hero trust line, and a CALLOUT BAND directly under the
  hero on every page type. ONE function decides all of them, because the gate
  is subtle twice over: the TEXT needs the tick and a confirmed network name,
  and the LINK needs the page PUBLISHED as well — `path` stays null until
  then, since a nav entry pointing at an unpublished page puts a 404 in the
  header of every page on the site.
  - **The nav SPENDS a slot rather than adding one.** `SiteHeader` is
    width-budgeted — four service links plus both buttons already do not fit
    an lg row — so `withNetworkNav` puts the claim page first and drops the
    services to three.
  - `NumberedSteps` is ONE implementation, read by "how it works" and by the
    claim steps. The second one was written as its own card grid and looked
    like a different website: plain boxes, small number chips, no eyebrow, no
    connector — and four steps in a fixed three-column grid left the fourth
    alone under a half-empty row. `stepColumns` derives the grid from the
    count so no row holds one, and the connector is suppressed at the end of
    every row rather than only on the last step.
- `scripts/check-insurance-program.ts` holds both directions, the ABSENCE
  cases first: no network claim without the tick, no invented coverage, no
  hedge for an unconfirmed network, no link while the page is a draft, the nav
  unchanged in every negative case, and the disclaimer byte-for-byte unchanged
  for the fourteen shops with no programme. The last one is also checked
  against a real render — a no-network shop's page is identical to what it was
  before any of this existed.

**A PUBLIC-INSURER PROVINCE HAS NO "CARRIER", AND EVERY SHARED LINE SAID IT
DID** (`PUBLIC_INSURERS` and `insurerNoun()` in `insurance-rules.ts`). With
`state: BC` every piece of insurance copy fell through to the private-market
answer, so a British Columbian shop's own site told its customers that "most
carriers waive the deductible on a chip repair", to "check with your carrier",
and that "every carrier and policy is different" — in a province with exactly
one insurer, which is not a softer truth but a description of a market the
reader is not in. Nothing goes red for it: it renders perfectly, it reads
fluently, and the only person who can see it is somebody who lives there.

- `insuranceForState` returns a **`'public'`** rule for BC (ICBC), SK (SGI)
  and MB (MPI), naming the insurer and pointing the driver at them. `note` is
  deliberately absent: there is a real one to write about deductibles and
  about what a claim does to a record, and nothing here can source either, so
  the card is SHORTER rather than confident.
- **QUEBEC IS NOT ON THE LIST.** The SAAQ covers bodily injury; glass is
  property damage and goes through a private insurer, so a Quebec driver
  really does have a carrier. Alberta and Ontario are private markets
  throughout. Adding a province here is a claim about that province.
- `insurerNoun()` is what the hero cost line, the insurance band's four
  "carrier" sentences, its disclaimer and the default FAQ all ask, so the name
  is decided once. `chipDeductibleNoteFor()` drops the "most carriers waive
  it" point where there is no market to waive it.
- **`insurance-programs.ts` BUILDS ITS CATALOGUE FROM THIS TABLE.** The leaf
  module already had to know who insures a driver in British Columbia, and a
  second list of insurer names is the copy that drifts — as one page calling
  it ICBC while another says "your carrier", which is the bug itself.
- The `coverageLine` on an entry is null until somebody SOURCES it. "SGI is
  the auto insurer in Saskatchewan" is a fact about the province; what SGI
  pays for is a fact about a policy, and this platform is not the insurer.

**Headlines name an AREA, not the address** (`site-area.ts`, `Client.marketArea`,
edited on the Website tab; bootstrap: `MARKET_AREA_SQL`). A shop sits in one
city and sells to a region — Auto Glass Kings are in Huntington Beach and work
Orange County — and an H1 naming the city tells most of the people who land on
it they are on the wrong site. Set the field and the H1s, **the eyebrow above them**, page titles, meta
descriptions, the top bar and the OG card say the region; leave it empty and
everything reads exactly as it did, from `Client.city`. It touches **only**
what a headline says: the address, the LocalBusiness `addressLocality`, the
contact and location cards, the legal pages and the city pages keep the real
city, because those are NAP facts cross-checked against the Business Profile.
The eyebrow used to keep the city as a "local keyword anchor" and it was
wrong: NorthStar read "· LITTLE ELM, TX" directly above "Cracked windshield in
Dallas–Fort Worth?", two lines disagreeing about who the page is for, the
smaller one naming a town most of its readers have never been to. **The rule
is that the broader area is always what a headline says** — where the shop
sits is carried by the serving line, the contact card, the map and the schema.
A city page's own eyebrow still names its city; that is what the page is. `AreaNaming.marketArea` is
deliberately REQUIRED rather than optional — every site page loads its client
through an explicit Prisma `select`, and an optional field made a page that
forgot it compile cleanly and render the city forever, which is exactly how
this shipped wrong the first time. It is a claim about coverage, so it is
typed by an operator and never inferred.

**A SERVICE-AREA BUSINESS HAS NO SHOP, AND THE SITE MAY NOT SAY IT HAS ONE**
(`site-premises.ts`, the tick on the Business tab's "What we're allowed to
say"). Stored inverted as `Client.hasShopLocation`, which has existed since the
beginning, defaults true, is asked by the public intake ("Customers can come to
a shop") and was read by the legal pages, the footer and the map all along —
what it never had was a CONTROL, so after approval the only way to change the
answer was an API call. The same trap `ClientStatusCard` records: a field whose
consequences were reachable only through the API. MAG Mobile has no storefront
and their pages said *"Serving Central Florida from our Orlando, FL shop"* and
*"Bring the vehicle to the shop"* — §2's invented fact about a business, in its
one actionable form, because somebody drives to an address to find nothing
there.

- **THE FLAG NOW WINS OVER STORED ROWS.** `MapSection` read
  `!hasShopLocation && locations.length === 0`, on the reasoning that a
  `ClientLocation` row is proof of a shop whatever a legacy default says. True
  while nobody could change the default; now it is an operator answering the
  question, and a tick that leaves a map and a street on the page does not mean
  anything. A row left behind by the importer is not evidence against them.
- **The ADDRESS is not the copy.** The address fields stay filled and stay
  used — the rank grid centre, `insurance-rules.ts` by state, the Business
  Profile, the legal pages' locality. What changes is only what a page SAYS.
- **The city survives in the serving line.** `servingLine` drops the building
  and keeps the place: "based in Orlando, FL", never nothing. The city is the
  half that makes them findable and believable, which is why `site-area.ts`
  names it at all. `hasShopLocation` is REQUIRED on that call for the same
  reason `AreaNaming.marketArea` is — an option a page could forget is a page
  that compiles and claims a shop forever.
- **THE MAP STAYS; WHAT IT SHOWS CHANGES.** Dropping the section was the first
  answer and it was wrong: for a business whose whole identity is the area it
  covers, that is the section answering "do they come out this far", which is
  the only question that visitor has. So the map is their city zoomed out
  rather than a pin on a door, the head reads "Where we work · Serving
  {area}", and the card says where they are BASED (city and state, no street,
  no postcode) with the covered towns beside it. The query is the CITY, never
  the region — handing "Central Florida" to the embed asks Google to resolve
  something it may resolve oddly, and a map that lands in the wrong place is
  worse than one merely zoomed in — so the ZOOM carries the difference
  instead, and only for a SAB: a shop with no verified profile reaches the
  same fallback beside its own street address, where the tighter frame is the
  useful one and is what it has always rendered. A SAB gets the area map
  whether or not it has a profile, because the name query is what puts the pin
  on a door.
- **The JSON-LD drops `streetAddress`, and keeps the locality.** A SAB's own
  Business Profile carries no street (Google's guidance is to hide it), so
  markup that publishes one disagrees with the listing it exists to
  corroborate. `hasMap` and branch entities go too; `areaServed` is what says
  where they work.
- **Mobile service and premises are INDEPENDENT, and the unhandled pair was
  MAG's.** The "how it works" third step fell through to "Bring the vehicle to
  the shop" whenever mobile was off — so no-shop-and-no-mobile, a half-filled
  record, got the one sentence that cannot be true. It now names no place at
  all, and the Business tab warns about the combination.
- Several template lines said **"the shop"** in the third person — "Ask the
  shop to check", "the shop comes to you", "talk to the shop doing the work" —
  which broke the "site speaks as the SHOP: we, never they" rule for all
  fifteen, not just the one with no shop. Fixed to "we" rather than gated.
- The one "shop" left on a SAB's page is the reviewed statutory sentence *"Your
  choice of repair shop is yours to make"*, which is the customer's legal right
  and says nothing about our premises. `scripts/check-site-premises.ts` holds
  both directions: a SAB's copy contains no premises word in any
  configuration, and a shop's copy is byte-for-byte what it always was —
  because being too eager here costs fourteen shops the line that makes them
  findable, and being too lenient sends somebody to a car park.

**What an image upload ACCEPTS lives in `image-formats.ts`, once.** The file
picker's `accept` list and what sharp can decode are two lists that have to
agree, and drift is silent in the worse direction: a format the server handles
is greyed out in the dialog, so the operator concludes the app cannot take it.
AVIF sat in that gap for as long as it existed — sharp has decoded it all
along (libheif + libaom ship inside `@img/sharp-libvips-*`), the picker simply
never offered it. Both the MIME type AND every spelling of the extension are
listed, because a system that does not know a type greys the file out exactly
as if it were never named — `.jpeg` missing beside `.jpg` is the same bug one
character wide. SVG stays OUT: sharp reads it only with librsvg, which
Vercel's build does not guarantee, and it would fail as a broken image in a
live header rather than as an error. `scripts/check-image-formats.ts` encodes
a real file of every format on the list and runs it through the real decoder,
which is also what pins AVIF support — that is a property of an installed
package, and a sharp upgrade could take it away with no symptom but uploads of
one format starting to fail.

**Photos take a pasted address too** (`PhotoManager`,
`POST /api/clients/[id]/photos` with JSON `{ url }`), several at once, split on
newlines and commas — the reason to be pasting at all is that somebody is
copying them off the site this one replaces. It COPIES, never references, and
unlike the logo route it REFUSES when the copy fails rather than keeping the
address: a logo is the one image whose absence breaks the page and it is never
watermarked, while a gallery photo that silently arrives unmarked and pointed
at another host is worse than one the operator is told to upload. A failure
part-way does not abandon the rest of the list — a dead address among eight is
ordinary — and the result line says what happened to all of them.

**Story sections can be DRAFTED for a shop that had nothing to import**
(`story-sections.ts`, `POST /api/clients/[id]/draft-story`, the card in
`SiteContentEditor` above the sections). The importer was the only thing that
had ever filled that field, so a shop with no previous website — or one whose
site was a single page — got an empty box, a `+ Add section` button and, in
practice, no story at all.

It is the riskiest button in the admin, because "write the story of this auto
glass shop" is a request a model answers fluently and wrongly: years in
business, a family founding, certifications, same-day service, a
preferred-provider relationship with an insurer. Every one of those reads
perfectly and breaks §2. So it is built like `nearby-cities.ts` rather than
like a generator — **the model is a source of prose, not of facts**:

- The prompt carries only what this app holds (the service flags, the market
  area, the shop city, `serviceAreas`, and the two claim flags) and says those
  are the only facts that exist.
- Every section that comes back is **SCREENED, and a section that trips it is
  DROPPED** — not trimmed. A half-edited paragraph is a sentence nobody wrote
  and nobody reviewed, and the operator can no longer tell which half came
  from a model. The note names what went and the words that did it, because a
  screen firing silently looks exactly like a model writing two sections
  instead of three, and the operator's next move — press it again — is the one
  that cannot help.
- **The screen is gated on the SAME per-shop flags the template is.** "We come
  to you" for a shop with no mobile unit, "text us a photo" to a landline,
  "we handle the claim" where `filesInsuranceClaims` is off: those are the
  claims §2 gates, arriving in a free-text field that nothing guards at render
  time. A service that is OFF is screened by keyword too — the services grid
  strips its own card, a paragraph mentioning sunroof glass strips nothing.
- It will not write their **history** (nothing here knows it — the UI says so
  rather than letting the button imply otherwise), the **warranty** (the
  warranty band states the terms; "backed by our warranty" mid-story is the
  §2 failure that band exists to prevent), or **insurance and cost** (the
  insurance band is built from compliance-reviewed `insurance-rules.ts`, and a
  story section covering it is a second unreviewed version of the same claim).
- Chips are **two flags for one job**: rock chip repair and windshield repair
  are the same resin injection, so the word is only forbidden when neither is
  on. Screening on either alone threw away the most useful paragraph on the
  page over a distinction the shop does not make itself.
- The route WRITES NOTHING. The drafts land in the editor's state and its own
  autosave commits them — a route that saved its own output would also race
  that autosave, which PUTs the whole document.
- **READING THE RESPONSE IS ITS OWN MODULE** (`draft-json.ts`,
  `parseDraftArray`, shared with the FAQ drafter), because
  `text.match(/\[[\s\S]*\]/)` was the whole parser and the FIRST real press in
  production answered "Could not read the draft that came back" — a sentence
  that names nothing, over a response nothing logged. Three different failures
  wore that one message: a **truncated** response has no closing bracket, so
  two finished sections were thrown away with the third (they are salvaged
  now); a **bracketed aside in the prose** — "the sections [built only from
  the facts above]:" — made the greedy match start in the wrong place, so the
  array is found by scanning for a `[` actually followed by an object,
  honouring string literals and escapes; and an **object wrapper**
  (`{"sections": […]}`) or a fenced block are ordinary returns, not faults.
  What is left is told apart on purpose, because the fixes are opposite:
  `truncated` means allow more, `no-json` means the model answered in prose (a
  refusal or a question — its first 160 characters are the diagnosis and they
  are in the message), `unparseable` means malformed JSON. **The route now
  logs the stop reason, the output token count and the raw text**; saying
  nothing server-side bought nothing and cost the one fact that settles it,
  exactly as with the portal login. `max_tokens` is 6000 against a need of
  well under a thousand — the tokens are only spent if they are used, and a
  budget that only just fits turns a slightly long draft into a total failure.
- The card shows while there is nothing REAL in the field, not merely while
  the array is empty: one press of `+ Add section` leaves a blank row, and
  hiding the button behind that means the first thing an operator does when
  faced with an empty box is also the thing that takes the help away.
- `scripts/check-story-sections.ts` holds both directions. Too lenient and a
  fluent invention reaches a real shop's live site with nothing going red; too
  eager and every draft is thrown away, so the button reads as broken and the
  field stays empty, which is the state it was built to fix. Its trap list is
  the second half: a bare "bonded" was reading as the tradesman's "licensed
  and bonded" and killing *"the glass is bonded into the body"*, the single
  most useful sentence the page can carry.

**The FAQ drafts the same way, and the hard part is the opposite one**
(`faq-draft.ts`, `POST /api/clients/[id]/draft-faq`, the card above the FAQ
list). Unlike the story sections, **THE FAQ IS NOT EMPTY WHEN THE FIELD IS
EMPTY**: `site-faq.ts` already answers up to four questions on every site —
the rate-increase fear, cash versus claim, repair versus replace, and
recalibration — from compliance-reviewed copy, the deductible one built per
state from `insurance-rules.ts`. `withDefaultFaq` puts a shop's own questions
first and fills in behind, dropping any default the shop has already asked.

So a drafted question that lands on one of those four does real damage, two
ways, both silent: **the same wording dedupes and throws away the REVIEWED
answer**, leaving an unreviewed one about insurance on a live site; **a
paraphrase** ("Will my insurance rates go up?") misses the dedupe, so the page
asks one question twice and answers it twice, once reviewed and once not.
`TAKEN_TOPICS` screens on the SUBJECT for that reason, judged on the question
and never the answer — an answer mentioning a camera in passing is fine.
The prompt reads the taken list out of `defaultFaq()` rather than restating
it, so a fifth default cannot appear on the site and be invisible here.

- **The claim screen is ONE module** (`copy-claims.ts`), read by both
  drafters. Two copies of a compliance list is the shape this codebase keeps
  refusing, and a rule added for one drafter has to protect the other.
- **A PHONE NUMBER IS NEVER DRAFTABLE** — same `PHONE_RE` as
  `rogue-numbers.ts`, deliberately, because a number this screen lets through
  is one the daily sweep files a finding about tomorrow morning. A model
  cannot know a shop's number, so one it writes is invented or somebody
  else's. Links and email addresses go the same way.
- **Nothing about the LAW.** "Is it illegal to drive with a crack?" is a
  question every customer asks and the answer is state law — not this
  platform's to state on fifteen shops' behalf in fifteen jurisdictions. The
  only law copy on these sites is the reviewed per-state deductible rule.
- **"immediately" and "right away" are NOT in the timing net**, and were. The
  most useful answer the FAQ can carry is that a car is *not* safe to drive
  immediately after a replacement and what decides when it is — a refusal to
  promise, thrown away by the rule against promising. The specific nets
  (a day, an hour, a count, an adjective) catch the real claim; those two
  words appear in protective copy at least as often as in a boast. The prompt
  says what to write instead of a cure time rather than only forbidding it.
- The card **does not hide once there are questions**, unlike the story one:
  eight drafted plus the template's four fills the field, and topping up a
  short list is the normal case. A second press sends the questions ON SCREEN
  (from a ref, not the database — one may be typed and unsaved) so it adds
  instead of re-asking.
- `scripts/check-faq-draft.ts` holds the four verbatim, nine paraphrases of
  them, and the traps — the first version of the screen threw away "it is not
  safe to drive immediately after a replacement", which is the best answer in
  the set.

**A content section's photo is a URL in a JSON column, NOT a row in the photo
table** (`SiteChapter.photoUrl`, rendered by `ChapterSections`). Those are two
different things that look like one thing to whoever is using the app: delete
every photo in the manager and the sections keep rendering exactly as before,
because nothing connected them. The importer fills that field with whatever it
found on the shop's existing site, so on NorthStar four sections were still
pulling images off the Wix site this platform replaced — and pulling
THUMBNAILS, 82 to 187 pixels wide, because those were the crops on the page it
read. They also vanish the day that site is switched off, which is the week
the new one goes live.

- The field is a PICKER over the client's uploaded photos
  (`ChapterPhotoPicker`), not the bare text box it was, with "None" as a real
  choice — that hands the section back to the gallery fallback, which is what
  an empty `photoUrl` has always meant. It still takes a pasted address, and
  warns on anything not hosted here.
- It re-fetches the photo list **when opened**, not once on mount: the reason
  somebody is in it is that they have just uploaded new photos, and a list
  captured before that upload cannot offer them.
- It READS photos and never writes them — the manager above owns that table
  (see the comment in `SiteContentEditor` about the autosave that reverted it).
- **Deleting a photo clears the section that used it.** Cleared, not
  repointed. Without this, removing a photo left the section rendering a file
  that no longer exists.
- Chapter photos are saved only if they are `https://` — a check in the
  site-content route, which is why a `data:` URI fixture silently becomes ''.

**Two logo slots, set on the Website tab** (`LogoCard`, `/api/clients/[id]/logo`).
`Client.logoUrl` is the header's, drawn on white and also used as the photo
watermark and the JSON-LD `logo`. `Client.footerLogoUrl` is only for the dark
footer band, and is empty for most shops — it exists because a logo that is
dark ink on transparency, which is most of them, is invisible down there. A
pasted address is COPIED to blob storage rather than referenced: these
addresses are usually on the old site this platform is replacing, and the
week it is switched off is the week the logo would vanish. When the copy
cannot be made the original is kept and the card says so.

**THE HEADER FOLLOWS THE LOGO** (`logo-surface.ts`, `logo-surface-measure.ts`,
`Client.logoSurface`/`logoSurfaceUrl`/`headerTheme`, bootstrap:
`SITE_BRANDING_SQL`, "Header background" on the logo card). The header was
white for every shop, and a logo is drawn for one background or the other.
EliteProGlass's is white lettering with a red "PRO" on transparency: on the
white header a visitor saw a lone "PRO" and no name, on every paid click, with
nothing anywhere going red.
- **Measured from the pixels at save**, never guessed from a filename. A
  transparent logo goes dark only when under half its ink shows on white AND
  80% shows on the dark band; anything that reads on BOTH (a mid-blue
  wordmark, white letters in a red badge, a white fill with a black outline)
  keeps the white header, so the fourteen shops that looked right yesterday
  look the same today. An opaque logo goes dark only when nearly all of its
  EDGE is dark — a file exported on a navy rectangle. Their real file reads
  14% on white, 100% on dark.
- **A reading counts only for the file it was taken from**
  (`logoSurfaceUrl === logoUrl`). Several paths write `logoUrl` — the card,
  the client PUT, the importer, mirroring, the re-tidy — and a verdict about
  the last file applied to a new one is how a dark-ink logo lands on a dark
  header. Stale means white until measured again: on every logo save, when the
  Website tab opens, in the daily sweep, and by **Maintenance → "Match every
  header to its logo"** (dry run first).
- **Everything in the bar changes with it**, including the scroll layer
  (`.site-hdr-dark::after`, or scrolling paints it white) and the quote
  button: `--hdr-cta` is the brand fill only when it clears 3:1 on the band,
  otherwise white — the same 1.44:1 lesson as `CtaButton onDark`.
- The portal header and the admin client header put such a logo on a dark
  TILE rather than turning their bars dark; those bars hold controls styled
  for white. `deriveFooterLogo` no longer whitens a logo already drawn for
  dark — it reads on the footer in its own colours, and whitening threw away
  the red.
- Operator override: Automatic / White / Dark. `scripts/check-logo-surface.ts`
  draws each shape as raw pixels and runs it through the real decoder, the
  stay-white cases first.

**THE SITE WEARS THE SHOP'S OWN COLOURS, READ OFF THEIR WEBSITE**
(`brand-colors.ts` decides, `brand-scan.ts` fetches and writes,
`Client.brandColorsSource`/`ReadAt`/`Note`, bootstrap: `SITE_BRANDING_SQL`,
"Colours from their website" on the Business tab's Branding card). Every shop
used to launch in the platform's default blue and amber, and those three
swatches sat untouched on the card for good.
- **SCORED BY USE, NEVER BY VARIABLE NAME.** EliteProGlass's page declares
  three variables literally named "primary" — The Post Grid's Bootstrap blue,
  LatePoint's booking-widget blue, Astra's stock palette — and the site is
  black with red (#d40000) buttons, menu and headings, a colour in no variable
  at all. A button background outweighs a menu colour, which outweighs a bare
  declaration. Plugin style blocks are skipped by id, plugin-injected elements
  by class (the Call Now Button's inline green outscored Speedy's blue), and
  framework, WordPress-core, social-network and theme-stock colours are
  refused by value (`NOT_THE_SHOP`, each one seen on a real page). Colours
  reached through `var()` count at a discount, because a theme routes every
  DEFAULT through its palette while the shop's choice is usually typed
  literally into a rule that overrides it; hover/focus states and blog
  furniture (tag clouds, calendars, comment links) barely count at all.
- **THE LOGO IS THE TIEBREAK** — the logo is the brand by definition, so a page
  colour it is drawn in is the shop's rather than a plugin's.
- **A DARK BASE IS ITS OWN SCHEME.** A black site with one strong colour is a
  black-and-that-colour brand: primary is the dark (the page's own surface
  colour where it declares one — AGK's charcoal #1b1d29, not a generic black),
  and the strong colour becomes the accent, which the theme then uses for the
  buttons. Signals: `theme-color`, a dark `body` background, or a logo drawn
  for dark (`logo-surface.ts`).
- **NEVER OVERWRITES A CHOICE.** Changing a swatch on the Business tab marks the
  colours `manual` (compared with what is stored — the form sends every field).
  The automatic read (morning sweep, and Maintenance → "Read every shop's
  colours off their own website") only touches colours that are still the
  platform defaults or came from the site. The card's button overrides
  anything, because the press IS the choice, and it SAVES — the form rebases
  those three fields (`useDirtyForm.rebase`) so they do not read as unsaved and
  nothing else typed on the tab is disturbed.
- Refused, with the reason stored and shown: a bot wall (`challengeReason`),
  a page with no colour of its own, and **our own hosted site** (`isOurOwnSite`
  — a `websiteUrl` still pointing at the shop's domain after cutover would read
  our template back). Only same-host stylesheets are fetched, through
  `validatePublicUrl`, capped.
- Measured against five real shop sites before shipping: EliteProGlass black +
  red, Speedy #3182ce, NorthStar #00aaff, AGS #fe0000, AGK yellow on
  charcoal. `scripts/check-brand-colors.ts` holds their real traps, the silent
  cases first.

**THE CALL TO ACTION STANDS OUT** (`sitePaletteVars` in `site-theme.ts`).
The button was the brand colour — the same as every eyebrow, icon and link on
the page — so the one thing to press was the one thing that did not stand out.
- **A shop's own accent takes the button** when it is genuinely a different
  colour: not the platform default (every client has that, nobody chose it),
  35°+ round the wheel from the brand, saturated. Only the CTA family changes
  (`--cta`, its text, its shadow, `--hdr-cta`); tints and text stay the brand.
  Default-accent shops render exactly as before.
- **Neutral is judged by CHROMA as well as saturation** — HSL saturation
  inflates near black, so AGK's charcoal read as a blue brand and got navy
  buttons.
- **A pale button gets an edge** (an inset ring in `--sh-cta`): yellow on the
  white hero is 1.1:1, the text reads and the button barely exists.
- **A BLACK BRAND'S TINTS ARE LIGHT, AND ITS ICONS ARE ITS ACCENT.** Every
  surface tint is the brand's own hue, so once EliteProGlass's colours were
  read as black + red, `--tint` came out a heavy #e4e4e4 — the warranty band
  a dull grey slab where a blue shop gets a fresh pale blue at the same
  strength — and the icon tiles 30% red (salmon) with black glyphs. A neutral
  brand now gets a light clean grey (4.5%), the accent tile is 16%, and the
  glyph on it is `--on-tint-accent`: the accent where it clears 3:1 on the
  tile, the brand otherwise (AGK's yellow cannot, so charcoal). Saturated
  brands render byte-for-byte as before; the check pins their values.
- **Warranty text is rendered through `warrantyBody()`** (`warranty-text.ts`),
  which removes markup and a first line repeating the title, and never
  changes a word. "Expand warranty" returned "# 1-Year Workmanship Warranty"
  as its first line and the card printed it, hash and all, under the H2
  saying the same thing. The expander is also told no headings, no markdown
  and no instructions to the customer — it had added "just bring the vehicle
  back to us", a process claim their words never made, on a mobile shop.
- **The call button is always the SECONDARY** — white, outlined in
  `--cta-on-light`. It was the same solid fill as the quote button beside it,
  so with a shop's own red on both, neither stood out. The header already drew
  that pair as filled + outlined.

**A logo has to look right at ANY shape, and two separate things decide that.**
Fifteen shops send wordmarks near 5:1, plain rectangles, square badges and
circles, into one header slot.

- **The file is TRIMMED to its ink at upload** (`trimToInk` in
  `photo-upload.ts`, shared by the upload and the mirroring path so an
  imported logo gets it too). Logos arrive with a wide margin of transparent
  or flat canvas baked in, and nothing downstream can tell that margin from
  the logo — the header sizes the FILE, so a file that is 35% ink renders its
  ink at 35% of the slot. MAG Mobile's was 480×320 with 155px of horizontal
  and 154px of vertical padding: a visible mark of about 53×27 in a 72px
  header, which is what "the logo doesn't look great" meant. It also shrank
  the photo watermark and the footer copy by the same proportion, since both
  are stamped from that file. Guarded by `MIN_TRIM_AREA_SHARE`: a flat or
  photographic logo with no border to find keeps its original, because a
  sliver stretched into the header is worse than the padding.
- **The slot is TWO CEILINGS, not a fixed height** —
  `max-h-[56px] max-w-[min(240px,100%)]` with auto sizing, so the shape picks
  which one binds. `h-[52px]` plus `max-w-[240px]` plus `object-contain` gave
  every logo a 240×52 box whatever it held, so a square badge drew 52px wide
  inside 240 and left 188px of empty box reading as a gap in the header. The
  `min(…,100%)` term is load-bearing: the brand is the one flex item that
  shrinks, and a bare `max-w-[240px]` let the picture keep its width while its
  box was squeezed, painting 49px over the first nav link at 1440.
- Existing logos predate the trim, so **Maintenance → "Trim the padding off
  every stored logo"** (`/api/admin/retidy-logos`, dry run first) re-stores
  them. Idempotent by measurement — a trimmed logo has no margin left to
  find — and a failure keeps the logo it has.
- `scripts/check-logo-shapes.ts` runs all five shapes plus MAG's real file
  through the real pipeline and asserts each ends up with a readable long edge
  inside the box. None of this fails loudly: the file is valid, the markup is
  valid, and the only symptom is one client in fifteen looking wrong months
  later.

**A cutover has THREE answers per old address, not two** (`UrlParityCard`,
`/api/clients/[id]/cutover`). Redirect it, build a page at it, or — when the
template already has that page under a different name — **move the page onto
the old address**. `Client.pathOverrides` holds `{ template path: old
address }` (bootstrap: `PATH_OVERRIDE_SQL`), and `site-paths.ts` is where
every link, canonical, sitemap entry and schema URL asks for it, so the two
can never drift. The template path 308s to the override: ONE address per
page, always, or the ranking splits between two of them, which is the thing
the whole module exists to prevent. Refused, in `pathOverrideProblem()`: an
address that is one of the template's own service slugs or an alias of one,
and anything shaped like a city page — **middleware rewrites both before any
of this app's routing sees them, and middleware cannot read the database**,
so such an override would be accepted and then silently ignored.

**City copy can be written for EVERY empty page in one press**
(`POST /api/clients/[id]/city-content/draft-all`, the button above the list in
`CityContentEditor`). The per-city draft deliberately does NOT save — a human
reads it first — and that is right for one city and does not survive twenty:
the measured outcome of twenty presses, twenty reads and twenty saves is city
pages left blank, carrying noindex, unlinked and out of the sitemap, which is
the exact state `city-content.ts` exists to prevent.

- **The bulk one SAVES, so the compliance screen stands in for the reader.**
  Every draft goes through `claimProblem()` — the same `copy-claims.ts` the
  story and FAQ drafters use — and one that trips it is NOT saved. This is the
  only place in the app where model prose reaches a live page without somebody
  reading it first, so the drop is the default and the response names every
  city and what happened to it, keeping the dropped text so the good half can
  be pasted by hand.
- **Non-destructive: only cities with NO copy at all.** A city somebody has
  written or corrected is skipped and counted. A bulk action that overwrites a
  hand-edited paragraph is one nobody presses twice.
- Sequential with a `TIME_BUDGET_MS`, because these are model calls and a
  client can have up to `LOCATION_PAGE_LIMIT` cities; it names who it did not
  reach and is safe to run again. `revalidatePath` once at the end.
- **THE CITY PAGES NARROWED THE SPEED RULE in `copy-claims.ts`.** They are
  written about a PLACE, and "fast-moving traffic on I-4" and "the surface
  deteriorates quickly" are facts about a road, not promises about a shop — a
  bare `/\bfast\b/` threw away the most specific sentence on the page. The
  adjective now has to be attached to the service ("fast service") or to us
  ("we … quickly") before it is a claim. The drafter checks hold both
  directions.

**Which cities get pages is edited here too** (`ServiceAreaPlanner`). The
first `LOCATION_PAGE_LIMIT` of `Client.serviceAreas` (after shop cities merge
in front) get a page; the rest are coverage-band text, and the card marks
which is which. "Suggest nearby cities" (`nearby-cities.ts`) asks the model
for towns near the shop and then **geocodes every name it returns** — the
candidate survives only if Google resolves it to a real locality, and the
distance that orders the list is measured rather than claimed. It writes
nothing: coverage is a business fact, and a town twenty minutes away across a
river they never cross looks exactly like one they serve daily.

**EVERY MODEL CALL NEEDS ROOM TO THINK** (`scripts/check-model-budgets.ts`).
The model these features call THINKS BY DEFAULT and pays for it out of
`max_tokens`. "Suggest nearby cities" asked for 800 — sized for fourteen names,
with nothing for deciding which towns they were — so every production press
stopped before the list and answered 400 ("No text in the response" / "Could
not read the list that came back") with nothing logged. The warranty expander
(600) and the city-page writer (1200, which the bulk button runs) carried the
same trap. A small budget looks fine in a diff and fails only on the day the
model thinks longer, so the check reads the SOURCE and fails any call to a
thinking model under 4000 — including one written tomorrow. The suggester also
logs the stop reason and size on every call, reads its reply with
`parseNameList` (the greedy `/\[[\s\S]*\]/` was the same fragile parser
`draft-json.ts` records), geocodes in parallel, and uses the shop's own country
(`twilioCountryFor`) — it was hardcoded to the US, so a BC shop's towns were
looked up in the wrong country, the tracking-number search's bug again.

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
- **Adding a user on the Users tab emails them too.** It used to create a
  working login and send nothing, which is a trap rather than a feature: the
  operator has made an account and has no reason to think anyone still needs
  telling. A shop sat locked out for days that way while a password was reset
  for them twice, and the only clue anywhere was the absence of a
  `portal-invite` request in the logs. Same invite as the Overview card, a
  magic link and never the password, on by default with an opt-out for
  pre-creating an account nobody is ready to hear about. The result line says
  whether the email actually went — "Added" about an account nobody was told
  about is the same silence in a friendlier font.
- **Approval emails the shop NOTHING.** The portal invite is a manual send —
  the Portal invite card on the client Overview (`portal-invite.ts`,
  `/api/clients/[id]/portal-invite`), pressed when the operator decides the
  setup is worth a first look. The card leans on the readiness count as its
  prompt but never blocks the send. It prefills the address the intake was
  SENT to — the one that has proven it reaches a human — creates the
  `ClientUser`, and mails the "portal is ready" note with a magic link.
  Re-sending mints a fresh link for the same account. An email already
  attached to another client's login is reported, not reassigned.
- **The portal session ROLLS: 30 days of not using it, 90 days no matter
  what.** It was a flat 30 days from sign-in, which expired on the same
  schedule whether a shop opened the portal daily or never — so the heaviest
  users were interrupted just as often as the ones who never log in, and every
  interruption is an email, a link and a confused shop owner. That friction is
  what pushes an operator towards inventing passwords and texting them over.
  The idle clock is `ClientUser.lastSeenAt` (bootstrap: `PORTAL_SESSION_SQL`),
  NOT a claim in the cookie: a cookie claim would need re-signing on every
  request, and a cookie the browser is merely trusted to drop is not a timeout,
  it is a suggestion. Touched at most hourly, never awaited into the failure
  path, and **not touched while impersonating** — an admin looking around must
  not keep a shop's credential alive. The absolute cap is what a rolling
  session gives up, so it is short enough to matter.
  `scripts/check-portal-session.ts` asserts both clocks, including that the cap
  exists at all: without one a rolling session never dies, which is the failure
  mode of every "just make it remember me" change.
- **The portal signs in by emailed link, and that is the front door.**
  Intake-created users have no password. `/portal/login` defaults to
  "email me a sign-in link" (password behind a toggle), `request-link`
  actually sends the email (it used to log it to the console and answer
  "sent"), and the response is identical for known and unknown addresses —
  the endpoint is public, and a distinguishable miss is a directory of who
  uses the platform. **The RESPONSE is neutral; the LOG is not** — an attacker
  reads the response, never our logs, so saying nothing server-side bought no
  security and cost the one fact that settles "they never got the email":
  whether there was an account to send it to. A shop owner typing the address
  THEY use rather than the one on the account gets a cheerful "check your
  inbox" and nothing arrives, which is indistinguishable from a delivery
  failure. It now logs sent / NO ACCOUNT / FAILED with the address. The verify PAGE posts JSON to the verify API; that API
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
- **The same sweep runs SITE checks for every live client**, ads-managed or
  not (`runSiteContentChecks`) — the sidebar item is "Needs action", not
  "Ads", for that reason. So far: `rogue-phone-number` (`rogue-numbers.ts`),
  which reads every piece of editorial copy — warranty, footer blurb, FAQ,
  story sections, city copy, published kept pages — for a phone number that
  is not the one the site shows. The template's own numbers are swapped at
  the data layer; free text is not, and an imported FAQ answer ending "just
  to call: (949) 775-1661" is a paid click arriving on a line nothing
  records. Nothing else would ever notice: the number is real, it belongs to
  the shop, and it renders exactly as written. The regex is deliberately
  strict — a bare run of ten digits is more often an order number — and
  `scripts/check-rogue-numbers.ts` holds the traps it must not fire on (year
  ranges, prices, ZIP+4, VINs, dates).
- **The same sweep also asks whether tracked calls are being RECORDED**
  (`call-recording-health.ts`, `runCallRecordingChecks`, check
  `calls-not-recorded`). Answered calls through this app's own TwiML, at least
  10 seconds, at least an hour old (a recording lands a minute or two after the
  call), on a client with an active number set to record: if none of them has
  a recording it is an ALERT, if most do not it is a REVIEW, and a stray one
  is neither. ALERT despite no money burning tonight — everything else this
  sweep files can be read tomorrow with the same result, and audio cannot: a
  call that was not recorded is gone. This is the check for the NEXT cause of
  what the `<Dial record>` typo did, because they all look identical from
  inside the app — a rotated credential, a Blob write failing, a signature
  rejection, a number reconfigured by hand in Twilio's console — and every one
  of them produces missing rows rather than errors. `judged` is what keeps a
  quiet week or recording deliberately switched off from auto-resolving a
  finding that is still true; `scripts/check-call-recording.ts` holds both
  directions, because being too eager here is what teaches people to scroll
  past the one morning it is real.
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
- **WEEKLY also audits ASSET COVERAGE** (`google-ads-assets.ts`): sitelinks,
  callouts, structured snippets, the call asset and images per campaign, plus
  ad groups with no live ad or a thin responsive one. Set once at launch and
  never looked at again — nothing in Google's interface goes red for a campaign
  with two sitelinks, it simply serves a smaller ad than the competitor beside
  it. Targets are in `ASSET_STANDARD` (6 sitelinks, 4 callouts, 2 snippets),
  with Google's SERVING minimums separate, so a finding can say "below what
  Google needs to show them at all" rather than just "fewer than we like".
- **THE LEVEL RULE IS THE WHOLE DIFFICULTY.** Assets attach at customer,
  campaign and ad-group level and the MOST SPECIFIC one wins OUTRIGHT — levels
  do not add. A campaign with two sitelinks of its own shows two even when the
  account has six. Adding the levels passes exactly the campaign that is worst
  off; counting only the campaign level files a finding against every account
  that sensibly sets them once at the top. Both are silent.
  `scripts/check-ads-assets.ts` holds that case first.
- Performance Max is **excluded** — its assets live in asset groups and are
  judged on a different standard, so "no sitelinks" against one would be a
  confident finding about the wrong thing.
- `BUSINESS_NAME` and `BUSINESS_LOGO` are **counted but not required**
  (`ASSET_STANDARD.reported`): the audit could not see them at all, and a
  target built on a field_type enum nobody has confirmed against a live
  account counts zero forever and files a finding nobody can clear. Promote
  them once an account confirms the spelling.
- **WEEKLY ALSO READS WHAT THE ASSETS SAY** (`google-ads-asset-claims.ts`,
  check `asset-claims`). The coverage audit counts assets and had never read
  one word of them, so an account passes with a full set advertising work the
  shop does not do, a warranty the site never defines, or a number nothing
  records. MAG Mobile exceeds every count and its copy could carry four of
  those at once.
- **THE LINE THAT KEEPS IT USABLE: every rule needs a fact on OUR side that
  contradicts the ad.** This is NOT `copy-claims.ts`, which governs copy the
  platform drafts for fifteen shops and bans a timing promise outright. An ad
  asset was written by an operator for ONE named shop, so "same-day
  appointments" may simply be true — and a check that fires on it files dozens
  of findings nobody can act on, which is how an account goes red forever and
  people stop reading. So: the service flag is off, the claim flag is off,
  there are no warranty terms anywhere, the state has no such law, that number
  is not theirs. Nobody can argue with any of those.
- **The deductible rule is read per STATE, not banned as a phrase.** "$0 with
  most FL insurance" is a statement of Florida law and it stands; the same
  words in a state with no automatic rule are the §2 offer that is illegal to
  advertise. `insuranceForState` decides. And **Florida's statute is
  windshield-only** — its own note in `insurance-rules.ts` says door and back
  glass go through the ordinary deductible — so the identical claim on a
  back-glass sitelink is wrong while the windshield one is right, and in MAG's
  list those two sit side by side reading the same. Nothing but that pairing
  could catch it.
- **A sitelink's descriptions belong to its LINK TEXT**, and the glass type is
  in the link text while the claim is in the description. Checking a line on
  its own finds nothing — caught by the fixture, which is MAG's real asset
  list verbatim, kept precisely because what this check stays SILENT about is
  its most valuable property.
- A phone number in an asset that is not one of the shop's is an **ALERT**:
  the bad case is not a wrong number but a RIGHT one this app does not track,
  taking calls the ads paid for on a line nothing records — `rogue-numbers` in
  the ad account. Known numbers are the real line, the display number, each
  location's, and every tracking number bought in-app.
- The **one timing claim that is checked** is a response-time promise against
  the MEASURED median (`response-time.ts`), needing 8+ measured leads and 3×
  the promise before it fires. That is the shop's own data contradicting their
  own ad, not an opinion about speed.
- One finding per PROBLEM, not per asset — twelve sitelinks with the same
  fault are one thing to fix — and the entity is the problem, so a persisting
  condition is one row whose `lastSeenAt` moves.
- `ASSET_CLAIM_CHECK` joins `judged` **only when the text fetch succeeded**; a
  check told it "ran" on a failed fetch auto-resolves everything it filed last
  week. The count findings still file when the copy query fails.
- **Anything that files its own findings stays OUT of `WEEKLY_CHECKS`.** That
  list is the set the playbook run is allowed to auto-resolve; a self-filing
  check listed there is told it "ran" while `result.drafts` holds none of its
  findings, which resolves every one of them seconds after they were filed.
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
  fixes things is one nobody can run to find out what is wrong. That
  all-clients route filtered `status: 'ACTIVE'` — **the THIRD module to make
  the ONBOARDING mistake**, after the WRHQ sync and rank tracking — so the one
  view that reads every account at once omitted exactly the shops whose setup
  is newest and least checked. It also dropped `accountSettings` from its
  `problems` list while still counting it against `clean`, so a client could
  print as having problems with nothing listed under them.
- **ONE ACCOUNT HAS TWO NAMES HERE, AND NOTHING MADE THEM AGREE.**
  `ClientAdsTracking.googleAdsCustomerId` is picked from a dropdown;
  `ClientAdsTracking.conversionId` is the `AW-…` that arrives inside a pasted
  snippet. A shop whose Ads account is replaced — a suspension, a billing
  mess, an agency handover — got the new customer id saved while both
  conversion snippets stayed pointed at the OLD account, so the site reported
  every form lead and website call to an account nobody reads. Nothing
  errored: the tag loaded, the page was fine, and this audit, the
  landing-page check, the offline upload and the monthly report's cost per
  conversion all interrogated the NEW account and found a tidy, correct,
  EMPTY setup. The only thing that ever noticed was the one-account rule in
  the save route, refusing the new lead snippet because the old call
  conversion sat beside it — which reads as the app rejecting a correct
  snippet rather than as it catching a half-finished move, and was reported
  as a bug.
  - **A MOVE CLEARS THE CONVERSIONS** (`isAccountMove` in `ads-snippet.ts`,
    read by the save route). They are not stale, they are WRONG — a tag
    crediting an abandoned account is worse than no tag, because it looks
    configured — so the operator gets the blank slate and pastes the new pair.
    **This does not weaken the rule that an empty snippet box means "leave it
    alone"**: that rule is about INCIDENTAL saves, since the card blanks both
    boxes after every save. This is an explicit change of account, the one
    event that proves the stored conversions belong somewhere else.
  - **NARROW ON PURPOSE — three neighbours look identical and must NOT
    clear**: the FIRST selection (nothing → an account; pasting snippets then
    picking the account is the normal setup order), UNSELECTING (an account →
    nothing; the id interrogates the account, it does not tag the site, so a
    client running their own Ads has valid snippets), and the same account
    re-saved, which every visit to the card does. It is a named function with
    a test rather than a condition inline for exactly that reason.
  - **`conversion_tracking_setting.conversion_tracking_id` IS the `AW-`
    number**, which makes the mismatch provable rather than inferred — checked
    live: customer 6109211627 answers `"715255323"`, and its site carries
    `AW-715255323`. It rides on the same `customer` row the call setting
    already reads, so it costs no extra call. It comes back as a **string**
    (the int64 rule) against an `AW-`-prefixed stored value, and comparing the
    two forms directly is always false — which would report every correctly
    tagged site in the book as wrong.
  - **CROSS-ACCOUNT CONVERSION TRACKING IS THE LEGITIMATE EXCEPTION.** An
    account whose conversions are managed by its manager reports to the
    MANAGER's id, arriving as `cross_account_conversion_tracking_id`; either
    id is accepted. Both keys are OMITTED when they do not apply — the same
    protobuf rule as `biddable` — and an account returning NEITHER is not
    judged at all, because an absence is not evidence.
  - `scripts/check-ads-account-move.ts` holds both halves, the silent cases
    first, and imports the real `isAccountMove` rather than restating it — a
    check that re-implements its own rule passes for ever while the route
    drifts underneath it.
- **"SECONDARY" IS TWO DIFFERENT SETTINGS, AND THE WORD IS ON BOTH SCREENS.**
  `customer_conversion_goal.biddable` is the GOAL's; `conversion_action
  .primary_for_goal` is the ACTION's, shown in the conversion actions table as
  "Primary action". Either one off takes the action out of bidding, and the
  two are fixed in different places. A finding that only says "Secondary"
  therefore points at a screen that may say the opposite word — which is
  exactly what happened: AGS's audit reported *"AGMP Call From Ads: its goal
  (PHONE_CALL_LEAD~CALL_FROM_ADS) is Secondary"*, every word of it true
  (verified live — both call goals non-biddable at customer level and on all
  six enabled campaigns), and the operator opened the actions table, read
  "Primary action" against that very action, and filed it as a bug. **The
  logic was right and the sentence was unreadable**, which costs the same
  thing: a queue nobody believes. So each finding names WHICH switch it means
  before the operator can find the one contradicting it, says the correctly-set
  switch is correct and to leave it, and names the screen the wrong one is on
  (`goalLabel()` for the goal in the UI's own words, never the bare enum).
  Both halves do it — `google-ads-conventions.ts` and
  `google-ads-campaign-goals.ts` — and the campaign one picks its sentence
  from which switch is actually off, because telling somebody their action
  "reads Primary and is correct" about one they set Secondary is the same
  false sentence pointing the other way.
- **`include_in_conversions_metric` is quoted as CORROBORATION, never as the
  verdict.** Across all thirteen live actions in AGS's account it equalled
  `goal biddable && primary_for_goal` exactly — Google's own derived answer to
  the question the audit computes — so the finding can add "this is excluded
  from your Conversions column", which the operator can check in two seconds
  on the screen they are already looking at. It was independently settable in
  older accounts, so the clause is emitted ONLY when it agrees; a disagreement
  is a curiosity, and the verdict stays with the two switches that decide
  bidding. `scripts/check-conversion-goals.ts` holds AGS's shape verbatim and
  asserts both — that the clause appears, and that it does not appear when the
  action really is still counted.
- **The setup STEPS are a leaf module** (`google-ads-conversion-setup.ts`,
  importing only the names) because `google-ads-conventions.ts` reaches the
  API and a client component cannot import it. That is why the "Booked jobs
  back to Google" card wrote its own shorter version for a while — "Create one
  in Google Ads (Goals → Conversions → New → Import → Manual import)" — which
  dropped the two things nobody can guess: what to NAME the action, checked by
  the audit lower down the same page, and that the value setting must be
  per-conversion or the real job value this app uploads is discarded. The card
  now renders `SALE_SETUP.steps`, and only for the missing-action case: over
  an API error the same steps would be advice about the wrong problem.
- **ENHANCED CONVERSIONS has three parts and only two are readable**
  (`ads-enhanced-conversions.ts`, checked by the "Check the live site" button
  on the Advertising tab). Our per-client toggle (default ON) adds
  `allow_enhanced_conversions` to the gtag config and makes the page call
  `gtag('set', 'user_data', {email, phone_number})` before the conversion
  event; the published page is fetched and both are looked for, because saved
  is not deployed. **THE IN-PAGE HAND-OFF IS THE WHOLE MECHANISM HERE, not an
  optimisation** — Google's dialog offers automatic detection, and on these
  sites it finds nothing, because the quote form renders inside a shadow root
  (`widget.js` calls `attachShadow`) and automatic detection reads the page
  DOM. **Google's own per-action setting cannot be checked at all**: probed
  against a live account, `conversion_action` has NO enhanced-conversions
  field (`enhanced_conversions_enabled` and
  `enhanced_conversions_for_leads_enabled` both answer UNRECOGNIZED_FIELD on
  that resource), and nothing exposes whether the customer-data terms were
  accepted. So the check says so in words and names the screen, rather than
  going all-green over something unknown. The one readable flag is the
  CUSTOMER-level `enhanced_conversions_for_leads_enabled`, which is the
  separate uploads-with-identifiers feature — our uploads carry a click id, so
  it is reported as a fact and never as a fault. `scripts/check-enhanced-
  conversions.ts` asserts which checks carry `info`, because a red cross on a
  deliberate setting is how operators learn to ignore red crosses.
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
  `customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled`
  behaves the same way: one live account returned it `true`, another omitted
  the key entirely while still returning `conversion_tracking_status`. Default
  a missing key to false, never to unknown.
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
- **The rule is "never THEIR host", not "only the configured host"** — reading
  it as the second broke the first. `rankMapUrlFrom()` is the one place that
  decides: a configured `LOCALDOMINATOR_SHARE_HOST` always wins, and with none
  configured a paste already on a non-vendor host is kept as it stands. Only a
  vendor host with nothing to replace it is refused. Before this, the route
  read `token && host ? url : ''`, so a correct paste of our OWN white-label
  address saved as **blank** whenever the setting was unset — and the card then
  said "no map token in that" about a paste that had one. Re-pasting could
  never fix it and nothing named the missing setting. A refusal is now a 400
  with the reason; an empty string only ever means a deliberate clear.
  `scripts/check-rank-map-url.ts` holds every form and both failure modes.
- Do not spend another afternoon looking for an automatic route without new
  evidence.
- The sweep only CREATES for clients with no `rankTrackingId`; it never
  touches an existing campaign. Changing an existing one goes through PATCH:
  `syncCampaignTier` on a tier flip, `/respace` for geometry, `/reschedule`
  for the cron.
- **THE WHOLE MODULE READ `status: 'ACTIVE'`, and ONBOARDING IS LIVE.** Nine
  queries — the creation sweep, the map capture, `rankSummaries()` behind the
  admin Rankings page, and every maintenance route — so a shop onboarded the
  normal way was never given a campaign, never listed on the Rankings page,
  and had its portal Rankings tab hidden, permanently. Intake approval creates
  every client as ONBOARDING, and those sites are live and taking leads on
  purpose (`LIVE_STATUSES`). **This is the SAME mistake the WRHQ sync records
  four sections up, in a second module** — when a rule says "live", use
  `siteIsLive`/`LIVE_STATUSES`, never an equality check. PAUSED stays excluded;
  that is the kill switch.
- **A CLIENT WITH NO CAMPAIGN HAD NO SURFACE ANYWHERE.** Rank tracking has no
  enable step, so "not set up" produces no error, no empty state and no row:
  the sweep counted `skipped++` with no name, the Rankings page omitted the
  client, the portal hid the tab, and the SEO switch said "no campaign yet"
  without saying whether that meant *tonight* or *never*. Those two are the
  entire difference to whoever is looking. So:
  - `rankSetupState()` is pure and answers "is it measured, and if not what is
    blocking it" — in words that name the screen to fix it. Blocker order is
    fix order: status, then the missing key (one fix for all fifteen), then the
    Business Profile. Coordinates are NOT a blocker (they backfill from the
    Place ID) and it says so, because a press failing on them is otherwise
    unexplainable.
  - **The `Rank tracking` card on the SEO tab** states which it is, and
    `createRankCampaignFor` / `POST /api/clients/[id]/rank-campaign` creates
    one on the spot — the same code the sweep runs, so a press cannot produce
    a differently-shaped campaign from tonight's run. Otherwise every fix to a
    blocked client is a next-day question. It costs credits, so it is only
    ever that press or the sweep, never a side effect of a save.
  - The sweep's client query **no longer filters on `googlePlaceId`**: it did,
    which meant the one client who could never be tracked was the one client
    the sweep never mentioned. Skips are now named with reasons in
    `skippedClients`.
  - `scripts/check-rank-coverage.ts` pins the ONBOARDING case first.
- **A SERVICE-AREA BUSINESS HAS NO POINT ON THE MAP, and the grid centre was
  only ever a lookup.** MAG Mobile has no storefront, so its Business Profile
  carries no address, so there is nothing for Google to hand back — and the
  centre of a mobile shop's grid is not a fact anyway: it is the middle of the
  area they actually cover, which only an operator knows. Two separate faults
  met here:
  - **The lookup asked the wrong API and swallowed its refusal.**
    `backfillCoordinates` was one line against the LEGACY
    `maps.googleapis.com/…/details/json?fields=geometry` endpoint, returning a
    bare `null` for everything. `gbp-reviews.ts` already records why that is
    wrong — **newer API projects are not authorized for it (REQUEST_DENIED)**,
    which is why reviews moved to the Places API (New) — and REQUEST_DENIED
    arrives as an HTTP **200** with the status in the body, which is exactly
    how it passed for an empty result. `place-location.ts` now asks the NEW
    API first (field mask `location`), keeps the legacy one as a fallback for
    an older project, and reports **Google's own words** with a `refused` flag.
    A refusal and an absence are different facts and only one is about the shop
    — the old message asserted the second whichever it was.
  - **The centre can be PASTED**, on the rank card, and for this class of
    client that is the right answer rather than a workaround. `coordsFromText`
    takes what somebody actually has in their hand: a Maps URL, a `q=`/share
    link, or a bare pair. **THE PIN BEATS THE CAMERA** — `!3d…!4d…` is where
    the place is, `@lat,lng,zoom` is where the map happened to be sitting when
    the URL was copied, and taking the second centres the grid on the wrong
    side of town in a way nothing downstream could ever question. `0,0` is
    refused outright: Null Island is what a missing value coerces to, and this
    app has already drawn one map in the Atlantic.
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

### Windshield Repair HQ listings

`wrhq-sync.ts`, called from client create, intake approval and client
update; `WrhqListingCard` on the client Overview and
`/api/clients/[id]/wrhq-sync` for one; `/api/admin/wrhq-sync` (Maintenance,
both halves) for the whole book at once.

Every client here should also be a **Partner** listing on
windshieldrepairhq.com — top of their city, Partner badge, no ads on their
page, outbound link and quote form. That tier already existed there; what was
missing was a way to set it without a redeploy of the other repo, so in
practice nobody ever did.

- **The directory matches before it creates**, and that logic lives on its
  side on purpose — it is the side that knows its own ~3,000 listings. An
  AGMP client is more likely than not ALREADY there as an unclaimed listing,
  and creating blindly would give one business two competing pages.
- **Bindings are keyed on `Client.id`, not a slug.** A shop that is renamed or
  moves no longer matches itself; the id survives that where identity matching
  would mint a second page.
- **The directory's answer is stored back** — `Client.wrhqSlug/wrhqUrl/
  wrhqSyncedAt/wrhqError` (bootstrap: `WRHQ_SQL`), written inside
  `syncClientToWrhq` rather than at each call site, because four paths push a
  client and a binding recorded by three of them is a card that lies on the
  fourth. Without it nothing here could say whether a shop was listed, which
  is why the feature originally had no UI at all. A dry run never writes.
- **A failure KEEPS the binding.** A directory that is down has not un-listed
  anybody, and clearing the slug would make the card read "not listed" about a
  page that is sitting there working.
- **`wrhqUrl` is only ever what the directory RETURNED**, never composed from
  the slug — that would mean guessing its route shape, and a confident dead
  link on an admin card sends whoever clicks it hunting a listing that is
  fine. With no URL the card prints the slug as text.
- **`status` drives the tier, by the SAME rule that decides whether the shop's
  website is public** (`siteIsLive`). This was `=== 'ACTIVE'`, which demoted
  every ONBOARDING client — and ONBOARDING sites are live on purpose, so a shop
  whose site was up and taking leads got a demoted listing, and intake approval
  created every new client that way. PAUSED is the kill switch and stays one;
  the listing and the binding are KEPT either way, so a returning client gets
  the same page and its earned ranking back. `ClientStatusCard` on the Business
  tab is where status is set — it had no control at all before, so every one of
  its consequences was reachable only by an API call.
- Only edits that change what the directory shows trigger a sync
  (`WRHQ_SYNC_FIELDS`). A colour or a timezone must not pay a cross-app round
  trip.
- **Intake approval syncs too, and that is the path that matters.** The sync
  hangs off the clients API; approval writes with prisma directly, so every
  shop onboarded the normal way silently never got a listing while the feature
  read as automatic. Approval is also the moment the address and services are
  finally trustworthy, which is what the directory needs to place one.
- **SOCIAL PROFILES TRAVEL TO THE LISTING, AND NOT FROM THE GBP**
  (`social-links.ts`, `Client.socialLinks`, bootstrap: `SOCIAL_LINKS_SQL`, the
  card on the client Business tab). A Business Profile can hold social links
  and shops do fill them in, but **nothing this app can reach returns them**:
  the Places API (New) — what `gbp-reviews.ts`, `place-location.ts` and the
  Business tab's search call — has exactly three URL fields in its whole
  response, `websiteUri`, `googleMapsUri` and `googleMapsLinks`. Checked
  against Google's field reference, not remembered. The only API that could is
  the Business Profile API, the OWNER's management API, which needs an OAuth
  grant per location from each shop: a separate integration and fifteen
  conversations. **The shop's own footer is the real source**, and the website
  importer is already standing in it, so extraction is deterministic and costs
  nothing on top of an import somebody is running anyway.
  - **PULLING THEM IS ITS OWN ACTION, NOT A SIDE EFFECT OF THE IMPORT**
    (`social-scan.ts`, `POST /api/clients/[id]/social-links` behind "Find them
    on their website" on the card, and **Maintenance → "Store the social
    profiles found on their websites"** for the whole book, dry run first).
    Extraction started inside `importSiteContent`, which was the right place
    to put it and the wrong place to leave it — the question "can an EXISTING
    client have theirs pulled?" has two bad answers there. The full import
    REWRITES site content (warranty, FAQ, hero bullets, story sections,
    photos, then autosaves), so re-running it on a curated client to collect
    two URLs trades the curation for the URLs — which is every client except a
    brand new one. And it refuses to start without `ANTHROPIC_API_KEY`, so the
    single most deterministic thing in the importer was the one thing that
    could not run without the model. The scan is one fetch of one page, no
    model, and it touches nothing: the route is READ-ONLY and the card writes
    through `PUT /api/clients/[id]`, the one path that screens and syncs.
  - The sweep **fills gaps only**, and that is its whole licence to save
    unattended: a platform already on file is left alone, so a link corrected
    on the Business tab survives every later run. Verified against the
    database — a hand-corrected Facebook page survived a re-run that filled in
    the missing Instagram. It pushes each changed client to the directory
    itself, because it writes with prisma directly and the clients API is what
    normally triggers that sync.
  - **A 200 IS NOT ALWAYS A PAGE.** Found by running this against real shop
    sites: one answered HTTP **202** with 169 bytes — `<meta
    http-equiv="refresh" content="0;/.well-known/sgcaptcha/…">`. `fetchHtml`
    accepts it correctly (2xx, `text/html`), so the scan found no links and
    said "no social profiles on that page", which is an absence reported as a
    fact about the shop — the same mistake `place-location.ts` records for
    Google's REQUEST_DENIED arriving as a 200. `challengeReason()` tells the
    two apart on a meta-refresh-to-a-challenge and on a body too small to be
    anybody's home page, and it is deliberately NOT inside `fetchHtml`, which
    the importer shares.
  - **THE HARD PART IS THE SHARE BUTTON.** A footer's most common Facebook
    link is not the shop's page, it is `facebook.com/sharer/sharer.php?u=…`,
    which matches `href*="facebook.com"` perfectly — publish that and the
    listing links to a share dialog for the shop's own home page. Same for
    `twitter.com/intent/tweet`, `pinterest.com/pin/create`,
    `linkedin.com/shareArticle` and Facebook's `/tr` tracking pixel. Screened
    by shape, along with platform home pages and single pieces of content (one
    post, one reel, one video — real, but not the account).
  - **JSON-LD `sameAs` is read FIRST**, then footer hrefs — the same
    precedence as the content feed's advertised `<link rel="alternate">` and
    the logo scorer's JSON-LD logo. A declaration beats anything inferred.
  - Re-screened on READ and again in the payload, not merely on write: a row
    stored before a rule existed must not reach a public page because it is
    already in the database. One bad entry never costs the good ones.
  - The importer **fills a gap and never overwrites**. The Business tab card
    is where a link that is real but somebody else's — the web designer's
    Facebook — gets corrected, and a re-import that replaced stored values
    would undo that correction silently, every time.
  - **THE DIRECTORY HAS TO READ THE `social` KEY OR NOTHING HAPPENS, AND
    NOTHING WILL SAY SO.** Its endpoint drops keys it does not recognise —
    the same trap the service keys record below. So today these are stored,
    screened and reviewable here, and invisible on windshieldrepairhq.com
    until that side reads `social` as `{ platform: url }` over the seven
    platforms a Business Profile itself supports.
  - NOT rendered on the hosted site. `scripts/check-social-links.ts` holds
    every share widget, every real profile shape (Facebook's `/pages/Name/123`
    and `profile.php?id=`, YouTube's four channel spellings) and both
    directions of the read.
- **NO LIST OF INSURERS is sent.** It used to send
  `Client.insuranceRelationships`, a column rendered by nothing, written by no
  form, defined by no comment and empty on every client — its only reader was
  that line. So the first time anyone filled it in, an unreviewed claim about
  which insurers a shop has a "relationship" with would have appeared on a
  public directory page: §2's "no approved by / preferred provider" rule broken
  by a field nobody knew was wired to anything. `filesInsuranceClaims` goes
  instead — the flag the Business tab actually sets, which already gates this
  claim across the hosted sites, and which is a fact about the SHOP'S PROCESS
  rather than a claim of endorsement BY an insurer.
- **A PARTNER USED TO WEAR THE BADGE OVER A SCRAPE.** The sync wrote the shop
  record only when it CREATED the listing, so a client MATCHED to one of the
  directory's ~3,000 existing listings — three of the first nine — kept the
  description somebody else wrote about them, no rating and no logo,
  permanently. Those listings are in a JSON file a running site cannot edit, so
  there was no write to make; the data rides on the binding and is overlaid at
  read time on the far side, the way `claimed` already is. What now goes:
  `footerBlurb` as the description (declared on the payload type since the
  module was written and never once set — a dead field), `Client.logoUrl` in
  place of the 128px favicon the directory scrapes, `latitude`/`longitude`
  **both or neither**, and the `ClientGbpReviews` rating and count. Those
  numbers are the whole reason a Partner's listing can show a star: the
  directory has no Places key and is not getting one, and this app already
  fetches the same Business Profile feed for the site it hosts. It is
  fill-and-replace and never clears over there, so a sync running while the
  Business Profile lookup is failing leaves the rating the listing already
  shows. `logoUrl`/`latitude`/`longitude` are in `WRHQ_SYNC_FIELDS` because
  they are RENDERED there now — a logo swapped in one app and not the other is
  the drift nobody notices until a client points at their own listing.
- **THE DIRECTORY TALKS BACK: shop signals** (`directory-signals.ts`,
  `directory-signal-types.ts`, `POST /api/webhooks/wrhq/events`,
  `DirectorySignal`, bootstrap: `DIRECTORY_SIGNAL_SQL`, **Shop signals** in the
  sidebar). The listing sync runs one way; this is the other. WRHQ fires an
  event the moment a shop claims a listing, submits one, publishes, buys
  Featured, drops in city rank or clicks through for an audit, and it had been
  firing them at nothing — the config existed on that side, the receiver never
  existed on this one. Needs `WRHQ_EVENT_SECRET` here and the same value as
  `AGMP_WEBHOOK_SECRET` there, with `AGMP_WEBHOOK_URL` pointed at the route.
  - **A signal is NOT a Lead.** A Lead is a consumer with a cracked windscreen
    and belongs to one client; this is a business that might become one, and
    belongs to nobody — hence no `clientId` and no foreign key. The directory's
    promise that a consumer quote goes to the one shop it was sent to and is
    never resold holds on this side too: the payload carries business data
    only.
  - **HOT vs WARM decides whether the email means anything.** Hot is a human
    spending something — money, or the effort of a claim form with their phone
    number on it. A rank slipping one place at 3am is not a reason to look at
    your phone.
  - **The signature is checked over the RAW body**, and an unset secret
    refuses rather than waving everything through. A missing secret answers
    **503**, not 401: one says "wrong secret", the other says "no secret
    here yet", and they are fixed in different places.
  - **A REPLAY MUST ANSWER 200.** There is no event id and the directory
    retries on a non-2xx, so `dedupeKey` is type + shop + `occurredAt`, and a
    `P2002` is reported as a duplicate rather than an error. Answering non-2xx
    to a duplicate is how a webhook retries for ever over something already
    stored. The EMAIL failing is not the endpoint failing, for the same
    reason — and `notifiedAt` is stamped so a retry cannot mail a row twice.
  - The labels live in a LEAF module because the list is a client component
    and the library reaches Prisma — the same split as
    `google-ads-conversion-setup.ts`, and the alternative is two copies of the
    labels that describe one event differently in the email and on the screen.
- **The service keys are the DIRECTORY's, not ours** — `chip-repair`,
  `side-window`, `rear-window`. Its endpoint silently drops keys it does not
  recognise, so a wrong name here is not an error anywhere, it just quietly
  loses the service.
- Failure is reported, never fatal: the client row is already written, and a
  directory that is down must not read to the operator as "the save failed".
  `POST /api/admin/wrhq-sync` re-syncs everything; `{ dryRun: true }` — or
  `?dryRun=1`, because the Maintenance runner sends no body — reports what
  would happen and writes nothing. A dry run that wants to CREATE most clients
  means the matching is not seeing what it should. The backfill stops on its
  own time budget and names who it did not reach: sequential pushes with an
  8-second timeout each can otherwise be KILLED mid-run, which leaves no
  response and no way to tell how far it got.
- **The backfill runs its own dry pass first and REFUSES itself** with a 409
  when more than half the clients would get a brand-new listing. That reading
  means matching stopped working — a changed payload field, a directory
  deploy, a bad state code — not that the shops are new, and going ahead would
  give them a second page competing with their first, which is work to undo on
  the far side and splits the ranking meanwhile. The check lives in the route
  rather than in a screen so it covers the Maintenance runner, a curl and
  anything added later. `force: true` (or `?force`) overrides it and is
  deliberately in no UI.
- Needs `WRHQ_SYNC_URL` and `WRHQ_SYNC_SECRET` (the latter shared with the
  directory's `AGMP_SYNC_SECRET`). Absent, it is a silent no-op.

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

### Reporting (the monthly report, and the email)

`monthly-digest.ts` (one month in depth), `monthly-report.ts` (the twelve-month
trend), `monthly-report-run.ts` (the build), `monthly-report-email.ts` (the
send), `ClientMonthlyReport` (bootstrap: `MONTHLY_REPORT_SQL`), the cron at
`/api/cron/monthly-reports`, **Monthly reports** in the admin sidebar, and
**Reports** in the portal at `/portal/results`.

**ONE PAGE, TWO QUESTIONS.** The trend answers "is this working"; the month
answers "what happened in February". They sit on the same page because a shop
owner asking one is thirty seconds from asking the other. The URL stayed
`/portal/results` so the Booked tile still lands there, and it is the
**Summary** sub-tab that the Reports tab opens on — see the portal nav note in
§6 for how seven tabs became three.

**THE CRON BUILDS; A PERSON SENDS.** `/api/cron/monthly-reports` runs on the
1st and stores a digest per client. Nothing is emailed until somebody presses
Send on the admin page. An email to fifteen real business owners cannot be
unsent, and the figures most likely to be wrong are the ones nobody has looked
at: a cost per conversion flattered by an account still counting calls twice, a
spend of nothing because the API was down, a booked count of zero because the
shop never ticked the box. Each is obvious to a human in two seconds and
invisible to the code that built it.

- **13:00 UTC, NOT MIDNIGHT, and the hour is load-bearing.** At 00:00 UTC on
  the 1st it is still last month in every US timezone, so "last month"
  resolves to the month BEFORE last for every client — February's report would
  cover January, every month, with nothing about the output looking wrong.
  `scripts/check-tz-windows.ts` asserts the trap, not just the fix.
- **SNAPSHOTTED, NOT RECOMPUTED.** Ad spend is fetched live everywhere else in
  this app, which is right for a screen and wrong for a report: the email sent
  on 1 March and the portal page opened in June have to agree forever, and
  cannot if one re-asks an API whose numbers move. Same reason `ClarityDay`
  stores its raw payload. A report already SENT is never rebuilt — the shop
  has that email, so the stored copy is a record of what they were told.
- **COST PER CONVERSION IS GOOGLE'S NUMBER, not spend ÷ our leads.** Their
  `cost_micros ÷ conversions`, so it reconciles against the shop's own Ads
  account. Dividing spend by our enquiry count — which includes organic and
  direct — gives a figure that matches nothing, always flatters, and teaches
  the shop that one of the two numbers is invented. The page and the email
  both SAY whose figure it is, because the two counts sit inches apart and
  differ. Worth knowing when one looks too good: an account still carrying
  HighLevel's `AGMP Call` beside this app's `AGMP Website Call` counts one
  call twice, which inflates conversions; nothing here can detect it.
- **THE CHANNEL SPLIT IS A PARTITION, NEVER AN ADDITION.** A tracked call
  writes a Lead (`source: 'PHONE'`) and so does a text (`SMS`), so
  form + phone + sms + other IS the total. Adding `CallAnalysis` rows on top —
  which the twelve-month trend shows in its own separate column — would double
  every phone enquiry, and the first place that shows is cost per conversion
  reading half what it is.
- **RECOMMENDED NEXT STEPS ARE NOT WRITTEN BY A MODEL.** They are the open
  `AdsFinding` rows the daily and weekly sweeps already filed — structured
  claims with their evidence attached and their own cooldowns — under an
  operator's own note typed on the admin page. Monthly advice invented for a
  named business and mailed to its owner is §2's fabricated fact with a stamp
  on it. DISMISSED findings are excluded: that means "known, stop telling me".
- **WORK COMPLETED comes from the Activity feed**, filtered to the month —
  derived from things that happened, so it cannot claim work nobody did. Its
  OWN lead and call tallies are dropped: they are not work we did, and they
  DISAGREED. The feed buckets by UTC and the report by the shop's zone, so a
  lead at 23:30 on 31 July in Los Angeles made the first real build say "6
  enquiries" at the top and "7 enquiries delivered" in the list below it.
- **THE TREND NOW BUCKETS IN THE SHOP'S TIMEZONE TOO**, which it never did —
  it read `getMonth()`, i.e. UTC in production. Wrong on its own and visibly
  wrong once the month digest sat on the same page: 6 in one block, 7 in the
  row beneath it. Both use `lib/tz` now and agree by construction.
- **Recipients are the PORTAL LOGINS** (`ClientUser`), not
  `ClientNotification.emailTo`. Same no-fallback rule as the lead alerts, a
  different list on purpose: the alert list is whoever needs waking when a
  lead lands, which on several clients is a technician. A month's spend and
  revenue is for whoever owns the business, and the portal invite went to the
  address that has proven it reaches one. No portal user sends NOTHING and the
  row says so — the report is on the portal either way, so the email is the
  nudge rather than the artifact.
- **Every section strips itself when empty, and a FAILURE does not.** A
  self-serve client has no ads account, so their report is enquiries and work
  done — that is the right report, not a broken one. But an ads block missing
  because the API was down says so, because "we spent nothing on your ads"
  is a different claim from "we could not read your account".
- A zero booked count carries its own caveat in both the email and the page:
  it almost always means nobody ticked the box, and read without that sentence
  it is an argument against the service, made by us, in our own report.
- `scripts/check-monthly-digest.ts` holds the arithmetic against real-shaped
  API rows (`costMicros` as a string, in micros, camelCase) because nothing
  local can reach Google Ads, plus every branch of the email — quiet month,
  no ads account, ads failure, unmarked booked, and an operator note with a
  `<script>` tag in it.

**The twelve-month trend** (`monthly-report.ts` + `components/MonthlyReport.tsx`)
renders under the month block, and on the admin's Results tab.

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
- **The build runs on webpack (`next build --webpack`), and it has to.** Next
  16 defaults to Turbopack, and a Turbopack build **ignores
  `outputFileTracingIncludes`** — silently, and in the shape most likely to
  fool you: the trace still carries sharp's JS and `package.json`, just not
  `libvips-cpp.so`, so the function deploys and dies at module load with
  `ERR_DLOPEN_FAILED`. That took out every image path in production at once —
  wordmarks, photo uploads, the white footer logo, the importer's mirroring —
  while the config entries meant to prevent exactly that sat in the file doing
  nothing. To re-check after any Next upgrade: build both ways and read
  `.next/server/app/**/route.js.nft.json` for
  `@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*`. Present on webpack,
  absent on Turbopack.
- **Anything image-shaped must be optional at the call site.** A `sharp`
  failure has to degrade, never fail the write it decorates. The white footer
  logo is derived inside a `try` at every call site *including the dynamic
  `import()` itself* — the lib's own catch cannot catch a module that fails to
  load — because that unguarded import 500'd `PUT /api/clients/[id]`, which
  discarded whole website imports.
- **Fonts are bundled, never fetched at build.** `layout.tsx` loads Inter and
  Inter Tight through `next/font/local` from `src/assets/fonts/`, because
  `next/font/google` downloads from `fonts.gstatic.com` while the build runs.
  That download failed once on Vercel and took production down — the same
  commit having built green on the branch two seconds earlier, which is what a
  network dependency inside a build looks like when it breaks. Do not put it
  back. Refreshing the files means re-reading Google's `css2` output; they rev
  the URL when the font revs.
- `insurance-rules.ts` — per-state glass deductible rules, `PUBLIC_INSURERS`
  / `insurerNoun()` for the provinces with one public insurer, and
  `heroCostLineFor()` for the above-the-fold cost line. All of it already
  compliance-reviewed; reuse it rather than writing new insurance copy, and
  never hardcode "your carrier" — ask `insurerNoun()`.
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

- **Both apps work on a phone, and the admin only recently did.**
  `AdminShell` holds the layout: the `w-64` sidebar is a fixed column at `lg`
  and up, and a drawer below it. Before that the layout was `flex h-screen`
  with no breakpoint anywhere, so on a 390px phone the sidebar took 256px and
  left 134px of content — not a degraded layout, no layout. The nights this
  platform needs attention are exactly the nights nobody is at a desk.
  - **`min-w-0` on the content column is load-bearing.** A flex child defaults
    to `min-width: auto`, so one wide table stretches the column past the
    viewport and takes the whole page sideways.
  - Wide content scrolls **inside its own `overflow-x-auto` box**; the page
    body never scrolls horizontally. Verified by measuring
    `scrollWidth - clientWidth` at 320/360/390/430, not by eye.
  - The portal was built this way from the start: a bottom tab bar below `sm`
    with `pb-[env(safe-area-inset-bottom)]`, grid columns computed from the
    RENDERED tab count (hardcoding it wrapped the last tab onto a second row
    twice), and `pb-24 sm:pb-10` so content clears the bar.
  - **The portal nav is THREE TABS: Home · Leads · Reports** (`lib/portal-nav.ts`
    is the menu as DATA, `PortalNav.tsx` draws it). It grew to seven one tab
    at a time, each "measured at 360px" — and a real render of a shop with the
    full set at 390px read "ome" at the left edge and "Rankin" at the right,
    because every measurement had been taken on a shop without every
    conditional tab. Four-plus-More followed and still hid pages behind a
    menu. The structure a UX review settled on is how an owner talks: "who
    called", "who do I ring back", "how's it going". So:
    - **Reports holds Summary, Calls, Traffic, Rankings and Work done as
      visible SUB-TABS** (`ReportsSubNav`), on every screen size, in the same
      place — a scrolling underline row with an edge fade, never a dropdown.
      Calls and Rankings appear only when the shop has something behind them
      (`lib/portal-sections.ts`, ONE decision read by the sub-tabs, the
      Summary page's "More reports" cards and the home tiles — the Calls
      tile once linked to a page the menu said did not exist). The Summary
      page also links every section, so nothing depends on noticing the row.
    - **"Work done", not "Activity"**: in a leads app "activity" reads as lead
      activity.
    - **The account menu** (top right, every page): View my website, lead
      alerts on this device (labelled — the old bell was an unlabelled
      toggle), Sign out. Sign-out used to exist only on the Leads pages, which
      drew a SECOND header of their own inside the portal's.
    - **"Ring these back" lives on Leads** (`getCallsToRingBack` in
      `call-patterns.ts`, `RingBackCard`), NOT on the Calls page, where it sat
      as an action among charts. ONE rule, read by the card, the home banner
      and the Calls page's pointer: a missed call in the last seven days whose
      CANONICAL lead is still untouched (a duplicate's own status stays NEW
      for ever), unless a LATER call from the same number was answered, one
      row per person, withheld numbers never merged. Not filtered by the date
      picker — yesterday's missed call is the one most worth making. "Done"
      moves the canonical lead to Contacted.
    - **The Leads page is inside the shell now, so it is full-bleed by
      negative margin and `overflow-x-clip`, never `overflow-x-hidden`** —
      hidden makes the wrapper a scroll container, and its sticky date bar
      then offset itself inside it and sat on top of the first card.
    - The "Powered by" line is in the shell's flow on every page. It was a
      FIXED bar on the Leads page alone, which on a phone sat on the tab bar.
    - `scripts/check-portal-menu.ts` holds the menu (every report path lights
      Reports, a prefix is not a match, no sub-tab to a missing page) and the
      ring-back rule, the silent cases first. **Measure with the WORST-CASE
      shop** — every conditional section present — at 320/360/390 and
      640/1024/1440.
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
- **Kill a stale server BY PID, and confirm the port is free before trusting
  a render.** The process is named `next-server (v16.1.1)`, so
  `pgrep -x next-server` matches NOTHING and the old server keeps the port; a
  new `next start` then dies with EADDRINUSE into its log while the old one
  goes on answering — serving HTML that points at chunk hashes the new build
  replaced, so the page loads, a chunk 500s, and the feature under test
  silently does not render. That produced a false "it's broken" once and a
  false "no difference" once. What works:
  `ps -eo pid,args | awk '/next-server \(v16/ && !/awk/ {print $1}' | xargs -r kill`,
  then check the new log says "Ready". A bare `pkill -f next` also matches
  your own shell and kills the command running it; `lsof` cannot see the
  listener in this container.
- The importer and any model-backed feature need `ANTHROPIC_API_KEY`, which is
  usually absent locally. Those paths cannot be tested here; say so rather
  than claiming they were verified.

---

## 8. Git

Work on `claude/handoff-doc-review-js930f`, then merge to `main`. Push with
`git push -u origin <branch>`. Do not open a pull request unless asked.
