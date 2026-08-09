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
