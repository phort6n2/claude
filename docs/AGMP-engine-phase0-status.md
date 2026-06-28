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
**No SnowSEO usage exists yet.** Current front-of-funnel is **DataForSEO + Claude**,
not SnowSEO. Open question for the user: is SnowSEO **replacing** DataForSEO/Claude, or
sitting **alongside** them? This materially changes the §3.1/§3.2 discovery.

## Existing platform (this repo = `auto-glass-platform`, Next.js)
Already implements much of the spec's pipeline with different vendors:
Claude (articles), Nano Banana (images), AutoContent+Podbean (podcast),
Creatify (video), getlate.dev (social), WordPress, Google Business Profile.
Decide: build-new (spec's SnowSEO+n8n) vs. extend this existing platform.

## Next steps
1. New session with REST env vars → run n8n REST smoke test (create→delete).
2. Resolve the SnowSEO-vs-DataForSEO question with the user.
3. Inspect the PAA Harvester + Content Engine workflow details to reuse conventions.
4. Build §5.1 Airtable client control table.
