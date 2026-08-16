# Open items

Everything built that needs something from you before it does anything, plus
the decisions still outstanding. Kept in the repo so it survives a chat
window.

Last reviewed: 2026-08-15

---

## 0. New since the landing-page overhaul — five minutes each

### 0.0 Set the rank report share domain
**Blocks:** nothing, but until it is set every client sees Local Dominator's
domain inside their own portal instead of yours.

Settings → API keys → **Rank report share domain**:

```
ranking.autoglassmarketingpros.com
```

Host only — no `https://`, no path. Every rank map (portal, admin, share link)
is then framed from your domain. It is also the only one of their URL forms
that advertises `frame-ancestors *`, so it is the most reliable to embed as
well as the best branded.

### 0.0c Optional: the single all-keywords map
**Blocks:** nothing. Per-keyword maps are automatic and already showing for
every client; this only swaps four of them to one combined map.

Local Dominator does not issue a campaign share link for a campaign created
through their API — it appears once the campaign has been opened in their
dashboard. Proven: of six campaigns with completed runs, the only two with a
`campaign_link` are the two you had opened by hand.

Per client: open the campaign in Local Dominator, then **Local Rankings →
Refresh map URLs**. That is now the only route — the paste-a-URL field on the
client's Rankings tab is gone, because it cost a permanent card of explanation
on a page whose whole job is to show a map.

**Every client is on per-keyword tabs**, including the two that previously had
a combined map: deleting and recreating the campaigns cleared their stored
URLs and their new campaigns are API-created. Skip this entirely if the tabs
are fine — nothing else depends on it.

### 0.0b A content feed per shop
**Blocks:** the article entries on the client's Activity tab.

**Mostly automatic.** The nightly sweep finds and adopts a feed by itself for
any shop whose own website advertises one, so for most shops there is nothing
to do — check the SEO tab in a day and it will be filled in.

For the rest: **Clients → the shop → SEO tab**. Tick *This shop is on the SEO
plan*, then in **Content feed** press *Find it for me* — it also tries the
usual addresses, which the unattended sweep deliberately will not. If it finds
nothing, paste the address by hand. Press *Save*; it checks the feed and pulls
the posts straight away, then runs itself nightly at 06:00 UTC.

No key, nothing to rotate, and it keeps working if the writing tool changes.
If a feed stops answering, the error shows on that card.

### 0.1 Tick the two new claim flags per shop
**Blocks:** two true things your shops are no longer allowed to say.

The template used to assert both of these for everyone. They are now per-shop
and **default off**, so right now every site says the conservative version.
Client → **Business** tab → *What we're allowed to say*:

- **They file insurance claims for the customer.** Off, the site says they
  will check coverage and give the carrier what it needs. On, it says they
  deal with the carrier directly.
- **Their published number can receive texts.** Adds a "Text photo" button to
  the mobile bar and a text-us line on the form's success screen. Leave off
  for a landline — a text into a dead line loses the lead silently.

### 0.2 Re-run each shop's website import
**Blocks:** nothing, but it is how the logo, photo and stock-photo fixes take
effect on existing clients.

The importer now judges photos by sight, prefers a shop's own work over
generic imagery, keeps stock the shop published rather than dropping it, and
clears a previously saved logo that turns out to be another brand's badge.
None of that applies retroactively — it runs on the next import.

> The gallery/body classification is the one part of this that has never run
> against a live site: there is no Anthropic API key in the dev environment,
> so it could not be tested locally. Check the first one and tell me if
> photos land in the wrong pool — the per-photo Gallery/Body dropdown in the
> photo editor overrides it, and the prompt is easy to tune.

### 0.3 DMARC record for the sending domain
**Blocks:** Apple Mail showing "cannot verify this message is from
leads@leads.glassleads.app" on lead alerts.

Add a TXT record on the `glassleads.app` zone, host `_dmarc`:

```
v=DMARC1; p=quarantine; rua=mailto:you@yourdomain
```

