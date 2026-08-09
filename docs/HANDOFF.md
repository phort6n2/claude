# glassleads.app — handoff

The lead platform for Auto Glass Marketing Pros. Captures leads for ~15 auto
glass shops, shows each client their own leads, and grades the phone calls.

Repo `phort6n2/claude` · Vercel project `agmp-paa-pro` · domain `glassleads.app`

---

## 1. What it does

Three things, in order of how much they matter:

**Captures leads.** HighLevel and client landing pages POST to a webhook. The
app stores the lead with whatever attribution came with it, deduplicates
same-day repeat contacts, and pushes it live to any open browser.

**Shows clients their leads.** Each client gets a portal at `/portal/leads`
scoped to their own data. You see everything at `/master-leads`.

**Grades calls.** Every call recording is transcribed (Deepgram) and analysed
(Claude) into a score, an outcome, missed opportunities and a coaching note.
Each client gets a rolling "three things to work on" derived from patterns
across their own calls.

It used to do a fourth thing — generate and publish marketing content — and a
fifth — push conversions back to Google Ads. Both have been physically removed
from the codebase. See §7.

---

## 2. Shape of the system

```
HighLevel ─┐
           ├──► /api/webhooks/highlevel/lead ──► Lead ──┬──► SSE ──► portal / master-leads
landing ───┘                                            │
pages                                                   └──► CallAnalysis ──► Deepgram ──► Claude
```

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Prisma 6 against
Postgres. Deployed on Vercel; pushes to `main` deploy to production
automatically, branches get previews.

Builds take about a minute. They used to take six or seven, because the
WindshieldRepairHQ directory shared this codebase and prerendered 4,300 pages on
every commit. It now lives in `phort6n2/wrhq`.

---

## 3. The lead pipeline

**`src/app/api/webhooks/highlevel/lead/route.ts`** is the single most important
file in the repo. Everything else is downstream of it.

`POST /api/webhooks/highlevel/lead?client=<slug>`

The `client` slug selects the client. A wrong slug returns 404 and the lead is
lost with no signal to the sender, so slugs must be exact —
`collision-auto-glass-and-calibration`, not `collision-auto-glass`.

**There is no authentication.** A `key` parameter is accepted and ignored. This
is deliberate and documented in the route: the check had been soft-warn-only for
so long that the endpoint was already open, and landing pages post from the
browser where a secret can't be kept. See §8 for what this costs.

### Reading the payload

HighLevel puts the same value in different places depending on the account and
the workflow, so lookups try the payload root, then `customFields` /
`customData`, then a normalised match. Normalisation lowercases and strips
non-alphanumerics, so `GBRAID`, `gbraid`, `UTM Campaign` and `utm_campaign` all
resolve. Several clients' HighLevel accounts name fields in ways that would
otherwise be silently ignored.

Unresolved merge templates (`{{contact.foo}}`) and empty strings are treated as
absent, not as values.

### Deduplication

`src/lib/lead-dedup.ts`. Two contacts from the same person on the same calendar
day (client timezone) collapse: the second gets `duplicateOfLeadId` pointing at
the first. Matching is on last-10-digits of phone, or lowercased email.

This matters because a form submission and a follow-up call are one lead, and
because Collision's sites post to both HighLevel and the app — two deliveries,
one lead.

---

## 4. Attribution — paid vs organic

`src/lib/lead-channel.ts`. Decides the badge on each lead. Read the file before
changing it; the rules encode findings that aren't obvious.

Order of evidence:

1. **Paid click id** (`gclid`, `gbraid`, `wbraid`, `msclkid`, `ttclid`) — the
   strongest signal there is.
2. **`utm_medium`** in a paid set (`cpc`, `ppc`, `paid_social`, …).
3. **`fbclid`** → social, *not* paid. Facebook stamps it on organic links too.
4. **Referrer host** → organic / social / referral.
5. **A form with a `landingPageUrl` and no ad parameters** → organic.
6. Otherwise **unknown**, shown as "Untracked".

Two rules worth understanding:

