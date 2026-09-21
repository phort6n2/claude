/**
 * Parse the snippets Google Ads hands you, so nobody has to pick them apart
 * by hand.
 *
 * Asking an operator for a "conversion ID" and a "label" separately means
 * asking them to split `AW-123456789/AbC-D_efG` at the slash and know which
 * half is which. Google gives you a block of JavaScript; the app should take
 * the block. Everything here is tolerant of the formatting differences
 * between Google's own variants — single vs double quotes, with or without
 * the <script> wrapper, one line or many.
 */

/** `AW-123456789/AbC-D_efG12` — the id and label together, as Google writes it. */
const SEND_TO = /AW-\d+\/[A-Za-z0-9_-]+/
/** The bare account tag, when no full pair is present. */
const BARE_ID = /AW-\d+/

export interface LeadSnippet {
  conversionId: string
  leadConversionLabel: string
  /** Conversion value, when the action was set up with one. */
  value: number | null
  currency: string | null
}

export interface CallSnippet {
  conversionId: string
  callConversionLabel: string
  /** The number Google swaps on the page. */
  phoneNumber: string
}

export interface ParseResult<T> {
  ok: boolean
  value?: T
  error?: string
}

function splitSendTo(sendTo: string) {
  const [conversionId, label] = sendTo.split('/')
  return { conversionId, label }
}

/**
 * The event snippet for a form-lead conversion action.
 *
 * Google's shape:
 *   gtag('event', 'conversion', {'send_to': 'AW-123/AbC', 'value': 1.0,
 *                                'currency': 'USD'});
 */
export function parseLeadSnippet(input: string): ParseResult<LeadSnippet> {
  const text = (input || '').trim()
  if (!text) return { ok: false, error: 'Paste the event snippet from Google Ads.' }

  const sendTo = text.match(SEND_TO)?.[0]
  if (!sendTo) {
    // A very common mis-paste: the Google tag (the loader) instead of the
    // event snippet. It carries the account but no conversion action, so say
    // exactly that rather than "invalid".
    if (BARE_ID.test(text)) {
      return {
        ok: false,
        error:
          'That looks like the Google tag (the site-wide loader), not the event snippet. Go back to the conversion action and copy the block containing "send_to".',
      }
    }
    return {
      ok: false,
      error: 'No conversion found in that snippet — it should contain something like AW-123456789/AbCdEf.',
    }
  }

  const { conversionId, label } = splitSendTo(sendTo)
  const valueMatch = text.match(/['"]?value['"]?\s*:\s*([0-9]+(?:\.[0-9]+)?)/)
  const currencyMatch = text.match(/['"]?currency['"]?\s*:\s*['"]([A-Za-z]{3})['"]/)

  return {
    ok: true,
    value: {
      conversionId,
      leadConversionLabel: label,
      value: valueMatch ? Number(valueMatch[1]) : null,
      currency: currencyMatch ? currencyMatch[1].toUpperCase() : null,
    },
  }
}

/**
 * The snippet for a "calls from a website" conversion action.
 *
 * Google's shape:
 *   gtag('config', 'AW-123/AbC', {'phone_conversion_number': '(503) 656-3500'});
 *
 * The number matters as much as the label: it is the number Google looks for
 * on the page in order to swap it for a forwarding number, so it has to be
 * carried through exactly as pasted.
 */
export function parseCallSnippet(input: string): ParseResult<CallSnippet> {
  const text = (input || '').trim()
  if (!text) return { ok: false, error: 'Paste the snippet from Google Ads.' }

  const sendTo = text.match(SEND_TO)?.[0]
  if (!sendTo) {
    return {
      ok: false,
      error:
        'No conversion found in that snippet — a calls-from-a-website snippet contains something like AW-123456789/AbCdEf.',
    }
  }

  const phoneMatch = text.match(/['"]?phone_conversion_number['"]?\s*:\s*['"]([^'"]+)['"]/)
  if (!phoneMatch) {
    return {
      ok: false,
      error:
        'That snippet has no phone_conversion_number. Make sure the conversion action is "Phone calls → Calls from a website", not a website conversion.',
    }
  }

  const { conversionId, label } = splitSendTo(sendTo)
  return {
    ok: true,
    value: { conversionId, callConversionLabel: label, phoneNumber: phoneMatch[1].trim() },
  }
}

/**
 * Is this save MOVING the shop to a different Google Ads account?
 *
 * One account has two names in this app — the customer id picked from a
 * dropdown, and the `AW-…` that arrives inside a pasted conversion snippet —
 * and nothing made them agree. A shop whose Ads account is replaced (a
 * suspension, a billing mess, an agency handover) had the new customer id
 * saved while both conversion snippets stayed pointed at the OLD account. The
 * site then reported every form lead and website call to an account nobody
 * reads, and NOTHING errored: the tag loaded, the page was fine, and the
 * audit, the landing-page check, the offline upload and the monthly report's
 * cost per conversion all interrogated the new account and found a tidy,
 * correct, empty setup.
 *
 * A move CLEARS the stored conversions, because they are not stale, they are
 * wrong — a tag crediting an abandoned account is worse than no tag, since it
 * looks configured. The operator then pastes the new pair into empty boxes.
 *
 * NARROW ON PURPOSE. Three neighbouring cases look identical and must not
 * clear, which is why this is a named function with a test rather than a
 * condition inline in the route:
 *
 * - FIRST selection (nothing → an account). Pasting the snippets and then
 *   picking the account is the normal setup order; clearing there wipes what
 *   was just saved.
 * - UNSELECTING (an account → nothing). The customer id exists to interrogate
 *   the account, not to tag the site, so a client running their own Ads has
 *   no id here and perfectly valid snippets.
 * - The SAME account re-saved, which every visit to the card does.
 *
 * This does not weaken the rule that an empty snippet box means "leave it
 * alone". That rule is about INCIDENTAL saves — the card blanks both boxes
 * after every save, so revisiting it to change the Bing tag must not wipe two
 * live conversions. This is the opposite: an explicit change of account, the
 * one event that proves the stored conversions belong somewhere else.
 */
export function isAccountMove(
  existingCustomerId: string | null | undefined,
  nextCustomerId: string | null | undefined
): boolean {
  const before = (existingCustomerId || '').trim()
  const after = (nextCustomerId || '').trim()
  return !!before && !!after && before !== after
}
