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
Refresh map URLs**. Or skip that and paste the campaign's share link straight
into **Clients → the shop → Rankings → Map URL** (the bare token works too).

Currently on per-keyword tabs: ABC Auto Glass, HV Auto Glass Denver,
Maximum Glass, Speedy Windshield Repair. Skip this entirely if the tabs are
fine — nothing else depends on it.

### 0.0b A BabyLoveGrowth key per shop
**Blocks:** all syndicated SEO articles.

Per shop: **Clients → the shop → SEO tab**. Tick *Publish SEO articles for this
shop*, paste that shop's BabyLoveGrowth key, *Save key*, *Test connection*,
*Sync articles now*. After that it runs itself, nightly at 05:00 UTC.

The key is what identifies the shop, so nothing is matched by website and
nothing can land on the wrong site. The account-wide key in Settings → API keys
is only needed if one BabyLoveGrowth account covers several shops — then each
organisation's website has to be set correctly, and anything it cannot place
waits in Admin → SEO Articles.

Articles making a claim the platform is not allowed to make on a shop's behalf
are held rather than published, on that shop's SEO tab. Read them before
clearing: the scan catches known phrasings, not a fabricated fact stated
plainly.

Switching the toggle off takes that shop's live articles down as well as
stopping the next pull.

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

1. **Response-time tracking.** The app knows when a lead arrived and when its status moved. "This shop takes four hours to touch a lead" is nearly free, and it is your answer when a client says the leads are bad.
2. **Real sales page at glassleads.app.** Every client site's footer now links "Powered by GlassLeads" to the apex, which serves a holding brand page (features, no pricing, no contact). The real page needs decisions only you can make: published pricing yes/no, the CTA (a demo-booking link? a phone number? an email that actually receives mail — the Resend domain only sends), and proof (screenshots, a client quote).
3. **Two-step quote form with partial capture.** The form dropped from six
   required fields to four, which was most of the available gain. The rest —
   submitting name/phone/ZIP on step one so an abandoned form still sends a
   lead — was deliberately NOT shipped, because it changes what a "lead"
   means for every downstream consumer: HighLevel forwarding, the Google Ads
   offline upload keyed on lead id, same-day dedup, and alert timing. A lead
   that never completes step two becomes a permanent half-record flowing into
   your ad conversions. Worth doing, worth designing first.
4. **Monthly client-facing report.** Leads → booked → revenue. The retention artifact for a $497 client.
5. **Follow-up on unbooked leads.** A lead marked "didn't book" is currently dead. Most shops never chase them.