**Phone calls are always paid.** `PHONE_LEADS_COME_FROM_ADS = true`. The
HighLevel number is a tracking number that only appears in ad paths; organic
callers dial the shop's published number and never reach the app. This is a fact
about the phone setup, not something in the payload — flip the constant if a
client ever publishes their HighLevel number somewhere organic.

**Organic requires a landing page URL.** Without one, an untagged form is
"unknown", not "organic". This was a bug: every Collision form read as organic
because their HighLevel workflow strips `gclid` before forwarding, and the app
turned missing data into a confident wrong answer.

A paid click on *any* same-day duplicate wins for the whole group — someone who
clicked an ad and later submitted an untagged form is a paid lead.

---

## 5. Call coaching

**`src/lib/call-analysis/`**

`queue.ts` → fire-and-forget POST to an internal worker (Vercel can't continue
work after a response), one retry after 750ms.
`pipeline.ts` → Deepgram transcription → audio metrics → Claude analysis → save.
`rating.ts` → outcome-driven face: booked = 🙂 always; quote sent or callback
scheduled = 😐; otherwise 🙁 unless the score is 70+.
`focus-areas.ts` → per-client top three, from a 14-code taxonomy, counted once
per call, needing at least three analysed calls.

The rating is deliberately gentle. Booking the job is what matters, and a bare
number read harsher than it should.

A cron sweeps stuck rows every 15 minutes. The final save is retried hard —
by then transcription and a Claude call have both been paid for, and losing the
write throws away the whole call.

---

## 5a. Lead forwarding (webhook fan-out)

**`src/lib/webhook-forwarding.ts`**, configured per client in the admin client
editor under **Lead Forwarding**.

The app is the single ingestion point for forms; each client can have any
number of outbound webhook destinations (typically their HighLevel inbound
webhook). After a lead is stored, the original payload is forwarded verbatim,
server-side, to every enabled destination. Ordering matters: the lead is saved
first, delivery rows are created second, actual POSTs run after the response is
sent — so forwarding can never fail lead capture.

Deliveries are persisted (`WebhookDelivery`) with status and attempt count.
`/api/cron/retry-webhook-deliveries` retries failed or unattempted deliveries
every 15 minutes, up to 6 attempts within 24 hours — an outage delays a
forward, it doesn't lose it. Each destination has a **Test** button in the
admin that sends a clearly-marked test contact synchronously.

The same section manages the client's **allowed browser origins** (CORS) for
forms that post directly from the page — see §8.

Migration path for a form currently posting to two hardcoded URLs: add the
HighLevel URL as a destination, verify with Test, watch relayed deliveries for
a few days (double delivery during transition is fine — HighLevel dedups
contacts and this app dedups leads), then remove the HighLevel URL from the
form so it posts only here.

---

## 5b. Quote widget and hosted landing pages

**`src/app/widget.js/route.ts`** — the embeddable quote widget. One script tag
on any site renders a branded quote form (inline in a
`[data-glassleads-widget]` container, floating button otherwise). It persists
click IDs and UTMs in localStorage for 90 days, so a lead submitted pages or
days after the ad click still carries full attribution. Submissions speak the
webhook's existing flat-JSON dialect; a hidden honeypot field (`_hp`) makes
the webhook silently drop bot submissions. The embed snippet is shown per
client in the admin's Lead Forwarding section; the site's origin must be in
the client's allowed origins.

