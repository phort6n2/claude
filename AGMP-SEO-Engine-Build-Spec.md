# AGMP Local SEO Engine — Build Spec for Claude Code

**Owner:** Matt / Auto Glass Marketing Pros (AGMP)
**Purpose:** Build a two-system automated local SEO engine for auto glass shop clients. **SnowSEO** owns the front of the funnel (research → AI-optimized article → publish + tracking + audits). **n8n** (self-hosted at `n8n.voxhit.com`) owns the back half (repurposing, distribution, amplification). The two are joined by a single trigger fired when SnowSEO publishes an article.

This is a **phased** build. Do not build everything at once. **Start with Phase 0 (Discovery)** to resolve two architectural unknowns before writing production nodes.

---

## 1. Context & Goals

- **Business:** AGMP sells one local-SEO tier to auto glass shops at **$697/mo/client**. Clients are local service businesses competing against national brands. ~15 active clients, scaling.
- **Design goals:** (a) cut redundant tooling cost, (b) make this the best-in-class auto glass SEO offering, (c) keep the stack maintainable and duplicable per client.
- **Build philosophy:** This is a **new** workflow, not an edit of the existing production one. Build it isolated, prove it on **one brand-new test client**, then templatize/scale.

---

## 2. Target Architecture (two systems, one seam)

```
                    ┌───────────────────────────────────────────┐
                    │  SNOWSEO  (front of funnel — unlimited plan)│
                    │  • AI/GEO + Google rank tracking            │
                    │  • Keyword research + clustering            │
                    │  • AI-visibility gap topics                 │
                    │  • Brand-voice article generation           │
                    │  • Technical SEO audits (continuous)        │
                    │  • Competitor gap tracking                  │
                    │  • Auto-publish to client WordPress         │
                    │  • API + MCP available                      │
                    └───────────────────┬───────────────────────┘
                                        │  ARTICLE PUBLISHED
                                        │  (webhook OR RSS — resolve in Phase 0)
                                        ▼
                    ┌───────────────────────────────────────────┐
                    │  n8n  (back half — amplification)           │
                    │  Trigger → parse published post →           │
                    │  1. On-page completion (schema/meta/links)  │
                    │     + Renderform featured image card        │
                    │  2. Media: podcast, long-form video, short  │
                    │  3. Profile + links: GBP posts, link wheel  │
                    └───────────────────────────────────────────┘

   AIRTABLE = client control table (NAP, scheduling, per-client toggles,
              SnowSEO project mapping, credential references)
```

**Out of scope for now (deferred):** Review engine (post-job review requests + AI-drafted responses). Will be built separately later. Do not wire it.

---

## 3. Phase 0 — Discovery (DO THIS FIRST)

Two unknowns control how many downstream nodes are needed. Resolve them empirically before building Phases 1–3. Use the **SnowSEO MCP** and a real test publish to inspect actual behavior; do not assume.

### 3.1 What does SnowSEO write into the WordPress post on its own?
Run a test article through SnowSEO to a staging/test WordPress site, then inspect the resulting post and its HTML/REST output. Determine, for each item, **YES (SnowSEO does it) / NO (n8n must do it)**:

- [ ] **FAQPage schema** (JSON-LD) present in the post?
- [ ] **Meta title + meta description** populated? (and is the description quality/length good, ~155 chars?)
- [ ] **Internal links** to relevant service/city pages inserted?
- [ ] **Featured image** set? If yes, is it a generic hero or could it be the branded PAA-question + NAP card we want? (We expect generic → we will override with Renderform.)
- [ ] **Slug control** — does SnowSEO let us control/clean the slug, or does it append `-2` style suffixes on conflicts? (Past pain point on client sites.)
- [ ] **Publish state** — does SnowSEO publish **live** immediately, or can it publish as **draft** so n8n finalizes (image/schema/meta) before going live? Draft-then-finalize is strongly preferred; confirm if possible.

> The answers convert directly into Phase 1 node count. Each "NO" = one n8n post-processing node. Document the findings inline in this file under §3.1 Results.

### 3.2 How does n8n get triggered when SnowSEO publishes?
Determine the trigger mechanism, in priority order:

1. [ ] **Native SnowSEO webhook on publish** — does the API/MCP expose a publish webhook? What is the **payload** (does it include post URL, post ID, client/project ID, target keyword/PAA question)? This is the preferred seam.
2. [ ] **WordPress RSS feed** fallback — if no native webhook, n8n polls each client's WP RSS feed and fires on new items. (Note: the Web 2.0 link wheel already consumes this RSS, so it can stay regardless.)
3. [ ] **WordPress webhook/REST poll** — last resort.

