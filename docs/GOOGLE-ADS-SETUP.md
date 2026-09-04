# Google Ads setup — the same in every account

Every client account gets the **same four conversion actions, under the same
four names**. That is the whole point: with one convention a report can span
accounts, a new account can be set up from a list rather than from memory, and
the app can answer "is this shop tracking properly?" with a query instead of
somebody opening Google Ads and reading it by eye.

The app checks this automatically. **Admin → client → Advertising → Conversion
setup in Google Ads** audits the live account against the standard below and
says exactly what to change. `GET /api/admin/google-ads/conversion-audit`
does the same across every client at once.

The standard lives in code at `src/lib/google-ads-conventions.ts` — change it
there, not here, and this file follows.

---

## The four actions

| Name | Fires when | Goal | Count | Click window | Call length | Bidding |
|---|---|---|---|---|---|---|
| `AGMP Lead Form` | The quote form on the hosted site is submitted | Submit lead form | One | 90 days | — | **Primary** |
| `AGMP Call From Ads` | Someone taps the call asset in the ad itself | Phone call lead | One | 30 days | 10s | **Primary** |
| `AGMP Website Call` | Someone calls the number shown on the site | Phone call lead | One | 30 days | 10s | **Primary** |
| `AGMP Sale` | This app uploads a lead marked SOLD with a value | Purchase | One | 90 days | — | Secondary |

Attribution on all four: **data-driven**.

### Why these four and not others

The three lead actions are what Smart Bidding optimises to. `AGMP Sale` is the
attribution loop closing — the job that was actually sold, with its real value,
uploaded back against the click that produced it. It stays **secondary** until
a shop has the volume to bid on value; a shop doing twenty jobs a month cannot
feed a value strategy, and switching early makes the bidding worse rather than
better. Promoting it is a decision someone makes, not a box that got missed.

They deliberately sit in four different **categories**. Primary and secondary
are set per `CATEGORY~ORIGIN` goal, not per action, so two lead actions sharing
a category could not be told apart by bidding even if you wanted them to be.

### Having them is not the same as bidding to them

