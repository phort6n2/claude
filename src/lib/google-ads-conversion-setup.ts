import { CONVERSION_NAMES } from '@/lib/google-ads-conversion-names'

/**
 * How to create each of the four conversion actions, in order, in words.
 *
 * A LEAF MODULE for the same reason the names are one: `google-ads-
 * conventions.ts` holds the specs and the audit but reaches the Google Ads
 * API, so no client component can import it — and the screen that most needs
 * these instructions is a client component. The steps used to live inside
 * that module, which meant the Advertising tab could not show them, so the
 * card that tells an operator to go and create the action wrote its own
 * shorter version instead: "Create one in Google Ads (Goals → Conversions →
 * New → Import → Manual import) and it will appear here."
 *
 * THAT ABBREVIATION LOST THE ONLY THINGS THAT ARE HARD TO GUESS. It never
 * said what to NAME the action — and the name is what the audit further down
 * the same page checks against, so an operator following the card would
 * create something the page then reported as a stranger. It also dropped the
 * value setting, which is the difference between uploading a real job value
 * and uploading a constant, and the click window, which silently truncates
 * the attribution the whole feature exists to close.
 *
 * So the steps are data now, in one place, rendered on screen and consumed by
 * `CONVERSION_STANDARD`. The documented checklist in docs/GOOGLE-ADS-SETUP.md
 * is the long-form companion; this is what the app itself says.
 */
export const CONVERSION_SETUP: Record<
  'leadForm' | 'callFromAds' | 'websiteCall' | 'sale',
  string[]
> = {
  leadForm: [
    'Goals → Conversions → New conversion action → Website.',
    `Goal: Submit lead form. Name: ${CONVERSION_NAMES.leadForm}.`,
    'Count: One. Click-through window: 90 days. Attribution: data-driven.',
    'Keep it PRIMARY — this is one of the three actions Smart Bidding optimises to.',
  ],
  callFromAds: [
    'Goals → Conversions → New conversion action → Phone calls → Calls from ads using call assets.',
    `Name: ${CONVERSION_NAMES.callFromAds}.`,
    'Count a call after 10 seconds. Count: One. Click-through window: 30 days. Attribution: data-driven.',
    'Requires a call asset on the campaign — without one this action exists and never fires.',
  ],
  websiteCall: [
    'Goals → Conversions → New conversion action → Phone calls → Calls to a phone number on your website.',
    `Name: ${CONVERSION_NAMES.websiteCall}.`,
    'THE NUMBER MUST BE THE ONE THE SITE ACTUALLY SHOWS. If a tracking number is set in this app, the site shows that number — the conversion action has to name it, or Google swaps a number the page never displays and the action never fires.',
    'Count a call after 10 seconds. Count: One. Click-through window: 30 days. Attribution: data-driven.',
    "Paste the snippet's send_to into the app on the Advertising tab.",
  ],
  sale: [
    'In Google Ads: Goals → Conversions → New conversion action → Import → Manual import using API or uploads.',
    `Goal: Purchase. Name it exactly ${CONVERSION_NAMES.sale} — the audit below checks that name, and anything else is reported as a stranger.`,
    'Value: "Use different values for each conversion". This app sends the real job value, and a constant value here would throw it away.',
    'Count: One. Click-through window: 90 days (the uploader works to 85 against it). Attribution: data-driven.',
    'Leave the Purchase goal SECONDARY until this shop has the volume for value bidding — a shop doing twenty jobs a month cannot bid on revenue yet.',
    'Then come back here and pick it in "Upload booked jobs to". Nothing uploads until that is set.',
  ],
}

/** The name and the steps for the one action this app uploads to. */
export const SALE_SETUP = {
  name: CONVERSION_NAMES.sale,
  steps: CONVERSION_SETUP.sale,
}
