# AGMP Local SEO Engine — Phase 0 Status / Session Handoff

Companion to `AGMP-SEO-Engine-Build-Spec.md` (repo root). Read both at session start.

## Where we are
Working through **Phase 0 (Discovery)** of the build spec. Setting up the toolchain
before building the new `AGMP-Engine-v2 [TEST]` n8n workflow.

## Connection state (as of setup)
- **n8n MCP connector**: connected via claude.ai/code connectors. Exposes 3 tools only:
  `search_workflows`, `get_workflow_details`, `execute_workflow` → read + run only,
  **cannot create/edit** workflows.
- **n8n REST API**: enabled for create/edit. Requires env vars present in the session:
  - `N8N_BASE_URL=https://n8n.voxhit.com`
  - `N8N_API_KEY` (n8n public API key; set in the "Automated Content" cloud environment)
  - Auth header for REST calls: `X-N8N-API-KEY: $N8N_API_KEY`
  - ⚠️ Env vars only inject at **session start** — verify with `echo $N8N_BASE_URL`.
- **Network allowlist** (Custom) on the "Automated Content" environment includes:
  `n8n.voxhit.com`, `*.snowseo.com`, `api.renderform.io`, `api.json2video.com`,
  `api.creatomate.com`, `api.podbean.com`. Add each client's WordPress host in Phase 1.
- First REST action in a fresh session: smoke test `GET /api/v1/workflows?limit=1`
  (expect 200), then a create→delete to confirm authoring.

## Existing n8n workflows (7, all active) — relevant to this build
- **Merlino Magic – PAA Harvester (DataForSEO)** — front-of-funnel PAA discovery
- **Merlino Magic – Content Engine** — Claude blog generation + Canva
- **Auto Glass Website Research Blueprint** (+ v2) — SERP/competitor research (webhook)
- **Local SEO Site Builder** — webhook → SERP → Lovable prompt
- **Long Form Videos** — ElevenLabs → FFmpeg → S3 → YouTube (via Late)
- **Faceless Ideas Creator** — scheduled topic gen → Airtable

## Key Phase 0 finding so far
**No SnowSEO usage exists yet.** Current front-of-funnel is **DataForSEO + Claude**
(the "Merlino Magic" workflows). **DECIDED:** SnowSEO becomes the front-of-funnel for
the NEW engine. SnowSEO connection (MCP or REST) is still PENDING — `*.snowseo.com` is
allowlisted; awaiting API key / MCP URL from the user's SnowSEO account.

## ⚠️ Build constraints (do not violate)
- Build the new engine **isolated** as a brand-new workflow: `AGMP-Engine-v2 [TEST]`.
- Prove it on **ONE brand-new test client** first.
- **DO NOT touch, retire, disable, or migrate any existing workflow** (Merlino Magic
  PAA Harvester / Content Engine, Long Form Videos, etc.). They keep running for
  current clients.
- "SnowSEO replaces DataForSEO+Claude" applies to the **new engine only** — not a
  rip-out of the live workflows.
- Other clients migrate to the new engine **later, one at a time**, only after it's
  dialed in.