> Record the chosen trigger and payload schema under §3.2 Results. The rest of the build assumes a normalized "Article Published" event (see §6 Data Contract).

### 3.3 SnowSEO API / MCP capability map
Using the MCP, enumerate the endpoints/tools we'll actually call from n8n or Claude Code:
- [ ] Trigger/generate content for a project (and pass a target topic/keyword?)
- [ ] Pull current rankings (Google + AI mentions) per project — for reporting later
- [ ] Read the published article object (URL, title, target PAA/question, keyword, body)
- [ ] List/manage projects (maps to clients)
- [ ] Auth model (API key per workspace? per project?) and rate behavior on the unlimited plan

**Phase 0 deliverable:** This section filled in with real answers + a one-paragraph "confirmed architecture" note stating which post-processing nodes Phase 1 needs and which trigger we're using.

---

## 4. Phased Build Plan

Each phase: build in an **isolated n8n workflow** (clearly named, e.g. `AGMP-Engine-v2 [TEST]`), test end-to-end on the single test client, then proceed. Mark assumptions explicitly. Prefer idempotent steps (safe to re-run) and add error handling on every external API node.

### Phase 1 — The Seam + On-Page Completion
**Objective:** Catch the publish event, normalize it, and ensure every published article ends up fully on-page-optimized with the branded featured image.

Steps:
1. **Trigger** (from Phase 0): webhook or RSS → normalize into the Article Published event (§6).
2. **Fetch the post** via WordPress REST for that client (auth per client from Airtable).
3. **Detect & complete** (only the items Phase 0 marked NO):
   - FAQPage schema — build JSON-LD from the article's PAA question(s); inject.
   - Meta title/description — if missing/weak, generate via Claude API (`claude-sonnet-4-6`), ~155 chars, click-optimized.
   - Internal links — insert links to the client's service/city pages (source list from Airtable or sitemap).
4. **Featured image (Renderform Pro):** generate the branded card = base image + **PAA question** + **NAP** (business name, phone, city/address, website). Pull NAP from Airtable. Set as the post's featured image via WP REST.
5. **Publish/finalize:** if SnowSEO published as draft, flip to live now; else update in place.

**Acceptance:** Test post ends live with correct schema, meta, internal links, and the branded Renderform featured image — verified on the test client's site.

### Phase 2 — Media Repurposing
**Objective:** From each published article, produce and distribute the media assets.

Steps (all hang off the same Phase 1 event/article object):
1. **Podcast:** shape article → script (Claude API if needed) → **Inworld TTS** (see §5.2; use one cloned brand voice ID) → audio file → **Podbean** (Podbean handles Spotify/Apple/iHeart syndication).
2. **Long-form video:** article → scene script → **JSON2Video** (Full HD, 16:9, built-in subtitles) → upload to **the client's own YouTube channel**.
3. **Short:** article highlight → **Creatomate** (9:16 template) → upload to **WRHQ YouTube channel**.
4. **Social post:** generate caption (Claude API) → post to **WRHQ Instagram + Facebook** (Meta Graph API).

**Acceptance:** One test article yields: a Podbean episode, a long-form video on the client channel, a short on WRHQ, and an IG+FB post — all traceable back to the source article.

> Note: long-form uses Inworld voice for narration consistency with the podcast (don't use JSON2Video's built-in TTS unless a fallback is needed). Confirm whether to pass Inworld audio into JSON2Video as the voice track, or use JSON2Video TTS for video + Inworld for podcast. Default: **Inworld for both**, passed as an audio asset.

### Phase 3 — Profile + Link Amplification
**Objective:** Feed Google Business Profile and the link ecosystem.

Steps:
1. **GBP posts — 3/week per client:** two **informational** posts derived from the week's articles + one **pure ad/promo** post. Use the GBP API. Schedule via Airtable cadence.
2. **Web 2.0 link wheel:** confirm the existing **RSS-fed** wheel still consumes the client's WP feed (it should, unchanged). Just verify continuity; no rebuild expected.
3. **White-label link building (tracking only):** this is an **external $99/mo service** (~15 niche auto-glass links, anchors like "windshield replacement San Diego"). n8n does **not** build these — it just logs/queues each client's link order status in Airtable for visibility. Keep these niche links regardless of any SnowSEO backlink feature (niche relevance ≠ SnowSEO's generic links).
4. **WRHQ directory listing:** ensure each client has a listing on WindshieldRepairHQ.com (manual/standard onboarding step; track completion in Airtable).

**Acceptance:** GBP shows 3 posts in a week for the test client; link wheel confirmed live; Airtable reflects link-build + WRHQ listing status.

