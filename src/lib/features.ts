/**
 * Feature flags for the platform re-scope.
 *
 * The app is being narrowed from a content-automation platform to a
 * leads + Google Ads optimization tool. All content-creation functionality
 * (blog/podcast/video/social/press-release/PAA/GBP posting, WordPress
 * publishing, DataForSEO, etc.) is gated behind CONTENT_ENABLED.
 *
 * Default is OFF: content is disabled unless `CONTENT_ENABLED=true` is set in
 * the environment. This makes the disable reversible with a single env var and
 * leaves all code/data in place for now (physical removal is a later pass).
 *
 * The gating itself lives in `src/middleware.ts`, which uses the matchers below
 * to short-circuit content API routes (410) and redirect content admin pages to
 * the dashboard. This module must stay Edge-runtime safe: pure constants and
 * regex only, no Node APIs.
 */

export const CONTENT_ENABLED = process.env.CONTENT_ENABLED === 'true'

/**
 * Content-only API path prefixes. A request matches if its pathname equals the
 * prefix or starts with `prefix + '/'`. These were classified as content-only
 * (no leads/ads/portal/call-analysis dependency) by the dependency map.
 */
const CONTENT_API_PREFIXES = [
  '/api/content',
  '/api/creatify',
  '/api/setup-creatify-fields',
  '/api/wordpress',
  '/api/gbp',
  '/api/scheduling',
  '/api/reports/daily-content',
  '/api/settings/standard-paas',
  '/api/settings/dataforseo',
  '/api/settings/wrhq',
  '/api/webhooks/late',
  '/api/integrations/podbean',
  '/api/admin/content',
  '/api/admin/health-check',
  '/api/admin/monitoring',
  // Content cron handlers (also removed from vercel.json so they never fire).
  '/api/cron/generate-content',
  '/api/cron/hourly-publish',
  '/api/cron/daily-publish',
  '/api/cron/auto-schedule-weekly',
  '/api/cron/gbp-posts',
  '/api/cron/generate-press-releases',
  '/api/cron/check-social-published',
  '/api/cron/recover-stuck-content',
]

/**
 * Content leaf routes that live UNDER the shared `/api/clients/[id]/**`
 * namespace. The bare `/api/clients/[id]` route plus `google-ads`, `locations`,
 * and `users*` are KEPT, so we must match only these specific leaves — never the
 * whole client subtree.
 */
const CONTENT_CLIENT_LEAVES = [
  'auto-schedule',
  'clear-schedule',
  'generate-calendar',
  'reassign-slot',
  'fetch-paas',
  'paas',
  'gbp-config',
  'gbp-posts',
  'gbp-photos',
]

/**
 * Content admin page prefixes (redirected to the dashboard when disabled).
 */
const CONTENT_PAGE_PREFIXES = [
  '/admin/content',
  '/admin/gbp',
  '/admin/press-releases',
  '/admin/paa-library',
  '/admin/monitoring',
  '/admin/settings/standard-paas',
  '/admin/settings/wrhq',
]

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

/** True if `pathname` is a content-only API route that should return 410. */
export function isContentApiPath(pathname: string): boolean {
  if (matchesPrefix(pathname, CONTENT_API_PREFIXES)) return true

  // Split namespace: /api/clients/{id}/{leaf...}
  const m = pathname.match(/^\/api\/clients\/[^/]+\/(.+)$/)
  if (m) {
    const rest = m[1]
    return CONTENT_CLIENT_LEAVES.some(
      (leaf) => rest === leaf || rest.startsWith(leaf + '/')
    )
  }
  return false
}

/** True if `pathname` is a content admin page that should redirect away. */
export function isContentPagePath(pathname: string): boolean {
  if (matchesPrefix(pathname, CONTENT_PAGE_PREFIXES)) return true

  // Per-client content sub-pages: /admin/clients/{id}/gbp, /admin/clients/{id}/calendar
  return /^\/admin\/clients\/[^/]+\/(gbp|calendar)(\/|$)/.test(pathname)
}
