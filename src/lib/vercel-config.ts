/**
 * Which Vercel project the client sites are attached to.
 *
 * Defined once. It was previously declared identically in custom-domains.ts
 * and site-domains.ts, and then a third time — with a stricter rule — in the
 * integration status check, which consequently reported the domains API as
 * "not configured" for a feature that works. Two copies of a constant is a
 * maintenance smell; three copies where one disagrees is a bug that tells you
 * something is broken when it isn't.
 *
 * The environment variables are OVERRIDES, not requirements. The defaults are
 * this project, which is the right answer in every environment that matters,
 * so provisioning needs only VERCEL_TOKEN to work.
 *
 * These two IDs are identifiers rather than credentials — they name a project
 * and a team, and grant nothing on their own. VERCEL_TOKEN is the secret, and
 * it is never hardcoded.
 */

export const VERCEL_PROJECT_ID =
  process.env.VERCEL_SITES_PROJECT_ID || 'prj_ippcpQAys3gDB9FMk11ufiy3B0Vf'

export const VERCEL_TEAM_ID =
  process.env.VERCEL_SITES_TEAM_ID || 'team_i0q8dHvyszgaaysrJ4pkWoHL'

/** The only thing that actually has to be configured. */
export function vercelToken(): string | null {
  return process.env.VERCEL_TOKEN || null
}