Biddability is a property of the goal, and **a campaign may carry its own set
of conversion goals that overrides the account's** — `conversion_goal_campaign_
config.goal_config_level` is `CAMPAIGN` rather than `CUSTOMER`. So an account
can pass the audit with all four actions correct while every campaign that
spends money optimises to something else, and nothing about the campaign looks
wrong: the conversions arrive, the column fills in, the bidding steers by a
different signal.

That is not hypothetical. Read live on 2026-09-04, all four enabled campaigns
in Auto Glass Kings sat at `CAMPAIGN` level and bid on
`PHONE_CALL_LEAD~CALL_FROM_ADS`, `CONTACT~CALL_FROM_ADS` and
`CONVERTED_LEAD~WEBSITE` — so `AGMP Lead Form`, firing on every quote form on
the hosted site, was measured and ignored on all four.

**Campaigns bidding to these**, on the Advertising tab, checks this per
campaign, and the weekly sweep files it as `campaign-goal-ignored` so it
surfaces on *Needs action* without anybody opening the tab. Where the fix
belongs depends on the level: a `CAMPAIGN`-level campaign is fixed in
**Campaign → Settings → Conversion goals**, a `CUSTOMER`-level one in **Goals →
Conversions → Settings** — and that second one moves every campaign that
inherits.

---

## Setting up a new account

### 1. Link it

- The account must sit under the AGMP manager account (MCC `783-707-5221`).
- In the app: **Advertising tab → Google Ads → pick the account from the
  dropdown**. Never type the customer id — a mistyped ten-digit number checks
  someone else's conversions and looks fine doing it.

### 2. AGMP Lead Form

1. Goals → Conversions → **New conversion action → Website**.
2. Scan the shop's site URL, then **Add a conversion action manually**.
3. Goal: **Submit lead form**. Name: `AGMP Lead Form`.
4. Value: **Don't use a value** — the value comes from the booked job, not the
   form.
5. Count: **One**. Click-through window: **90 days**. Attribution: data-driven.
6. Copy the tag's `send_to` (`AW-xxxxxxxxx/LABEL`) into the app on the
   Advertising tab. The site fires it on submit; without it the action exists
   and never counts anything.

### 3. AGMP Call From Ads

1. Goals → Conversions → **New conversion action → Phone calls → Calls from
   ads using call assets**.
2. Name: `AGMP Call From Ads`.
3. Count a call after **10 seconds**. Count: **One**. Click window: **30 days**.
4. The campaign needs a **call asset** or this never fires. An account with
   this action and no call asset looks configured and reports nothing.

### 4. AGMP Website Call

1. Goals → Conversions → **New conversion action → Phone calls → Calls to a
   phone number on your website**.
2. Name: `AGMP Website Call`.
3. **The number must be the one the site actually shows.** If a tracking number
   is set in this app, the site shows *that* number — the conversion action has
   to name it, or Google swaps a number the page never displays and the action
   never fires. Check the Advertising tab for which number is live.
4. Count a call after **10 seconds**. Count: **One**. Click window: **30 days**.
5. Copy the snippet's `send_to` into the app.

### 5. AGMP Sale

1. Goals → Conversions → **New conversion action → Import → Manual import
   using API or uploads**.
2. Goal: **Purchase**. Name: `AGMP Sale`.
3. Value: **Use different values for each conversion** — the app sends the real
   job value.
4. Count: **One**. Click window: **90 days**.
5. In the app: **Advertising tab → offline conversion action → AGMP Sale**.
   Nothing uploads until this is set, and the audit reports it when it isn't.

### 6. Goals

Goals → Conversions → **Goals** tab:

- `Submit lead form` — Primary
- `Phone call lead` — Primary
- `Purchase` — **Secondary**

Everything else Google created by itself (store visits, directions, page views,
"Local actions - …") stays Secondary. They are engagement, not leads, and
bidding to them buys traffic that does not ring the phone.

---

## Fixing an existing account

**Rename, never recreate.** An action of the right shape under the wrong name
is a rename. The conversion history, the volume and the bidding learning all
live on the action; a fresh one starts from zero and puts Smart Bidding back
into learning. The audit says "rename this one" and names it for that reason.

Typical corrections, all seen in live accounts:

- `Calls from ads` / `Call from Ads` → rename to `AGMP Call From Ads`.
- `Submit lead form - New landing page` → rename to `AGMP Lead Form`.
- `Call (503) 832-4376` → rename to `AGMP Website Call`, and check the number
  it names is the one the site shows today.
- A call action counting after 15s (Google's default) or looking back 7 days →
  correct in place. The standard is **10s**, chosen deliberately: at these
  volumes bidding is starved of conversions long before it is fooled by a bad
  one, and plenty of real enquiries in this trade are over inside fifteen
  seconds. Both call actions must carry the same number, or one inbound call
  counts differently depending on which way it arrived.

If two enabled actions have the same shape, keep the one carrying the history,
rename it, and **pause** the other. Pausing keeps its past conversions in the
reports; removing takes them with it.

### `AGMP Call` and `AGMP Form` — HighLevel's, and being retired

`AGMP Call` fires when a call reaches a **HighLevel tracking number**;
HighLevel uploads it. `AGMP Form` is the same path for form fills. Both sit in
**Converted lead**, which is right for them: a lead that arrived by phone or
form, not the tag-measured event.

They are LEGACY. Call tracking is moving to Twilio numbers inside this app,
where Google counts the call itself through `AGMP Website Call`. Nothing new
should be pointed at them, and no new account should get them.

**One call conversion per shop.** A shop still on HighLevel has `AGMP Call`
and no website-call action — correct, and the audit says so rather than
nagging. A shop moved across has `AGMP Website Call` and `AGMP Call` sitting
Secondary with its history. Both bidding at once means one inbound call is two
conversions: the shop looks like it is doing twice the business and Smart
Bidding pays for it. It is invisible in the Ads UI, because the two actions
are in different categories and neither looks like a duplicate of the other.

#### Moving one shop from HighLevel to a Twilio number

Order matters — steps 1 and 3 are what keep the count honest.

1. **In this app:** buy or assign the tracking number and flag it for the
   site. The site now shows the Twilio number, so HighLevel's number pool is
   out of the picture. Do this FIRST: while HighLevel is still swapping the
   number on the page, do not add Google's website-call action — two swap
   systems competing for one number is a broken phone number on the page, not
   just bad data.
2. **In Ads:** create `AGMP Website Call` naming the Twilio number the site
   now shows, and paste its `send_to` into the app.
3. **In Ads:** set the **Converted lead** goal to **Secondary**. `AGMP Call`
   keeps every conversion it has ever recorded and stops bidding. Do not
   remove or pause the action — removing takes its history out of the reports.
4. **In HighLevel:** stop the conversion upload, so it stops adding rows to an
   action nobody is bidding on.
5. Re-run the audit. "Counting the same lead twice" should be empty.

Once the last shop is across, `AGMP Call` and `AGMP Form` can be dropped from
`LEGACY_PAIRS` and this section deleted.

---

## Google Analytics, and not counting a lead twice

GA4 goes on the site from the app (Advertising tab → Google Analytics), one
property per shop, riding the same `gtag.js` the Ads tag already loads.
Linking the property to the Ads account is a step only Google's UI can do:
Ads → Tools → Data manager → Google Analytics (GA4) → Link.

**Do not import GA4 conversions as Primary.** Once the property is linked,
Google offers to import GA4 events as conversion actions. An imported
`generate_lead` or `purchase` is the SAME form submission `AGMP Lead Form`
already reported — two actions counting one lead. Smart Bidding reads that as
two wins and bids to a number that does not exist, and it looks like
performance improving.

Nothing in this platform can create one of these: the offline upload writes to
a single Ads conversion action over the API and cannot reach Analytics at all.
They only ever arrive from a click in the Ads UI.

Both live accounts already carry a dormant GA4 import — "… (web) purchase",
type `GOOGLE_ANALYTICS_4_PURCHASE`, status HIDDEN. Dormant is correct. **Leave
them that way.** The audit reports one that is merely dormant as a note, one
that is enabled but Secondary as acceptable, and one that is enabled AND
Primary as a failure.

---

## What the audit checks

For each of the four: that it exists, that it is named exactly right, and that
counting, click window and call length match. Then:

- the goal for each action is Primary or Secondary as the table says;
- the app's own offline conversion action points at `AGMP Sale`;
- any other `AGMP …` action in the account is listed, with a note;
- any GA4-imported action, and whether it is dormant, observed or bidding;
- any other live action sitting in a goal the standard already owns.

It reads only. An audit that fixes things is one nobody can run to find out
what is wrong.

## Where the ads land

The other half of the standard: every live click must arrive on the
app-hosted site, because that page carries the tracking number, the
attribution capture and the coached layout. An ad pointing at the shop's old
website or a HighLevel funnel spends the same money and feeds a page with
none of the wiring — and nothing inside Google Ads will ever flag it,
because Google does not know which host is ours.

The "Where the ads land" card on the client's Advertising tab reads:

- every **enabled ad's** `final_urls` and `final_mobile_urls` (mobile
  override included on purpose — most auto-glass traffic is phones);
- every **Performance Max asset group's** URLs, since PMax sends clicks
  through those rather than ads;
- every **sitelink** attached at account, campaign or ad-group level — an
  account-level sitelink pointing at the old site rides on every campaign.

Each URL is judged against the client's own hosts: their
`{sub}.glassleads.app` subdomain and every custom domain on the record
(`www.` ignored). Off-target rows are listed with the campaign, the ad or
sitelink name and the exact URL, plus the stray hosts by name — which is
usually the old website, and the fix is editing those URLs in Google Ads.

Live things only: a paused ad pointing at the wrong page costs nothing, and
listing it would bury the rows spending money right now. Reads only, like
the conversion audit and for the same reason.
