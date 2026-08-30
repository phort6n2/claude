import { auth } from '@/lib/auth'

/**
 * Which client statuses serve a public site.
 *
 * ONBOARDING is live ON PURPOSE: the owner's call was that a site being
 * built should be visible while it is built — sections strip themselves
 * when empty, so a half-filled site is a leaner site, never a broken one,
 * and hiding it just meant nobody could look. ONBOARDING remains the
 * admin-side label for "setup not finished"; it no longer hides the site.
 *
 * PAUSED is the kill switch and stays one — that is a decision to take a
 * site down, not a stage of building it.
 */
export const LIVE_STATUSES = ['ACTIVE', 'ONBOARDING'] as const

export function siteIsLive(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status)
}

/**
 * Who may see this site at all. Live statuses render for everyone; a PAUSED
 * site renders only for a signed-in admin, under the preview banner.
 *
 * The live check comes first so public renders never touch auth() — these
 * pages are ISR-cached, and a cookies() read would make every request
 * dynamic.
 */
export async function canViewSite(status: string): Promise<boolean> {
  if (siteIsLive(status)) return true
  const session = await auth().catch(() => null)
  return !!session?.user
}

/** True when this render is an admin looking at a site the public cannot see. */
export async function isPreview(status: string): Promise<boolean> {
  if (siteIsLive(status)) return false
  return canViewSite(status)
}
