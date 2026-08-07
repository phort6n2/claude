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
fifth — push conversions back to Google Ads. Both are gone or switched off. See
§7.

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

## 6. Who can see what

**Client portal** (`/portal/leads`) — magic-link email or a per-client password.
Scoped to one client.

**Master leads** (`/master-leads`) — everything, all clients. Gated on
`MASTER_LEADS_EMAIL`.

**Admin** (`/admin/*`) — NextAuth session.

Both lead views stream new leads over SSE and can send web push. Push currently
delivers nothing: see §8.

---

## 7. Switched off, but still in the repo

**Content generation.** Blog posts, social, podcasts, video, GBP posts, press
releases — roughly 37 files plus a large slice of the schema. Gated behind
`CONTENT_ENABLED` (default off); middleware returns 410 for its APIs and
redirects its pages. Dead weight, not a hazard.

**Google Ads.** Removed entirely. The `Lead` table still carries
`enhancedConversionSent`, `offlineConversionSent` and `googleSyncError`, which
nothing reads. Google handles conversions natively now.

**`/admin/settings/wrhq`.** Configured publishing to the old WordPress
windshieldrepairhq.com, which no longer exists.

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

**CORS origins are hardcoded.** `ALLOWED_BROWSER_ORIGINS` in the webhook route.
Every new client site needs a code change and a deploy to let that client's own
domain post. Should live on the `Client` record.

**Eleven one-off migration routes are still shipped.** `add-quote-value-column`,
`migrate-timezone`, `backfill-lead-dedup` and friends under `/api/admin/`. They
were throwaway scripts. They mutate schema and data and are still reachable.

**No migrations.** There is no `prisma/migrations` directory and the build runs
only `prisma generate`. Schema changes are applied by hand with `db push`.
**Order matters absolutely**: Prisma selects all scalar columns, so shipping code
that declares a column before the column exists takes down every query touching
that table. Database first, deploy second. Prefer explicit SQL over `db push`,
which diffs the whole schema and may propose dropping things.

**`prisma/seed.ts` has drifted.** It references `collision-auto-glass`, which
doesn't exist in production. Running it against a real database would create a
duplicate, wrong client.

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

`CONTENT_ENABLED` is unset (off) and should stay that way.

Cron: `/api/cron/recover-stuck-call-analyses` every 15 minutes. That is the only
one left.

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

**Move CORS origins onto the `Client` record.** Same shape of change; kills the
code-change-per-client-site problem.

### Bigger, worth deciding on deliberately

**SMS and email lead notifications.** Currently web push only, which is
fragile — a reinstall silently ends delivery. Twilio and Resend are days of
work, not weeks, and would remove most of the day-to-day dependence on
HighLevel.

**Rate limiting on the webhook.** Needed before many more public landing pages
post directly.

**Delete the content system.** Roughly 37 files and a large slice of schema for
something switched off. Removing it makes everything else easier to reason
about. Nothing depends on it.

**Remove the one-off migration routes.** Eleven throwaway scripts that can
mutate production.

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