**GBP reviews on hosted sites.** `src/lib/gbp-reviews.ts` fetches rating /
review count / top quotes from the Places Details API using the client's
`googlePlaceId`, caches them in `ClientGbpReviews`, and refreshes daily via
`/api/cron/refresh-gbp-reviews` (plus a Refresh button on the client editor).
Two rules ported from the landing-template repo: data is cached only when the
Place ID resolves to a name that plausibly matches the client (a wrong Place
ID returns perfectly plausible numbers for someone else's shop), and pages
render rating bands / `aggregateRating` only from live cached data — stripped
entirely when absent, never fabricated.

**Per-service pages.** `/sites/{slug}/services/{service}` (and
`{slug}.glassleads.app/services/{service}`), generated from
`src/lib/site-services.ts` — copy there is generic to the trade and never
asserts facts about a specific business. Pages render only for services the
client's flags enable. Setting a client to PAUSED replaces their whole site
with a neutral "temporarily unavailable" page (the non-payment kill switch)
within the 5-minute ISR window.

**One shell, every page.** `src/components/sites/site-body.tsx` renders
everything below the hero (services grid, steps, stat band, insurance,
gallery, reviews, map, areas, warranty, FAQ, final CTA, footer). Home,
service, and location pages all use it — each page IS the homepage with a
different hero and lead-in chapters, the reference build's per-page model.

**Location pages.** `/locations/{city-slug}` for the first 5 entries in the
client's serviceAreas (`src/lib/site-locations.ts`, LOCATION_PAGE_LIMIT).
City copy is flag-derived and factual (mobile unit covers the city / shop
serves it from {home city}); the areas band and footer link to them. Adding
a city to serviceAreas in the admin creates its page within the ISR window.

**Editorial site content.** `ClientSiteContent` + `ClientSitePhoto`, edited in
the client editor's Hosted Website section: hero bullets, warranty (always
rendered with its full terms beside the claim), FAQ (with FAQPage JSON-LD),
gallery and body photos (https URLs; real photos of the business only),
footer blurb, and the regulator registration line. Every section strips
entirely when its content is empty. The compliance rules come from the
landing-template repo's config header — read them before writing client copy;
in particular: no deductible offers, no invented prices or facts about the
business, no third-party "approved/authorized" claims.

**Editorial chapters.** `ClientSiteContent.chapters` (Json — run
`docs/db-add-site-chapters.sql`; reads are a separate guarded query so deploy
order doesn't matter, and a save against a DB without the column saves
everything else and warns). Rendered between the hero and the services grid
as alternating prose + photo sections, like the reference's long-form middle.
Content is per-business — admin-written or drafted by the importer from the
client's own site copy — never invented. The hero headline itself is derived
from the client's flags and city (ADAS → "Auto glass and ADAS calibration
across the {city} area", etc.), and a four-item trust strip under the hero
renders only claims the flags can back.

**Import from their current website.** The Site Content editor's Import box
(`src/lib/site-import.ts` + `POST /api/clients/{id}/import-site`) fetches the
URL you give it plus up to 4 same-origin pages that look like
warranty/FAQ/about pages (SSRF-guarded like webhook destinations: https-only,
private hosts blocked, re-checked after redirects), collects candidate photo
URLs from `<img>` tags, and has Claude (`claude-opus-5`, same
`ANTHROPIC_API_KEY` as call coaching) extract ONLY what the site actually
says — warranty verbatim, real FAQs, footer blurb, bullet candidates; the
prompt forbids inventing and drops deductible-offer copy. Photos the model
returns are filtered against the crawled candidate list so it can't add its
own URLs. The result only pre-fills the editor as a draft — nothing is live
until an admin reviews and saves.

**Site design system.** Hosted pages follow the landing-template look:
`src/lib/site-theme.ts` derives the entire palette (tinted surfaces, lines,
dark bands, CTA gradient) from the client's primary color at the mix ratios
sampled from the reference build, emitted as CSS variables on the page root;
`src/components/sites/shared.tsx` holds the template-style components (util
bar, sticky header with live rating, eyebrow labels, gold stroked stars,
Google rating chip, dark warranty band and footer). The widget card mirrors
the template's quote card (white, 4px brand top border).

**`src/app/sites/[slug]/page.tsx` — hosted landing pages.** Every ACTIVE
client has a full landing page at `/sites/{slug}`, rendered entirely from the
Client record (name, phone, colors, services, service areas, Places link) with
the widget embedded same-origin (no CORS involvement at all). `src/middleware.ts`
rewrites `{slug}.glassleads.app` → `/sites/{slug}`, so each client can have
their page on a subdomain — one-time setup: add the wildcard domain
`*.glassleads.app` to the Vercel project. Pages carry per-client SEO metadata
and AutoRepair JSON-LD, and render with ISR (5-minute revalidate, nothing
prerendered at build — the WRHQ 4,300-page build-time lesson applies).
Template improvements ship to every client site on the next deploy.

