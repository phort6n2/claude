# Open items

Everything built that needs something from you before it does anything, plus
the decisions still outstanding. Kept in the repo so it survives a chat
window.

Last reviewed: 2026-08-13

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
4. **Monthly client-facing report.** Leads → booked → revenue. The retention artifact for a $497 client.
5. **Follow-up on unbooked leads.** A lead marked "didn't book" is currently dead. Most shops never chase them.
