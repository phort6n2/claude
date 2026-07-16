# Auto Glass Directory (public lead-magnet)

A public-facing directory of auto glass / windshield shops that lives inside this
app under **`/directory`**. It exists to give shops a **free listing** and to
generate warm leads for the paid **SEO & Google Ads** service.

It is intentionally **decoupled from the Prisma/Postgres command center** — it
reads from a static JSON seed file, so it builds, previews, and deploys with
**zero database setup**.

## Routes

| Route | Type | Purpose |
|-------|------|---------|
| `/directory` | Static | Home: hero search, services, featured shops, cities, owner CTA |
| `/directory/search` | Dynamic | Keyword + state + service + mobile filtering |
| `/directory/browse` | Static | Browse all states → cities |
| `/directory/[state]` | SSG | State landing page (e.g. `/directory/tx`) |
| `/directory/[state]/[city]` | SSG | **City money page** (e.g. `/directory/tx/austin`) — the primary local-SEO target |
| `/directory/shop/[slug]` | SSG | Shop detail with `AutoRepair` JSON-LD schema |
| `/directory/claim` | Dynamic | Free-listing / claim form (lead capture) |
| `/directory/for-shops` | Static | SEO & ads upsell landing page |
| `/directory/sitemap.xml` | Static | Auto-generated sitemap of every page above |
| `/directory/robots.txt` | Static | Crawl rules; points at the sitemap (route handler, since Next only treats `robots.ts` as special at the app root) |
| `POST /api/directory/claim` | API | Receives + validates listing/claim submissions |

### Supporting modules

- `src/lib/directory/seo.ts` — reusable schema.org JSON-LD builders (WebSite +
  SearchAction, Organization, BreadcrumbList, AutoRepair, ItemList, FAQPage) and
  `absoluteUrl()`.
- `src/lib/directory/faqs.ts` — curated general + per-city FAQ content, used for
  both visible on-page copy and FAQPage markup.
- `src/lib/directory/content.ts` — centralized marketing copy (hero, for-shops,
  claim, owner CTA, city intro/advice) so pages don't hardcode strings.
- `src/components/directory/` — shared UI: `ShopCard`, `Header`, `Footer`,
  `StarRating`, `HeroSearch`, `SearchFilters`, `ClaimForm`, plus reusable
  `Badge`, `Section`, and `CTASection`.

## Data

- **Seed file:** `src/data/directory-shops.json`
- **Types:** `src/lib/directory/types.ts`
- **Access layer:** `src/lib/directory/data.ts` — every page reads through these
  helpers, so migrating to a database means reimplementing only this file.

To add or edit a shop, edit the JSON and redeploy. Slugs must be unique.

## Going to production — the two things to wire up

1. **`NEXT_PUBLIC_SITE_URL`** — set to your real domain (e.g.
   `https://www.autoglassdirectory.com`) so sitemap/canonical URLs are absolute.
2. **Claim submissions sink** — `src/app/api/directory/claim/route.ts` currently
   validates and `console.log`s each lead (Vercel's filesystem is read-only).
   Point it at a durable sink: a `DirectoryLead` Postgres table, a transactional
   email, or a CRM/webhook. The payload shape is already stable.

## Seeding for real (important)

An empty directory ranks for nothing. Before outreach, populate the JSON with
real shops (public listings / purchased data) so city pages already look alive
and can rank. Featured + verified flags control ordering and are a natural paid
upsell slot.

## Relationship to the command center

The existing app (`/admin`, `/portal`, `/master-leads`) is the internal
platform. The directory is separate and public. It can stay on the same domain
under `/directory`, be promoted to the site root, or be hosted on its own domain
later — nothing about the directory depends on the rest of the app.
