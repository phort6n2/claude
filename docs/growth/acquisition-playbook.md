# Acquisition Playbook: Getting Independent Auto Glass Shops onto Windshield Repair HQ

_Research brief — how to populate windshieldrepairhq.com with free/claimable listings and drive claims, then monetize via SEO/Google Ads management._

**Market context:** The US auto windshield repair services industry is roughly $8.5B (IBISWorld, 2024). Safelite runs ~7,100 locations, but the long tail is thousands of independents — a fragmented, low-digital segment a directory can aggregate and upsell. No one owns this niche directory yet.

---

## Strategic spine: "pre-populate then invite to claim"

Do not build an empty directory and beg shops to register. Build a directory **already full of their businesses**, rank it in Google, then tell owners "you're already listed — claim it free." Why it works:
1. **Zero-friction signup** — data's already there; claiming is one click.
2. **Trust** — a live, professional profile proves you're real before you ask for anything.
3. **Loss aversion / urgency** — owners fear a competitor claims it first or that wrong info sits on a page ranking for their name. The strongest conversion lever.
4. **Self-service funnel** — the "Claim this listing" button converts passive traffic into leads with no sales labor.

**Monetization reframing:** the claim is the _foot in the door_, not the revenue. Funnel: **Pre-populated listing → owner claims (free) → warm, opted-in contact → upsell SEO/Google Ads.** Treat every claim as a qualified inbound lead.

---

## 1. Build the seed list at scale (do this first)

**Primary source — Google Maps / Places data** (90%+ discoverable here with phone, address, website, hours, rating, review count).

_Legal reality:_ Google's Maps Platform ToS prohibits exporting/caching/storing most Places content (place_id is the exception you _are_ allowed to store). Separately, US courts have generally held that scraping _publicly available_ data doesn't violate the CFAA — so scraping public business **facts (NAP: name/address/phone/website) is a contract/ToS issue with Google, not a crime**; enforcement is IP/account blocking, not lawsuits. Facts aren't copyrightable; **do NOT copy Google reviews or photos.**

_Compilation methods:_
- **Official Places API** — cleanest legally, but storing content long-term violates ToS; best for _refresh/verify_.
- **Third-party scrapers** (fastest/cheapest at this scale): Outscraper, Apify's Google Maps scrapers → export names/addresses/phones/websites/hours/ratings to CSV/JSON; some also visit each shop's site to pull a contact email. Outscraper cheapest under ~2,000 leads.
- **Query strategy:** by city × category, not nationally. Loop the ~300–500 largest US cities × terms ("auto glass repair," "windshield replacement/repair," "mobile auto glass," "ADAS calibration"). De-dupe on phone + place_id. Filter OUT chains (Safelite, Glass Doctor, Gerber/Boyd, Caliber) to isolate independents.

_Secondary sources:_ Yelp (category "Auto Glass Services"); YellowPages (older, less-digital independents); **trade associations** — Auto Glass Safety Council (AGSC) public registered-companies directory + annual member PDF; National Windshield Repair Division (NWRD, now part of AGSC); Independent Glass Association (IGA); **glass distributor / "where to buy" locators** — Mygrant Glass, Pilkington supplier finder, PGW, WRD tools distributors (anyone buying wholesale glass is an active shop); state business licensing databases.

_Compliance:_ store only factual NAP + public business email/phone; keep a **source column** and a **suppression list** (opt-outs, required by CAN-SPAM + TCPA). **Target: 3,000–10,000 records** is very achievable; you only need a few hundred _claims_ to have a monetizable base.

---

## 2. Execute the pre-populate + claim system

1. Generate a real, SEO-optimized page per shop (NAP, map, hours, services, "Claim it free" CTA); unique content so pages index.
2. Make claiming **free and instant**; monetize downstream, not via a listing fee.
3. **Verify** via a code to the shop's Google-listed phone or business email.
4. Engineer **urgency** in the claim UX ("3 competitors in [City] have claimed," "viewed X times this month," "unclaimed — info may be out of date").
5. **Instrument everything** — views → claim clicks → claims, per city. Views without claims = your outreach targets.