## Existing platform (this repo = `auto-glass-platform`, Next.js)
Already implements much of the spec's pipeline with different vendors:
Claude (articles), Nano Banana (images), AutoContent+Podbean (podcast),
Creatify (video), getlate.dev (social), WordPress, Google Business Profile.
Decide: build-new (spec's SnowSEO+n8n) vs. extend this existing platform.

## §3 Phase 0 Results — test client: Auto Glass Kings
- **SnowSEO MCP**: CONNECTED (team-scoped). Team = `Auto Glass Kings`
  (teamId `k1XobEQKchogJ5TvmV0UOX0KFWBXumaR`, website autoglasskings.com, Orange County CA,
  mobile auto glass + in-house ADAS + lifetime warranty). The one brand-new TEST CLIENT.
- **SnowSEO API key**: optional; user creating one to store as `SNOWSEO_API_KEY` for when
  n8n calls SnowSEO directly (e.g. rankings for reports). Not needed for MCP-driven work.
- **§3.3 capability map**: broad MCP surface — teams, topic clusters, article
  create/generate/publish/schedule, AI-visibility, rank tracking, GA/GSC/PostHog analytics,
  integrations, activity_feed, set_article_public_feed (public article feed). Mostly answered.
- **Integrations on the team (all connected 2026-06-28):**
  - WordPress — connected, canPublish + canSchedule, BUT `wpPluginConnected: false`
    (SnowSEO WP plugin not installed → publishing via plain WP REST). siteUrl autoglasskings.com.
  - Google Analytics — property 541413302. Google Search Console — autoglasskings.com.
- **Articles**: 0 (nothing generated/published yet → §3.1 needs a real test article to answer).
- **§3.1 (what SnowSEO writes) — ANSWERED via test article** (slug
  `auto-glass-replacement-in-orange-county-cost-process-and-what-to-expect`, articleId
  8c4fee38..., 100 credits, ~1165 words, published to WP as DRAFT postId 1931):
  | Item | SnowSEO does it? | n8n needed? |
  |---|---|---|
  | FAQPage JSON-LD | ✅ generates it (jsonLd @graph: Article+Organization+FAQPage, 8 Q&A) | only if it doesn't reach WP head w/o plugin — VERIFY |
  | Meta title + description | ✅ good (metaTitle ~55c, metaDesc ~150c, + OG/Twitter) | only if it doesn't reach WP SEO fields w/o plugin — VERIFY |
  | Internal links (service/city) | ❌ body has only EXTERNAL citations + 1 homepage CTA link | YES (or SnowSEO generate_internal_links once corpus grows) |
  | Featured image | ✅ but GENERIC AI hero | YES — override w/ Renderform branded PAA+NAP card |
  | Slug | ✅ clean, title-derived, no -2 | ok (conflict behavior untested) |
  | Draft vs live | ✅ draft supported | n8n finalizes → flip live |
  | LocalBusiness schema (NAP) | ❌ none (only Article+Org+FAQPage; no phone/address/geo) | YES — inject LocalBusiness w/ NAP |
  - SnowSEO ALSO auto-adds: TL;DR, Table of Contents, in-body AI images, a relevant YouTube
    embed, external authority citations (NHTSA/FMVSS/AGSC/CA SB-988), 8 PAA prompts, keywords.
  - Publisher logo in schema is just a google favicon (low quality) — improvable.
  - PAA question for Renderform/data contract (primary prompt):
    "What is the typical cost of auto glass replacement in Orange County?"
  - ✅ VERIFIED against LIVE rendered HTML (post 1931 published live, autoglasskings.com
    allowlisted). The site runs **Rank Math SEO**, which already covers most on-page items:
    | Item | In live <head>? | Source | n8n node? |
    |---|---|---|---|
    | Meta title+desc | ✅ (matches SnowSEO) | SnowSEO→Rank Math | NO |
    | Article/BlogPosting schema | ✅ | Rank Math auto | NO |
    | LocalBusiness + NAP schema | ✅ rich, site-wide | Rank Math Local | NO |
    | FAQPage schema | ❌ MISSING (SnowSEO's didn't transfer) | — | YES |
    | Featured image | ✅ uploaded (SnowSEO's) | SnowSEO | NO — user keeps SnowSEO's image |
    | In-content internal links | ❌ body has none; nav/footer cover structure | theme | OPTIONAL |
    | Slug | ✅ clean | SnowSEO | NO |
  - **NAP obtained free from site schema:** Auto Glass Kings, +1-949-775-3791,
    5842 W McFadden Ave Suite P, Huntington Beach, CA 92649; geo 33.736849/-118.027157;
    priceRange $$-$$$$; ratingValue 5.0. (Use for Renderform card + Airtable.)
  - Note: SnowSEO writes Rank Math meta fields even WITHOUT its WP plugin (meta transferred).
    FAQ schema needs a Rank Math FAQ block / explicit JSON-LD — didn't transfer via plain publish.
  - Minor: duplicate og:title/og:description (theme + Rank Math); in-body images hotlink to
    assets.snowseo.com (not uploaded). Cleanup items, not blockers.

## CONFIRMED Phase 1 on-page node list (post-verification)
1. **FAQPage schema** — inject (Rank Math FAQ block or JSON-LD) from SnowSEO's 8 PAA Q&As.
   *(the one real on-page gap)*
2. (Optional) in-content internal links to service/city pages — structural nav already strong.
DECISION: **Renderform DROPPED** — user keeps SnowSEO's featured image. No Renderform
credential/component; remove api.renderform.io from allowlist eventually (harmless if left).
Meta, Article schema, LocalBusiness/NAP, featured image = ALREADY good → no nodes.
Trigger seam = SnowSEO `publish_article` "webhook" provider → n8n Webhook node.
NET: Phase 1 on-page completion is effectively ONE meaningful node (FAQ schema) + the seam.
- **§3.2 (trigger)**: NATIVE WEBHOOK CONFIRMED — `publish_article` supports a `"webhook"`
  provider (alongside wordpress/shopify/webflow/ghost/framer). So the seam = configure a
  SnowSEO "webhook" publish target pointing at an n8n Webhook node; SnowSEO POSTs the article
  on publish. Preferred over RSS/poll. (Other seam options remain as fallback: WP RSS,
  public article feed, poll cms_articles.)
- **§3.1 (draft-vs-live) ANSWERED**: `publish_article` takes `status: "draft" | "publish"`,
  so SnowSEO CAN publish as draft → n8n finalizes → flip live. Draft-then-finalize supported.
- **OPEN DECISION (paused here)**: install SnowSEO WP plugin before the test (recommended —
  production setup, likely removes schema+meta n8n nodes) vs. test now on plain REST.
- **Credit-consuming SnowSEO actions require explicit user permission before each call.**
- **DECISION: test WITHOUT the SnowSEO WP plugin** — user is already connected to WP and
  can't add the plugin; measure plain-REST publishing, revisit plugin later if needed.
- **Topic clusters (5, from onboarding authority map):** Auto Glass Repair / auto glass
  replacement / mobile windshield repair / windshield repair / Windshield Replacement
  (each 10 keywords + 10 prompts; 50 kw total). AI-visibility baseline avg 6.8
  ("auto glass replacement" cluster already 34). 4 prompts tracked, initial audit done.
- **Content calendar:** user created an automated content calendar in SnowSEO, but
  `cms_articles` = 0 (no scheduled/generated/published articles surfaced via MCP yet).
  Calendar schedule config is NOT exposed as an MCP endpoint; only resulting articles are.
  → The first calendar-generated article is the §3.2 "Article Published" seam + the §3.1
  inspection opportunity. Watch `cms_articles` (status scheduled/draft/published).

## Next steps
1. ~~Run n8n REST smoke test~~ ✅ DONE — REST create/delete confirmed working.
2. ~~Resolve SnowSEO-vs-DataForSEO~~ ✅ DONE — SnowSEO replaces, for the new engine only.
3. Connect SnowSEO (MCP or REST) — awaiting key/endpoint from user's SnowSEO account.
   Determine §3.2 trigger (native publish webhook vs WP RSS) + §3.1 what it writes.
4. Inspect existing Merlino workflows (read-only) to reuse Airtable/seam conventions.
5. Build §5.1 Airtable client control table; add the one brand-new test client.
6. Build isolated `AGMP-Engine-v2 [TEST]` workflow (Phase 1) for the test client.
