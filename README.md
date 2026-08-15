# glassleads.app

Lead capture, call coaching and hosted websites for independent auto glass
shops.

A shop gets a hosted site on `{subdomain}.glassleads.app` built from their own
photos, warranty and Google reviews; a quote form on it (and embeddable
anywhere else they already have a site); instant lead alerts by email and SMS
with one-tap call, text-back and "did this one book?" buttons; Twilio tracking
numbers whose calls are recorded and scored for coaching; and attribution that
follows a job from the ad click all the way back to Google Ads as an offline
conversion once it is marked booked.

Pricing is $297/mo self-serve, $497/mo with done-for-you ad management.

## Stack

Next.js 16 (App Router) · React 19 · Prisma 6 · Postgres · Tailwind v4 ·
NextAuth · Vercel. Integrations: Resend, Twilio, Google Ads API, Google Places
/ Business Profile, Vercel Blob, Anthropic API, Cloudflare (subdomains).

## Getting started

```bash
npm install
cp .env.example .env      # fill in credentials
npx prisma generate
npm run dev
```

Schema changes are **not** applied with `prisma migrate`. They ship as
idempotent SQL in `src/lib/schema-bootstrap.ts`, run at boot and by
`POST /api/admin/setup-db`. See `CLAUDE.md` before touching the schema — the
pooled database role cannot execute DDL, which has caused a silent production
failure that passed locally.

## Layout

```
src/app/sites/[slug]/    hosted client websites (home, services, locations, legal)
src/app/admin/           admin dashboard
src/app/portal/          client self-service portal
src/app/api/             ~80 routes: leads, webhooks, clients, cron, integrations
src/components/sites/    the hosted-site template (shared.tsx, site-body.tsx)
src/lib/                 domain logic — leads, notifications, calls, import, ads
prisma/schema.prisma     data model
```

## Documentation

- **`CLAUDE.md`** — how the app works, the content and security rules, and the
  operational gotchas. Read this first; it is loaded automatically by Claude
  Code sessions in this repo.
- **`OPEN-ITEMS.md`** — live punch list, open decisions, ranked backlog.
- **`docs/HANDOFF.md`** — longer narrative of the lead pipeline (2026-08-09).

## Licence

Proprietary.
