# The Google Ads optimization playbook

What the weekly sweep believes and why. Compiled 2026-09-01 from Google's
official guidance and the practitioner canon (Optmyzr, Adalysis, Smarter
Ecommerce's 4,000-campaign study, GrowMyAds, Menachem Ani, Aaron Young,
NAV43, Pete Bowen, Seer Interactive, and Google's own Ads Liaison on the
record), for the account shape this platform manages: local auto glass,
calls + forms, $500–$5,000/month.

Every automated rule lives in `src/lib/google-ads-playbook.ts` with its
threshold as a named constant. **CONSENSUS** = Google and practitioners
agree. **MAJORITY** = most practitioners, some dissent. **CONTESTED** =
live disagreement, noted below. Encoded rules are marked with their check
key; everything else is operator judgment the sweep deliberately does not
automate.

## The two meta-rules (encoded as machinery, not checks)

**Cooldowns.** After any bidding change, hands off for 7 days minimum, 14
preferred (Google: up to 3 weeks). Keep any single target or budget change
≤20% — practitioners prefer 10–15% — one adjustment per week at most.
Google officially denies budget changes "reset" learning; the entire
practitioner canon behaves as if they do; the discipline costs nothing, so
it is encoded. The sweep consults 30 days of `change_event` before every
recommendation and stays silent about anything recently touched — and if
the change history cannot be read, it recommends nothing at all. MAJORITY
(the 20% number is practitioner lore, labeled as such).

**Evidence floors.** Never judge on windows under 14 days; judge tCPA
campaigns on trailing-30 minimum. On 5–15 leads/month, 7-day windows are
noise. One change at a time; batch structural edits. CONSENSUS.

## Bidding: the maturity ladder (Search)

The 2026 practical synthesis — capped Maximize Clicks → Maximize
Conversions → target CPA — with Google itself dissenting at the first rung
(they say start on the smart-bidding strategy you want; practitioners at
this budget tier disagree; CONTESTED).

- **15–25 accumulated conversions**: graduate Maximize Clicks → Maximize
  Conversions. Encoded at 20: `graduate-bidding`. MAJORITY.
- **≥30 conversions/30d**: volume can support a target CPA. Encoded:
  `consider-tcpa`. CONSENSUS on the number; contested whether a
  $500–$2k/mo shop ever needs a target at all — many leave budget-capped
  Maximize Conversions forever, which is why this files as REVIEW, never
  ALERT.
