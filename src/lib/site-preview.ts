import { auth } from '@/lib/auth'

/**
 * Who may see a site that is not live.
 *
 * ACTIVE renders for everyone. Anything else — ONBOARDING, PAUSED — renders
 * only for a signed-in admin, because the operator has to SEE a site to
 * build it, and the old workaround was flipping the client ACTIVE "just to
 * look", which is exactly how a half-built site goes live. The public keeps
 * getting the unavailable page, and crawlers carry no session so nothing
 * un-live can be indexed.
 *
 * The admin session cookie lives on the app host, so previewing works at
 * glassleads.app/sites/{slug} — the subdomain will still show unavailable,
 * since the browser does not send the admin cookie there.
 */
export async function canViewSite(status: string): Promise<boolean> {
  if (status === 'ACTIVE') return true
  const session = await auth().catch(() => null)
  return !!session?.user
}

/** True when this render is an admin looking at a not-live site. */
export async function isPreview(status: string): Promise<boolean> {
  if (status === 'ACTIVE') return false
  return canViewSite(status)
}
