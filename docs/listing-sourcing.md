# Sourcing directory listings

How new shops get into `src/data/directory-shops.json`, and the checks that
stand between an agent's output and a live page on the site.

## The rule that shapes everything

**A fabricated listing is the worst thing that can reach the directory.** It
publishes a business that doesn't exist, under our name, with a phone number
that rings nowhere. One did reach production once — a placeholder from a
sourcing prompt, echoed back by four separate agents as if it were a real shop.
It got through because it was *well-formed*. Structural validation cannot catch
invention.

So the pipeline has two independent lines of defence: one that checks the shape
of a listing, and one that goes and looks at whether the business is real.

## Pipeline

```sh
node scripts/listings/jsonl2json.mjs      # agent-out/*.jsonl -> *.json
node scripts/listings/ingest.mjs          # structural validation -> accepted.json
node scripts/listings/verify-live.mjs accepted.json accepted-verified.json
node scripts/listings/gate.mjs            # apply verdicts -> accepted.json
node scripts/listings/merge.mjs           # append to seed + provenance
node scripts/listings/geocode.mjs         # Census bulk geocoder
```

Agents write JSONL, one object per line, appended as they go — so an agent that
dies mid-run (session limits, API errors) still leaves everything it found.
This has already paid for itself: a batch of 14 agents lost 13 to a session
limit and 887 of their listings survived on disk.

### 1. `ingest.mjs` — is it well-formed?

Rejects rather than repairs. Current rejection reasons, in rough order of
volume:

- duplicate on name+city, or slug collision
- `source` is a search query rather than a page that can be revisited
- missing street / phone / any required field
- phone already belongs to a **differently-named** shop. Keyed on name, not
  phone alone, because a legitimate chain runs one central line across
  branches — Granite State Glass has seven New Hampshire shops on one number.
- national chain or franchise (Safelite, Glass Doctor, Auto Glass Now, Glass
  America, Diamond Triumph, …)
- distributor rather than a shop (Mygrant, PGW, Pilkington) — they sell glass
  to the trade, so a listing sends the customer somewhere that won't serve them
- not auto glass (shower doors, storefront glazing, window & door)
- placeholder phone numbers — the 555-01xx range is reserved for fiction, and
  555-1234 is what every template ships with
- unverifiable claims in the description: star ratings, review counts, years in
  business, "award-winning", "top rated"

It also *reports* rather than rejects two-shops-at-one-address, which is
sometimes genuine and sometimes a conflated record. That gets a human look.

### 2. `verify-live.mjs` — is it real?

Fetches the shop's own site and checks whether the business actually claims
that phone number or name.

| verdict | meaning | action |
|---|---|---|
| `confirmed` | site carries the phone number | keep |
| `named` | site carries distinctive words from the name | keep |
| `weak` | live site, corroborates neither | keep, print for review |
| `blocked` | 403/503/timeout — a WAF refusing a bot | keep |
| `dead` | NXDOMAIN, or 404/410 | **drop** |
| `nosite` | no website given | keep; nothing to check |

The `blocked` category matters. A first version treated every non-2xx as dead
and flagged 23 listings — 17 of them HTTP 503, which is small-business hosting
refusing an unfamiliar user agent, not evidence of anything. Only "this host
does not exist" and "this resource is gone" count against a listing.

**Calibration:** run against listings already in the directory, ~85–88% come
back `confirmed` or `named`. A new batch landing far below that is worth
reading before it ships. On the 640-listing batch, 279 of 313 checkable
listings corroborated — 89%, right on baseline.

### 3. `merge.mjs`

Appends to the seed file and writes source URLs to
`src/data/directory-shops-sources.json`, with a tier marking whether the data
came from the shop's own site or a scraped aggregator. The app never reads
provenance, but being able to answer "where did this come from" matters when a
shop asks.

### 4. `geocode.mjs`

US Census bulk geocoder — free, no API key, authoritative for US addresses.
**Only exact street matches are written back.** An unmatched shop keeps no
coordinates rather than getting a ZIP centroid, because "3.2 miles away" has to
be true to be worth showing.

## Writing the agent prompt

- **Never include an example object.** That is exactly how the placeholder
  reached production — four agents echoed the prompt's own sample back as data.
  Describe the fields in prose instead.
- Give each agent the shops we already hold in its metros, so it doesn't spend
  its budget re-finding them.
- Require a `source` URL per listing, and say plainly that a page must have
  been fetched.
- State the failure mode explicitly: *"returning 60 real shops is a success;
  returning 100 with 15 invented is a failure."*
- Tell them to search each metro several different ways. One query returns the
  same ten aggregator results every time.
