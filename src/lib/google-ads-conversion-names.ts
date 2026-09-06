/**
 * The exact names of the four conversion actions this platform owns.
 *
 * A LEAF MODULE ON PURPOSE — it imports nothing. `google-ads-conventions.ts`
 * holds the full specs and the audit, but it reaches the Google Ads API, so a
 * client component cannot import it. The Advertising tab needs both halves on
 * one screen: the instructions at the top tell an operator what to name each
 * action as they create it, and the audit further down the same page checks
 * the live account against these names. Typing them out in the instructions
 * is how those two come to disagree — and a name typed from memory is the one
 * failure the whole convention exists to prevent, because the audit then
 * reports the action it just told somebody to create as a stranger.
 */

/** Every action this platform owns starts with this. */
export const CONVERSION_PREFIX = 'AGMP'

export const CONVERSION_NAMES = {
  leadForm: `${CONVERSION_PREFIX} Lead Form`,
  callFromAds: `${CONVERSION_PREFIX} Call From Ads`,
  websiteCall: `${CONVERSION_PREFIX} Website Call`,
  sale: `${CONVERSION_PREFIX} Sale`,
} as const