`p=none` instead of `p=quarantine` if you would rather monitor before
enforcing.

---

## 1. Do these — features are built and idle until you do

### 1.1 Google Ads: create the import conversion action
**Blocks:** booked-job values reaching Google Ads. Built, deployed, doing nothing.

For each client you manage in your MCC:
1. Google Ads → **Goals → Conversions → New conversion action → Import → Manual import** (not a website tag — a tag action will not accept uploads, and the error does not say so).
2. Name it something you will recognise, e.g. `Booked job (glassleads)`.
3. In glassleads: client → **Advertising** tab → *Booked jobs back to Google* → pick it in the dropdown.
4. Press **Check without sending** and read the result. That is a validate-only call to Google; nothing is recorded.
5. Only then **Upload for real**.

> Start with one client. The first attempt against a live account is the one most likely to surface a setup problem.

### 1.2 Twilio: move one tracking number and make a test call
**Blocks:** call tracking, call recordings, and call coaching without HighLevel.

1. Open `/api/admin/twilio/numbers`. It lists every number in the connected Twilio account and where each one currently sends its calls.
   - Numbers listed → they are in your account and can be repointed.
   - Numbers missing → they live in HighLevel's own Twilio subaccount and must be moved out first.
2. Pick **one** number. Client → **Lead delivery** → *Call tracking* → add it with the shop's real line as the forward-to.
3. Call it. Check: it rings the shop, caller ID passes through, the recording appears on the lead, and the coaching score follows a couple of minutes later.
4. Let it run for a day before moving the rest.

> A phone number sends its calls to exactly one place. Adding it here takes it out of HighLevel for voice. This is a cutover per number, not a parallel run.

### 1.3 Twilio: A2P 10DLC registration
**Blocks:** SMS lead alerts arriving reliably. Unregistered 10DLC traffic gets filtered by carriers, often silently — which looks exactly like the app not sending.

