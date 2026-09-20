/**
 * WHERE A FINDING GETS FIXED, and what "clearing" it honestly means.
 *
 * A LEAF ON PURPOSE — no prisma, no network — because the health board is a
 * client component and the modules that define these checks reach the
 * database and the Google Ads API. Same split as
 * `google-ads-conversion-setup.ts` and `directory-signal-types.ts`, and the
 * alternative is two copies of the mapping that send an operator to two
 * different tabs for one finding.
 *
 * THERE IS NO "MARK IT FIXED", AND THERE MUST NOT BE. A finding auto-RESOLVES
 * when a sweep stops seeing the condition, and reopens the same row if it
 * comes back. So a button that set a row to RESOLVED while the condition was
 * still true would clear the board tonight and file the identical finding
 * tomorrow morning — teaching the operator that the queue lies, which is
 * exactly how a queue stops being read. The two real actions are:
 *
 *   FIX      — go to the screen that changes the underlying fact. The sweep
 *              then stops seeing it and resolves the row by itself.
 *   DISMISS  — "known, stop telling me". A real stored state, honoured until
 *              the condition resolves, and NOT a claim that anything is fixed.
 *
 * Read-only for the ad account is still the rule: the planned approve→execute
 * layer has to carry the exact mutation payload on the finding and replay it,
 * so nothing here pretends to change a campaign.
 */

/** Which screen owns the underlying fact, by check family. */
export type FixSurface = 'site' | 'calls' | 'advertising' | 'business' | 'queue'

interface Surface {
  /** Tab segment under /admin/clients/{id}, or null for the findings queue. */
  tab: string | null
  /** The button's words. Names the screen, so a click is never a surprise. */
  label: string
}

const SURFACES: Record<FixSurface, Surface> = {
  site: { tab: 'site', label: 'Open the Website tab' },
  calls: { tab: 'leads-setup', label: 'Open call tracking' },
  advertising: { tab: 'advertising', label: 'Open the Advertising tab' },
  business: { tab: 'business', label: 'Open the Business tab' },
  // The honest default. Every finding is readable here with its full
  // evidence, so an unmapped check lands somewhere real instead of on a
  // confidently wrong tab — which would send somebody hunting a control that
  // is not on that screen.
  queue: { tab: null, label: 'Read the full finding' },
}

/**
 * Checks whose fix is NOT on the Advertising tab.
 *
 * Deliberately a list of exceptions over a default rather than an exhaustive
 * map: the great majority of checks are Google Ads ones, and a map that has
 * to be extended for every new check is a map that silently misses the next
 * one. A check added here without an entry gets Advertising, which is right
 * for an ads check and merely unhelpful for anything else — never wrong in a
 * way that costs an action.
 */
const EXCEPTIONS: Record<string, FixSurface> = {
  // Editorial copy on the hosted site.
  'rogue-phone-number': 'site',
  'premises-claim-in-copy': 'site',
  // Tracking numbers, forwarding and recording.
  'calls-not-connecting': 'calls',
  'calls-not-recorded': 'calls',
  // The number the SITE shows: which tracking number is flagged for it, and
  // whether the rendered pages agree. Both are settled on the same card.
  'tracking-number-not-shown': 'calls',
  'tracking-number-not-used-on-site': 'calls',
  /* The schema one goes to BUSINESS, not to call tracking, and the reason is
     the likeliest cause rather than the subject. The markup is built from the
     real client before the swap, so a tracking number reaching it almost
     always means `Client.phone` itself was set to the tracking number — which
     is a field on the Business tab. The detail carries the other possibility. */
  'tracking-number-in-schema': 'business',
}

export interface FindingAction {
  /** Where the underlying fact is changed. */
  href: string
  label: string
  /**
   * Why this screen. Shown under the button, because a finding about a
   * campaign that sends you to the Website tab needs to explain itself.
   */
  hint: string
}

export function fixActionFor(check: string, clientId: string): FindingAction {
  const surface = SURFACES[EXCEPTIONS[check] ?? 'advertising']
  if (!surface.tab) {
    return {
      href: '/admin/ads-findings',
      label: surface.label,
      hint: 'The queue carries the evidence this was filed on.',
    }
  }
  return {
    href: `/admin/clients/${clientId}/${surface.tab}`,
    label: surface.label,
    hint: HINTS[EXCEPTIONS[check] ?? 'advertising'],
  }
}

const HINTS: Record<FixSurface, string> = {
  site: 'The wording lives in the site content, not in the template.',
  calls: 'Forwarding, recording and the tracking numbers themselves.',
  advertising: 'Conversion actions and the ad account link. Campaign changes are made in Google Ads.',
  business: 'The shop’s own details.',
  queue: 'The queue carries the evidence this was filed on.',
}

/**
 * What the Dismiss button promises, in one sentence.
 *
 * Kept here rather than typed into the component so the board and the
 * findings page cannot describe the same button differently — the operator
 * would reasonably believe whichever they read last.
 */
export const DISMISS_MEANING =
  'Dismiss means “known, stop telling me”. It does not fix anything, and the sweep reopens it if the condition clears and comes back.'