---

## 3. Cold outreach that works for local trades

Owners are phone-and-truck people. **Rank channels: (1) cold call, (2) direct-mail postcard, (3) email.** Run a multi-touch sequence — ~93% of converting leads take up to 6 attempts.

**Legal compliance (get this right):**
- **Email (CAN-SPAM)** — opt-out law; B2B cold email is allowed. You MUST: accurate sender identity, non-deceptive subject, valid **physical postal address**, clear **opt-out** honored within 10 business days. Penalty up to **$53,088 per email**.
- **SMS & cold calling (TCPA)** — much stricter. Marketing texts require **prior express written consent** before the first message; damages **$500–$1,500 per message**, no cap; **one-to-one consent** as of Jan 2026. **Practical rule: don't send cold marketing SMS.** Safer: (a) **cold _calls_ to published business landlines** — permissible B2B, but scrub the National **Do-Not-Call Registry**, honor internal DNC, identify yourself, avoid autodialers to cells; (b) use SMS **only after** someone claims/opts in. Note ~a dozen states have stricter mini-TCPA statutes.

**Scripts:**

_Cold call (primary):_
> "Hi, is this [Owner/Shop]? This is [Name] with Windshield Repair HQ — a new directory just for independent auto glass shops. I've **already built a free profile page for [Shop]** and it's showing up when people in [City] search for windshield repair. I wanted to give you the login so you can control it — takes a minute, and it's free. Do you handle the marketing, or is there a better person?"
> Objection ("what's the catch?"): "The listing's genuinely free — we make money separately helping a few shops with Google Ads and search rankings, zero obligation. What's the best email for the claim link?"

_Cold email (CAN-SPAM):_
> **Subject:** Your Windshield Repair HQ listing for [Shop Name]
> Hi [First name], we built a free directory for independent auto glass shops — and [Shop Name] is already on it: [profile URL]. It's live in [City] searches. Claim it free (one click) to fix your hours, services, and phone so customers reach you, not a competitor: [claim link].
> — [Name], Windshield Repair HQ · [Physical address] · Not interested? [Unsubscribe].
> _(Follow-ups days 4, 9, 14 add a "viewed X times" data point + light urgency. Six touches.)_

_Direct-mail postcard:_ Front: "[Shop Name], you're already listed on WindshieldRepairHQ.com." Back: "We built your free profile so local drivers can find you. Claim it free and control your listing before it goes out of date. Scan the QR code." A **QR code** deep-linking to the pre-filled claim page removes all friction.

---

## 4. Partnership channels (force multipliers)

1. **Glass distributors — the #1 partnership.** Mygrant, PGW, Pilkington sit between manufacturers and every independent; shops log into their portals daily. Pitch co-marketing (flyer in shipments / portal message) with rev-share on sourced SEO/Ads clients. Fastest path to thousands of shops.
2. **ADAS calibration equipment/software vendors** (Autel, Bosch, Opti-Aim) — current buyer lists of exactly the tech-forward shops most likely to also buy SEO/Ads.
3. **Trade associations** — AGSC/NWRD and IGA; member perk + association-branded page; sponsor a webinar/newsletter for instant credibility.
4. **Insurance/TPA networks** — public network shop lists as a lead source; independents' anxiety about TPA control (2025 State Farm switch to Safelite Solutions) is a messaging hook.
5. **Industry media** — glassBYTEs.com / AGRR: press release + sponsored post reaches owners directly.
6. **Local chambers & BBB** — cheap, verified small-business contacts for the direct-mail angle.

_Distributor pitch:_ "You already have the relationship with every independent shop. We built a free directory that helps them get found by local drivers. We'd like to offer _your_ customers free premium listings, co-branded with [Distributor] — a no-cost value-add for your next customer email — and we'll share revenue on any shop that later buys our marketing services."