### Phase 4 — Reporting & later add-ons (NOT NOW, stub only)
- Monthly client report assembled from SnowSEO rankings (via MCP) — Maps, organic, AI mentions, audit score, competitor delta.
- **Review engine** — deferred entirely; build separately later.

---

## 5. Component Specs & Conventions

### 5.1 Airtable — client control table (build/confirm first)
One row per client. Suggested fields:
- `Client Name`, `Status (active/paused)`
- `WordPress URL`, `WP REST auth ref` (application password / credential ID — store secret in n8n credentials, reference here, **never raw secrets in Airtable**)
- `SnowSEO Project ID`
- **NAP block:** `Business Name`, `Phone`, `Address`, `City`, `Service Areas`, `Website`
- `Target keywords` / primary cities
- `YouTube channel ref` (client), `GBP location ID`
- **Cadence:** publish days/times, GBP post schedule
- **Per-client toggles:** which back-half services are on (podcast / long-form / short / social / GBP)
- **Tracking:** `Link-build order status`, `WRHQ listing done?`

### 5.2 Inworld TTS (podcast + video narration)
- Model: TTS-2 (or current best); ~$10/M chars at scale.
- **Clone one AGMP brand voice once** (5–15s sample) → reuse that **voice ID** across all clients for catalog consistency.
- n8n: HTTP node → POST text + voice ID + model → receive audio (base64/URL) → pass to Podbean and/or JSON2Video.

### 5.3 Renderform Pro (branded featured image)
- One template with zones: background/base image, **PAA question** text, **NAP** fields (business name, phone, city, website).
- n8n passes variables per article (PAA question from SnowSEO article object; NAP from Airtable). Returns rendered image URL → set as WP featured image.

### 5.4 Video
- **JSON2Video:** long-form, Full HD 16:9, subtitles on, → client YouTube.
- **Creatomate:** shorts, 9:16 template, → WRHQ YouTube.

### 5.5 LLM steps
- Use **Claude API** (`claude-sonnet-4-6`) for any generative micro-steps n8n owns: meta descriptions, podcast/video script shaping, social captions. Keep prompts in dedicated nodes; don't inline-bury them.

### 5.6 Build conventions
- Isolated `[TEST]` workflow until proven; then duplicate per client **or** collapse into one master that iterates the Airtable table (decide after test client succeeds — lean toward master-iterates-Airtable for scale).
- Every external API node: timeout + retry + error branch that logs to Airtable/Slack.
- Idempotency: guard against double-processing the same article (dedupe on post ID/URL).
- Secrets only in n8n credentials store; Airtable holds references, not secrets.
- Name nodes descriptively; group by phase.

---

## 6. Data Contract — "Article Published" event (normalized)
Whatever the trigger source, normalize early to this object so all downstream nodes are source-agnostic:

```json
{
  "client_id": "airtable record id",
  "snowseo_project_id": "...",
  "wp_post_id": 1234,
  "wp_post_url": "https://client.com/windshield-replacement-portland",
  "title": "...",
  "target_keyword": "windshield replacement Portland",
  "paa_question": "How much does windshield replacement cost in Portland?",
  "body_html": "...",
  "publish_state": "draft|live"
}
```
Fields not available from the trigger get enriched via WordPress REST + Airtable lookups in the first nodes.

---

## 7. Credentials Inventory (n8n)
- SnowSEO API key (+ MCP connection)
- WordPress REST (per client — application passwords)
- Renderform Pro API key
- Inworld API key (+ cloned voice ID)
- JSON2Video API key
- Creatomate API key
- Podbean API/credentials
- YouTube (client channels + WRHQ channel) — OAuth
- Meta Graph API (WRHQ IG + FB)
- Google Business Profile API
- Claude API key
- Airtable API key

---

## 8. Open Questions (resolve in Phase 0, then update this doc)
1. SnowSEO publish output: schema / meta / internal links / featured image / slug / draft-vs-live? (§3.1)
2. Trigger: native webhook vs RSS, and payload contents? (§3.2)
3. SnowSEO API/MCP endpoint map + auth model? (§3.3)
4. Long-form narration: Inworld audio piped into JSON2Video, or JSON2Video TTS? (default: Inworld both)
5. Master-iterates-Airtable vs duplicate-per-client at scale? (decide post-test)

---

## 9. First Session Instruction to Claude Code
> Begin with **Phase 0**. Use the SnowSEO MCP to map the API, run one test article to a test WordPress site, and inspect exactly what SnowSEO writes into the post and how/whether it can notify n8n on publish. Fill in §3.1/§3.2/§3.3 Results and the §8 answers. Then propose the confirmed Phase 1 node list (only the post-processing steps SnowSEO does NOT already do) and wait for my go-ahead before building.
