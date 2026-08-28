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
| `AGMP Call From Ads` | Someone taps the call asset in the ad itself | Phone call lead | One | 30 days | 15s | **Primary** |
| `AGMP Website Call` | Someone calls the number shown on the site | Phone call lead | One | 30 days | 15s | **Primary** |
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
3. Count a call after **15 seconds**. Count: **One**. Click window: **30 days**.
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
4. Count a call after **15 seconds**. Count: **One**. Click window: **30 days**.
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
- A call action counting after 10s or looking back 7 days → correct in place.

If two enabled actions have the same shape, keep the one carrying the history,
rename it, and **pause** the other. Pausing keeps its past conversions in the
reports; removing takes them with it.

### Legacy names

`AGMP Call` and `AGMP Form` are upload actions from before this convention.
They are recognised by the audit and listed as "other AGMP actions" rather than
flagged as strangers. Leave them enabled if they hold history, but nothing
should upload to them — `AGMP Sale` is the upload target now.

---

## What the audit checks

For each of the four: that it exists, that it is named exactly right, and that
counting, click window and call length match. Then:

- the goal for each action is Primary or Secondary as the table says;
- the app's own offline conversion action points at `AGMP Sale`;
- any other `AGMP …` action in the account is listed, with a note.

It reads only. An audit that fixes things is one nobody can run to find out
what is wrong.