---

## 5. Inbound: SEO/content + community

- The **pre-populated city/shop pages are your SEO engine** ("[city] windshield repair," "auto glass repair [state]").
- Publish **owner-facing** content that ranks for what _shop owners_ search: "how to get more auto glass leads," "auto glass shop marketing," "how to compete with Safelite," "auto glass insurance claims for independents." The "list your shop free" CTA converts them.
- A consumer content hub (repair vs. replacement, ADAS cost) drives the _consumer_ traffic that makes listings valuable — the argument you use in the upsell.
- **Community:** Facebook groups (Auto Glass Tech Group, WindshieldChat community, Auto Shop Owners Group) and forums (AutoShopOwner.com). Don't spam — provide value, then get the _group admin_ to co-promote.

---

## 6. Referral & viral loops

- **Shop-to-shop referral:** "Refer another shop, you both get 3 months Featured / a free Ads audit." Non-competing metros refer freely.
- **Claim-triggered ask:** right after claiming, "Know another shop that should be listed? Send them your link."
- **Badge / status loop:** "AGSC-Certified" / "Top-Rated in [City]" badges shops share on their own sites — backlinks that market the directory for free.
- **Review widgets:** every install of the embeddable "Reviewed on Windshield Repair HQ" widget is a backlink + brand exposure.

---

## 7. The sequence: first 100, then first 1,000

**Phase 0 — Foundation (Wk 1–2):** compile 3,000–5,000 independent shops (start top 100 metros); generate pre-populated, indexable pages + one-click free claim with phone/email verification; set up CAN-SPAM-compliant email infra + a DNC-scrubbed call list.

**Phase 1 — First 100 claims (Wk 3–8) — concentration beats breadth:** pick **3–5 metros** you can dominate (makes "your competitors are already on here" urgency real). **Cold call** owners there (send the claim link live on the call) + the **6-touch email sequence**; post helpfully in 2–3 FB groups; land 1 micro-partnership. **Goal: 100 claimed listings = 100 warm SEO/Ads leads.** Begin the upsell with early claimers.

**Phase 2 — First 1,000 claims (Mo 3–9) — systematize + partner-led scale:** expand the DB to all 50 states; **close 1–2 major distributor partnerships** or an AGSC/IGA deal (the step-change — one blast beats months of calling); add a small cold-call team/VAs; turn on the **referral loop**; let **SEO compound** (owner-facing content drives inbound signups); direct-mail the non-digital long tail. Run monetization in parallel — every claim → nurture → pitch SEO/Ads.

**KPIs:** pages indexed → views/city → claim clicks → claims → discovery calls booked → clients closed. Optimize the weakest step.

---

### One-line summary
Scrape a national database of independent shops → publish a claimable, SEO-ranking profile for each → drive claims with cold calls + CAN-SPAM email + distributor/association partnerships + community + referrals → treat every free claim as a warm lead for the real business: SEO and Google Ads management. Concentrate in a few metros to hit 100, then let a distributor/association partnership and compounding SEO carry you to 1,000.

**Compliance guardrails:** cold email OK with opt-out + physical address; cold-call scrubbed landlines only, no autodialed cell blasts; reserve marketing SMS for post-claim opted-in shops; never copy Google reviews/photos, only factual NAP.

### Key sources
Ideal Directories (claimable listings); ReviewTrackers (Yelp handbook); Google Places policies; scrape-legality (Scrap.io, MapScraping); Outscraper / Apify; CAN-SPAM B2B (Instantly); TCPA (Infobip, ActiveProspect); AGSC & NWRD member lists; Mygrant / Pilkington; State Farm TPA switch (glassBYTEs); Auto Glass Tech Group (FB); AutoShopOwner forum; GrowSurf (marketplace referrals); IBISWorld (market size).
