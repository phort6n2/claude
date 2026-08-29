/**
 * The origin an OUTSIDE SERVICE should call us on.
 *
 * THE OUTAGE THIS EXISTS FOR. Every rank campaign was registered with Local
 * Dominator at `https://agmp-paa-pro.vercel.app/...`, because the origin was
 * resolved from `VERCEL_PROJECT_PRODUCTION_URL`. That host is a Vercel
 * deployment URL, and this project has Vercel Authentication switched on with
 * `deploymentType: "all_except_custom_domains"` — so every POST from their
 * scheduler met an SSO challenge instead of the route, and a week of scans
 * was lost without a single error anywhere on our side. The scans ran, their
 * map updated, our series stopped.
 *
 * The custom domain is exempt from that protection. So a webhook URL must be
 * built on it, and the Vercel host must never be used as a fallback for one:
 * an address that works in a browser you are logged into is not the same as
 * an address a machine can reach.
 *
 * `APP_URL` first so it can be overridden per environment, then the public
 * one, then the known production domain — never the deployment URL, and never
 * the origin of whatever request happens to be running, which for a cron is
 * whichever host the scheduler used.
 */
export function appOrigin(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  const trimmed = configured.trim().replace(/\/$/, '')
  if (trimmed && !/\.vercel\.app$/i.test(new URL(trimmed).hostname)) return trimmed
  return 'https://glassleads.app'
}

/**
 * True when a URL points at a host an outside service cannot reach because
 * of deployment protection. Used to explain a stale registration rather than
 * only reporting that it differs.
 */
export function isProtectedHost(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return /\.vercel\.app$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}