- Register a brand and campaign in *your* Twilio account. A campaign HighLevel registered under their brand does not transfer.
- Attach the campaign to a **Messaging Service**, then set `TWILIO_MESSAGING_SERVICE_SID` in Vercel. The code already prefers the service over a bare number.
- Does **not** apply to call tracking (voice), or to the tap-to-text button (that is person-to-person from the owner's own handset).

### 1.4 Vercel: set `BLOB_STORE_HOST`
**Blocks:** nothing. Narrows an accepted risk.

Damage-photo URLs on a lead are validated against `*.blob.vercel-storage.com`, which every Blob store shares. Setting this to your store's exact hostname pins it to yours, so nobody with their own Blob store can get an image of their choosing rendered in a shop owner's inbox.

### 1.5 Check `/admin/api-status`
One page, live probes. Confirms Resend (including a **verified sending domain**), Twilio, Deepgram, Anthropic, Google Places, Blob, Vercel domains and Cloudflare are all actually working, rather than configured-looking.

---

## 2. Decisions you owe — no code waiting, just a call

### 2.1 collisionglass.co — let it back in, or leave it out?
Currently **blocked**. You said embedded-form leads should reach the app; that page is effectively that case.

To let it back in: client → **Lead delivery** → *Outside websites allowed to send leads*, add both:

```
https://collisionglass.co
https://www.collisionglass.co
```

Add the two `collisionautoglass.com` variants too if that site carries the form.

**Related, and worth settling at the same time:** that page posts to HighLevel *and* to us. If you ever re-enable the outbound HighLevel destination while it does, you get a loop — we forward to HighLevel, HighLevel posts back to us, another row. Dedup keeps it to one alert, but rows pile up. Cleaner: stop the page posting to HighLevel directly and let the app be the only route in. That is also the route that keeps the Google click ID.

### 2.2 Does HighLevel still forward Collision's leads into the app?
Unverified. The page's own source says HighLevel's workflow strips the gclid on the way through. If that path is live, leads still arrive but read as untracked. If it is not, that client is currently dark in the app. Check the client's Leads list after the next enquiry from that site.

### 2.3 Whether to tell clients about the earlier admin exposure
Before it was fixed, `/admin/**` pages served client data without authentication — business names, contact emails and phones were retrievable by anyone with the URL. Fixed and verified in production. Whether to notify the affected clients is your call, not mine, and it is still open.

### 2.4 Customer-facing messaging
You have ruled this out for now and I have not built any. Worth revisiting: an immediate "we've got your request, we'll call you in a few minutes" is the single largest conversion lever in lead handling, and it is the part the customer actually notices. It would be a per-client toggle, not a platform-wide change.

---

## 3. Watch — verify once real data exists

| What | Why | When |
|---|---|---|
| Are shops tapping **We booked it**? | The Google Ads upload is worthless without outcome data. If nobody taps it, the fix is not more code. | 2–3 weeks after alerts go out |
| First Twilio coaching transcript | Recordings are dual-channel; the pipeline was written for HighLevel's mono files. If speakers are attributed oddly, that is why, and it is a one-line change. | First real tracked call |
| First real damage-photo upload | The success path was tested with the upload intercepted — Blob has no token in a dev environment. | First submission on a live site |
| The 405 on a client's outbound webhook | Was failing before the destination was disabled. Moot while off; re-check if you re-enable it. | If re-enabled |

---

## 4. Known limitations, accepted on purpose

- **No rate limiting on the lead webhook.** Anyone who knows a client slug can post a lead. The origin rule stops *pages*, not scripts.
- **Cloudflare DNS records are left behind** when a client is deleted. The record resolves to nothing; tidy it in Cloudflare if it bothers you.
- **`{slug}.glassleads.app` has no DNS.** Only the short subdomain is provisioned. Harmless, but a comment in `site-origin.ts` calls the slug host a fallback that "always works", and it does not.
- **No conversion adjustments.** If a shop corrects a sale amount *after* it has been uploaded to Google, the correction is not re-sent — that needs a separate adjustment call. Say the word and I will build it.
- **n8n MCP server is unauthorised**, and cannot be authorised from a phone. AdKit dropped.

---

## 5. Not built, ranked by what I would do next

### 5.0 Clarity on the landing pages, and a standing conversion-rate loop
**BUILT. Waiting on fifteen project ids from you.**

Per shop: create a Clarity project, then **Clients → the shop → Advertising →
Behaviour analytics** and paste the project id. The tag goes live on their
pages within the hour, and their privacy page grows a "How this site is
measured" section the moment it is saved. The export token is optional and only
needed to read numbers back inside the app.

The constraints below were settled before the code and still hold — most
importantly that the API returns aggregates, not recordings, so anything
needing a replay watched is a thing YOU watch and tell me about.

Microsoft Clarity on every hosted landing page, read continuously, with the
scoreboard being conversion rate in Google Ads — **search campaigns, not
PMax**, because PMax mixes placements and audiences that the landing page did
not cause and cannot be held responsible for.

Three things decide whether this works, and they are worth settling before any
code:

- **Clarity's API returns aggregates, not recordings.** The Data Export API
  gives metrics broken down by dimension — dead clicks, rage clicks, scroll
  depth, quickbacks, traffic by page and device — capped at a small number of
  calls a day per project, over the last few days only. Session replays and
  heatmaps are dashboard-only, human-eye things. So the standing loop reads
  aggregates and forms hypotheses; anything that needs a replay watched is a
  thing YOU watch and tell me about. A loop designed as "the model watches the
  recordings" would be a loop that quietly invents its findings.
- **Attribution has to survive the join.** Clarity measures the page; Google
  Ads measures the money. The join is already half-built — `gclid` rides with
  every lead and booked jobs upload back as offline conversions — so the
  honest metric is per-shop, per-campaign, over a window long enough for a
  low-volume shop to accumulate signal. With 15 shops at auto-glass volumes,
  most page changes will not clear noise in a week. Expect to run changes for
  a month, and expect some to stay unproven.
- **Session replay on a real business's site is a privacy surface.** Clarity
  records interactions and masks text by default; the quote form carries
  names, phone numbers and damage photos. Masking must stay on, the form's
  fields must be excluded explicitly rather than by trusting the default, and
  each shop's privacy page has to say that a session-analytics tool is in use.
  That is a §2 content change on 15 live sites, not a footnote.

**The package.** `@microsoft/clarity` (1.0.2, MIT, no dependencies) is a thin
client-side loader — `Clarity.init(projectId)` — plus five calls worth knowing
before designing anything:

- `setTag(key, value)` — arbitrary tags on a session. This is the join. Tag
  every session with the shop slug, the page type (home / service / location)
  and whether the visit arrived with a click id, and the aggregates stop being
  one undifferentiated pile.
- `event(name)` — a custom Smart event, filterable in their dashboard. Quote
  form submitted, call button tapped, text-photo tapped. These are the
  numerator of any conversion rate measured on their side.
- `upgrade(reason)` — prioritises a session for recording. Given how thin
  auto-glass volumes are, upgrading sessions that arrived on a paid click is
  the difference between replays worth watching and replays of bots.
- `consentV2({ ad_Storage, analytics_Storage })` — only needed if the project
  is set to require cookie consent. Which of those two we can honestly grant
  is a question for the privacy page, not for the code.
- `identify(customId, …)` — hashed client-side, and **not to be used**. There
  is no version of tying a session replay to a named customer that is worth
  the exposure on somebody else's business's site.

Note what the package does NOT do: it is the collector only. Reading the
results back still needs the Data Export API and a token per project, which is
the aggregates-not-recordings constraint above.

**Decided: one Clarity project per shop.** Fifteen tokens and fifteen
dashboards, against one merged dataset that would average away exactly the
differences worth acting on — the shops have different traffic, different
geography and different pages. The token belongs on the Client row, encrypted,
next to the other per-shop keys.

1. ~~**Response-time tracking.**~~ **BUILT.** On each client's Overview tab:
   the typical (median) time to first touch over 90 days, how many were
   answered inside 15 minutes, how many were left over a day, and how many
   were never touched at all. When the average runs far above the median the
   card says so — that gap means the shop is fine most of the time and drops
   some entirely, which is a different conversation from "you are slow".
   Leads answered before the tracking column existed are excluded and counted
   as excluded, so the figure never looks more complete than it is.
2. **Real sales page at glassleads.app.** Every client site's footer now links "Powered by GlassLeads" to the apex, which serves a holding brand page (features, no pricing, no contact). The real page needs decisions only you can make: published pricing yes/no, the CTA (a demo-booking link? a phone number? an email that actually receives mail — the Resend domain only sends), and proof (screenshots, a client quote).
3. **Two-step quote form with partial capture.** The form dropped from six
   required fields to four, which was most of the available gain. The rest —
   submitting name/phone/ZIP on step one so an abandoned form still sends a
   lead — was deliberately NOT shipped, because it changes what a "lead"
   means for every downstream consumer: HighLevel forwarding, the Google Ads
   offline upload keyed on lead id, same-day dedup, and alert timing. A lead
   that never completes step two becomes a permanent half-record flowing into
   your ad conversions. Worth doing, worth designing first.
4. ~~**Monthly client-facing report.**~~ **BUILT**, as **Results** — in the
   client's portal (linked from the Booked tile on their home screen) and on
   their admin Results tab, same component so the two cannot disagree. Leads →
   calls → booked → rate → revenue, by month.
   **It is not emailed to anyone.** Building the numbers and mailing them to
   fifteen real business owners are separate decisions and the second is
   yours — say the word and I will wire a monthly send.
5. **Follow-up on unbooked leads.** A lead marked "didn't book" is currently dead. Most shops never chase them.