- **A target on <15 conversions/30d is premature** (Google's own floor).
  Encoded: `tcpa-before-data`. The 15–30 band is grey and stays quiet.
  CONSENSUS.
- **Initial target = observed 30-day CPA, or 10–20% above. Never below,
  never the wish price.** Then stair-step down 10–15% at a time, ≥2 weeks
  apart, stopping when volume sags. CONSENSUS. (Carried in the
  `consider-tcpa` finding text.)
- **Daily budget ≥2× the target CPA** (Google's floor; practitioners say
  3–5×). Encoded: `budget-below-target`. CONSENSUS.
- **Conversion pooling**: count qualified forms AND duration-gated calls
  (30–60s) as primary to reach volume floors; never pad with
  micro-conversions. One call conversion per number — the platform's
  existing `AGMP Call` / `AGMP Website Call` rule is this rule. CONSENSUS.

## Settings that leak (Search)

- **Display Expansion: always off.** Seer's test: +89% cost, −33%
  conversions, +184% CPL. The strongest single consensus in the research.
  Encoded: `display-expansion-on`.
- **Search partners: off at launch**; reconsider only against ≥30 days of
  segmented data. Encoded: `search-partners-on`. MAJORITY.
- **Location options: Presence, not "presence or interest"** — widely
  called the most expensive default in local advertising, and Google's own
  lead-quality docs list it as a spam fix. Encoded: `geo-interest`.
  CONSENSUS.
- Radius/city targeting over zip lists; auto-apply recommendations OFF;
  broad match not before well past 30 conv/mo (CONTESTED — Google pushes
  it, low-volume practitioners near-uniformly don't). Operator judgment,
  not encoded.

## Search terms and negatives

- **The statistical bar for a negative is ~2–3× the campaign's CPA spent
  with zero conversions** — below that is noise, and Optmyzr's 2024 data
  says over-negativing is now the more common failure (0.24% CVR
  difference between heavy and light excluders). Encoded at 2× observed
  CPA (floor $50) + ≥8 clicks: `negative-candidates`. CONSENSUS on the
  band.
- **Intent-based negatives** (DIY, jobs, free, repair kits, wrong service)
  are justified at ANY spend — that is a human reading intent, so the
  sweep lists candidates and never auto-adds. Phrase match by default;
  negatives do not expand to close variants, so add plurals yourself.
  CONSENSUS.
- Cadence: weekly for a campaign's first 60 days, every 2–4 weeks mature —
  the weekly sweep matches this.

## Ads (not encoded — operator judgment)

Two RSAs per ad group (Optmyzr's 13k-account study; Google says 2–3; a
one-strong-RSA camp exists for micro-budgets — MAJORITY). **Ad Strength is
cosmetic**: Google's own Ads Liaison, on record, says it is not used in Ad
Rank; Optmyzr found no CPA correlation. Never unpin compliance-required
copy to chase the label — pinned ads showing "Poor" is fine, pin 2–3
alternatives per slot to keep volume. CONSENSUS among practitioners,
against Google's marketing.

## PMax for local lead gen

The research's headline: **for a sub-$2k/month local shop, the majority
expert position is don't run PMax at all — run Search.** The floors that
produce that verdict (each individually CONSENSUS):

- Search first, always; PMax is an expansion layer. When they overlap,
  Search wins ~84% of the time (Adalysis).
- **≥30 conversions/30d on the bidding action before launching** (Smarter
  Ecommerce: below 30, results swing −100% to +400%).
- **Daily budget ≥3× target CPA** — at a $60 CPL that is ~$5,400/month.
- **Qualified-lead feedback is a launch prerequisite**: never bid on raw
  form fills or call clicks — PMax's display inventory is where bot
  form-fills come from, and it optimizes toward whatever fires the tag.
  Offline import (this platform's `AGMP Sale` pipeline) is the steering
  wheel. NAV43's rule: no CRM feedback after 60 days of PMax → pause it.
- Budget share: Search keeps 60–90%.

Where PMax IS run (the $3–5k accounts):

- **Judge nothing before 6 weeks** (8–10 with offline import). Encoded as
  the `PMAX_MIN_AGE_DAYS = 42` silence window. CONSENSUS.
- **Final URL expansion off for lead gen** — expansion routes paid clicks
  past the page built to convert them. Encoded: `pmax-url-expansion`.
  CONSENSUS.
- 1–2 asset groups per campaign at this budget, themed by service; fill
  assets fully; upload a real video (auto-generated underperforms 25–40% —
  MAJORITY, one Solutions 8 counter-example); up to 25 search themes from
  real converting queries; first-party audience signals attached at launch
  (helpful early, non-binding — the skeptic camp says conversion goals
  matter far more).
- Brand exclusions on (own brand via a cheap dedicated Search campaign);
  campaign-level negatives seeded from day one (10,000 cap since March
  2025) — broad patterns in the dozens-to-hundreds, not thousands.
- Campaign-specific conversion goals: qualified actions only; demote
  polluted actions to Secondary immediately.
- Kill criteria (NAV43's codification, MAJORITY): after a full 90-day
  test, cost-per-QUALIFIED-lead ≥30% worse than Search; or <5% of PMax
  leads qualify; or no offline feedback loop 60 days in.

## What the sweep deliberately does not automate

Intent judgments (which negatives are "obviously wrong service"), ad copy
and pinning, brand-exclusion lists, kill decisions, anything requiring a
value call about a specific business. The sweep files evidence; the
operator decides. When the approve→execute layer lands, it carries the
exact mutation payload on the finding, replays it verbatim, and prefers
reversible actions — pause over remove, always.

## Source notes

Full source URLs live with the research; the load-bearing ones: Google Ads
Help (Smart Bidding, learning period 13020501, Target CPA 6268632,
location options 1722043, PMax lead-gen best practices 13775965, PMax
negatives 15726455, channel performance report 16260130), Optmyzr (RSA
study, negatives 2026, PMax cannibalization), Adalysis (Max→Target
thresholds), Smarter Ecommerce State of PMax 2025, GrowMyAds (tCPA
stair-step, search partners), Seer Interactive (Display Expansion test),
Search Engine Land (Ad Strength not in Ad Rank; Menachem Ani's PMax
lead-gen piece), NAV43 (Search/PMax phase table and kill list), Define
Digital Academy, Pete Bowen, jyll.ca, 30characters, dotidot, groas.
Reddit r/PPC consensus is represented secondhand (its threads block
crawling). The 20% learning-reset rule and the 20%-impression-share budget
trigger are practitioner conventions Google has never documented — encoded
as safety margins and labeled so here.