---

## 6. Who can see what

**Client portal** (`/portal/leads`) — magic-link email or a per-client password.
Scoped to one client.

**Master leads** (`/master-leads`) — everything, all clients. Gated on
`MASTER_LEADS_EMAIL`.

**Admin** (`/admin/*`) — NextAuth session.

Both lead views stream new leads over SSE and can send web push. Push currently
delivers nothing: see §8.

---

## 7. Removed systems

All of the following have been physically deleted from the codebase. The code
is gone; the corresponding database tables/columns are dropped separately with
`docs/db-cleanup-2026-08.sql`, which must run *after* the code deploy — see §8
on ordering.

**Content generation.** Blog posts, social, podcasts, video, GBP posts, press
releases, PAA library, WordPress/Podbean/Creatify/GetLate/DataForSEO
integrations, the `CONTENT_ENABLED` gate, and the middleware that enforced it.
The content models (ContentItem, BlogPost, SocialPost, GBPPost, StandardPAA,
ServiceLocation, and friends) are out of the Prisma schema.

**Google Ads.** The `GoogleAdsConfig` / `ClientGoogleAds` models and the
`Lead` sync columns (`enhancedConversionSent`, `offlineConversionSent`,
`googleSyncError` and their timestamps) are gone. Google handles conversions
natively now.

**`/admin/settings/wrhq`.** Deleted along with the rest of the WRHQ publishing
configuration.

**The eleven one-off migration routes** (`add-quote-value-column`,
`migrate-timezone`, `backfill-lead-dedup`, `generate-vapid-keys`, etc.) under
`/api/admin/`. They could mutate production schema and data and are no longer
reachable.

The old content portal at `/portal/[slug]` is also gone; clients use
`/portal/leads`.

---

## 8. Known issues

Roughly in order of what they cost you.

**Push notifications deliver nothing.** Every lead logs `Sent 0 notifications`.
The dead-subscription bug is fixed — subscriptions that return 410 are now
retired instead of retried forever — but that retired the only one registered.
**Re-enable notifications on your phone.** Nothing arrives until you do.

**HV Auto Glass gets no call grading.** Their calls arrive with
`Recording URL: not found` while Collision, Maximum, ElitePro and Speedy all
deliver one. Something in HV's "AGMP Calls" HighLevel workflow doesn't pass
`customData.recordingUrl`. Compare it against Collision's.

**The lead webhook is unauthenticated.** Anyone who knows a client slug can post
a lead into that client's account. Tolerable while the URL is only known to
HighLevel; it stops being tolerable as more landing pages post directly, since
the URL is then visible in page source. The fix is rate limiting plus the origin
allowlist — not a shared secret, which a browser can't hold.

**CORS origins now live on the `Client` record** (`allowedOrigins`, managed in
the admin client editor under Lead Forwarding). The hardcoded list in the
webhook route remains as a fallback floor — unioned with the database list — so
a DB outage can't lock out a site that's already posting. Adding a new client
site is an admin edit, not a deploy.

**No migrations.** There is no `prisma/migrations` directory and the build runs
only `prisma generate`. Schema changes are applied by hand with `db push`.
**Order matters absolutely**: Prisma selects all scalar columns, so shipping code
that declares a column before the column exists takes down every query touching
that table. For *additions*: database first, deploy second. For *removals* (like
the §7 cleanup): deploy first, drop the tables/columns second. Prefer explicit
SQL over `db push`, which diffs the whole schema and may propose dropping
things.

**DDL needs the DIRECT url, not the pooled one.** The app runs on
`PRISMA_DATABASE_URL` (see §9), whose role has no rights on `schema public` —
raw DDL through it fails with `42501 permission denied for schema public`. The
direct URL's role (`prisma_migration`) owns the schema. When applying SQL from
inside the app rather than a CLI, open a short-lived `PrismaClient` on
`DIRECT_URL` for the DDL, disconnect immediately (that role's connection cap is
small), then verify by reading the new table through the pooled client — "the
migration role created it" and "the app can see it" are different claims.
`src/app/api/admin/setup-client-locations/route.ts`, in the history at
`67c3b93`, is the worked example; that pattern is worth copying the next time a
table has to be created against production.

