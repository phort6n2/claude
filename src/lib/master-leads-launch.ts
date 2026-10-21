/**
 * Master Leads OPENS ON CAMPAIGNS, and a lead alert still opens on the leads.
 *
 * The app lives on the operator's home screen, and its icon (and the admin
 * sidebar link, and every lead notification) all point at `/master-leads` —
 * the leads list. Moving the list to another address would break each of
 * those; rewriting the address to show the campaign table would send a lead
 * alert to a page with no lead on it. So the address stays the leads list,
 * and the FIRST screen of a launch is redirected: a bare `/master-leads`
 * with nothing marked in this session goes to Campaigns once, and every later
 * visit in the same session (the back arrow, the Dashboard's back link) stays.
 *
 * `sessionStorage` is the launch clock on purpose: a home-screen app that is
 * closed and reopened starts with it empty, while moving between screens
 * keeps it. Where it is unavailable the leads list simply shows, which is how
 * the app behaved before this existed — never a loop.
 *
 * A notification carries `?from=alert` (`push-notifications.ts`), and ANY
 * query string means somebody asked for the list on purpose.
 */
export const LAUNCH_KEY = 'master-leads-launched'
export const LEADS_FROM_ALERT_URL = '/master-leads?from=alert'

export function markLaunched(): void {
  try {
    sessionStorage.setItem(LAUNCH_KEY, '1')
  } catch {
    /* private mode or blocked storage */
  }
}

/** True exactly once per launch, on a bare leads-list address. */
export function shouldOpenOnCampaigns(search: string): boolean {
  if (search && search !== '?') return false
  try {
    if (sessionStorage.getItem(LAUNCH_KEY)) return false
  } catch {
    return false
  }
  return true
}