---

## 9. Environment

`DATABASE_URL` is owned by the Prisma Postgres integration and is read-only in
the Vercel dashboard. Connection-pool settings are therefore applied in code —
`src/lib/db.ts` appends `connection_limit=10` and `pool_timeout=20` at client
construction. An explicit value in the environment still wins.

`pool_timeout` matters: P2024 ("timed out fetching a connection from the pool")
was silently discarding completed call analyses. `withRetry` now catches it.

Live and required:

| Variable | For |
|---|---|
| `DATABASE_URL` | Postgres (integration-managed) |
| `ANTHROPIC_API_KEY` | Call coaching |
| `DEEPGRAM_API_KEY` | Transcription |
| `CRON_SECRET` | Cron + internal worker auth |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Admin auth |
| `MASTER_LEADS_EMAIL` | Master leads access |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `ADMIN_EMAIL` | Web push |
| `ENCRYPTION_KEY` | Encrypted client fields |
| `APP_URL` | Internal worker callback |

Crons: `/api/cron/recover-stuck-call-analyses` and
`/api/cron/retry-webhook-deliveries`, both every 15 minutes.

---

## 10. Related repos

| Repo | Vercel | Domain |
|---|---|---|
| `phort6n2/claude` | `agmp-paa-pro` | glassleads.app |
| `phort6n2/wrhq` | `wrhq` | windshieldrepairhq.com |
| `phort6n2/hv` | `hv-auto-glass-quote` | quote.hvautoglassdenver.com |
| `phort6n2/Collision` | `collision-auto-glass` | collisionglass.co |

All four were one repo until recently. A commit here now deploys only this app.

---

## 11. Where to go next

### Do first — cheap, and they fix live problems

**Re-enable push on your phone.** Costs nothing, and no lead alerts arrive
without it.

**Fix HV's recording URL.** One HighLevel workflow. Restores call coaching for a
client currently getting none of it.

**Verify the Google Ads tracking template.** `{adname}`, `{campaignname}` and
`{adgroupname}` are not real ValueTrack parameters — Google passed them through
literally, so campaign reporting was unusable across every client. The corrected
template also sets `utm_medium=cpc`, which lets the app classify a lead as paid
even when HighLevel strips the `gclid`. Confirm with the Test button rather than
waiting on leads.

### Then — small, contained, unblocks the next thing

**Map tracking number → client.** Add `trackingPhoneNumber` to `Client` and
resolve the client from the number that was dialled when no slug is given. The
webhook already captures `called_number`. Turns onboarding from "clone a
HighLevel workflow and hope you changed every reference" into "paste a number
into the admin page", and is a prerequisite for consolidating to one HighLevel
sub-account.

Ship it in shadow mode: explicit slug always wins, log whether the number lookup
*would* have agreed, watch for a few days, then cut one client over.

~~**Move CORS origins onto the `Client` record.**~~ Done — see §5a and the
Lead Forwarding section of the client editor.

### Bigger, worth deciding on deliberately

**SMS and email lead notifications.** Currently web push only, which is
fragile — a reinstall silently ends delivery. Twilio and Resend are days of
work, not weeks, and would remove most of the day-to-day dependence on
HighLevel.

**Rate limiting on the webhook.** Needed before many more public landing pages
post directly.

### Considered and rejected

**Replacing HighLevel entirely.** The software half — forms, notifications,
portal — is genuinely achievable. The telephony half is not the same kind of
work: number provisioning, call routing, recording, plus A2P 10DLC registration
and two-party call-recording consent (California is two-party; Colorado and
Oregon are not). And the failure mode changes character. If this app is down,
clients lose visibility for an hour. If you own the phone system and it goes
down, a client's phone stops ringing and you are the only person who can fix it.

The app's value isn't being a cheaper HighLevel — it's the coaching and
attribution layer HighLevel can't do. Telephony is a commodity you'd be
insourcing at a loss.
