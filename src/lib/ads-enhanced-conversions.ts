/**
 * Is enhanced conversions actually set up, and what can be PROVEN about it?
 *
 * Enhanced conversions has three moving parts in three different places, and
 * only two of them can be read from here:
 *
 * 1. OUR TOGGLE (`ClientAdsTracking.enhancedConversions`, default on). When
 *    off, the tag omits `allow_enhanced_conversions` and never calls
 *    `gtag('set', 'user_data', …)`. Nothing Google is set to can rescue that.
 * 2. THE PUBLISHED PAGE. Saved is not deployed: the site is cached for a few
 *    minutes, and a client whose site is not live serves no tag at all. So
 *    the page is fetched and the two strings are looked for.
 * 3. GOOGLE'S PER-ACTION SETTING and the customer-data terms — WHICH THE API
 *    DOES NOT EXPOSE. Probed against a live account: `conversion_action` has
 *    no enhanced-conversions field at all (`enhanced_conversions_enabled` and
 *    `enhanced_conversions_for_leads_enabled` both come back
 *    UNRECOGNIZED_FIELD on that resource). The only readable flag is
 *    `customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled`,
 *    which is the LEADS feature — a different setting, about uploads carrying
 *    hashed identifiers, and this app's uploads carry a click id instead.
 *
 * So part 3 is reported as "not checkable from here" with the exact place to
 * look, rather than folded into a tick. The route this feeds says it best: a
 * green tick that means less than it appears is worse than no tick.
 *
 * WHY THE IN-PAGE HAND-OFF IS NOT OPTIONAL HERE. Google's dialog offers
 * automatic detection and describes in-page code as a way to "improve
 * performance". On these sites automatic detection finds NOTHING: the quote
 * form renders inside a shadow root (widget.js calls attachShadow), and
 * automatic detection reads the page DOM, which cannot see into one. The
 * explicit `user_data` call is the whole mechanism, not an optimisation —
 * which is why its absence from the page is a failure and not a note.
 *
 * Pure: strings and flags in, checks out. No fetch, no database.
 */

export interface EnhancedCheck {
  label: string
  ok: boolean
  detail: string
  /** Did not run, or ran and found a legitimate state — not a fault. */
  info?: boolean
}

export interface EnhancedInput {
  /** The Ads conversion id, if one is configured at all. */
  conversionId: string | null
  /** The form-lead conversion label. */
  leadSendTo: string | null
  /** Our own per-client toggle. */
  enabledInApp: boolean
  /** The published page, already unescaped. Null when it could not be fetched. */
  html: string | null
  /**
   * `enhanced_conversions_for_leads_enabled` as read from Google, or null
   * when it was not asked (no credentials, or no account selected).
   *
   * FALSE AND ABSENT ARE THE SAME THING in the response — verified against
   * two live accounts: one returned the key as true, another omitted it
   * entirely while still returning `conversion_tracking_status`. So the
   * caller must default a missing key to false rather than to unknown, the
   * same rule `customer_conversion_goal.biddable` already needs.
   */
  leadsFlagInGoogle: boolean | null
}

export function enhancedConversionChecks(input: EnhancedInput): EnhancedCheck[] {
  // Without a conversion id there is no Ads tag on the page at all, and
  // enhanced conversions is a property of a tag that is not there. The
  // surrounding audit already reports the missing id; repeating it here as a
  // second red cross would just double the noise.
  if (!input.conversionId) return []

  const checks: EnhancedCheck[] = []

  if (!input.enabledInApp) {
    checks.push({
      label: 'Enhanced conversions',
      ok: false,
      info: true,
      detail:
        'Switched off for this client, so the tag deliberately leaves out allow_enhanced_conversions and never hands over the email or phone. Whatever Google Ads is set to, there is nothing for it to receive until this is switched on above.',
    })
    return checks
  }

  if (input.html === null) {
    checks.push({
      label: 'Enhanced conversions on the page',
      ok: false,
      info: true,
      detail: 'Not checked — the published page could not be fetched above.',
    })
  } else {
    const asks = input.html.includes('allow_enhanced_conversions')
    checks.push({
      label: 'Enhanced conversions on the page',
      ok: asks,
      detail: asks
        ? 'The tag asks Google to accept user-provided data.'
        : 'Saved as on, but the published page does not carry allow_enhanced_conversions. If you just saved, the page is cached for up to 5 minutes.',
    })

    // Only meaningful when there is a form conversion to attach data to.
    if (input.leadSendTo) {
      const handsOver = input.html.includes('user_data') && input.html.includes('phone_number')
      checks.push({
        label: 'The form hands over email and phone',
        ok: handsOver,
        detail: handsOver
          ? "The page sets user_data from the form before reporting the conversion. That is what makes this work here: the form is inside a shadow root, so Google's automatic detection cannot see the fields."
          : "The page never sets user_data, so Google receives no email or phone and enhanced conversions does nothing. Automatic detection cannot stand in for it — the form is inside a shadow root, which it cannot read into.",
      })
    }
  }

  /* THE HALF THAT CANNOT BE VERIFIED, said out loud.
     Always shown once our side is on, because "everything green" here would
     otherwise be read as covering the setting the operator was actually
     looking at in Google's own dialog. */
  checks.push({
    label: "Google's own setting",
    ok: false,
    info: true,
    detail:
      'Not checkable from here — the Google Ads API exposes no enhanced-conversions field on a conversion action, and no way to see whether the customer-data terms were accepted. Check it once per account: Goals → Conversions → the form-lead action → Enhanced conversions → on, method "Google Tag", and accept the terms. The in-page code its dialog offers is already on the site.',
  })

  if (input.leadsFlagInGoogle !== null) {
    /* A DIFFERENT SETTING WITH A CONFUSINGLY SIMILAR NAME, reported as a fact
       and never as a fault. Enhanced conversions for LEADS is about uploads
       that carry hashed identifiers; this app's uploads carry the click id, so
       neither state of this flag affects anything here. It is worth printing
       precisely because somebody comparing screens would otherwise read it as
       the answer to the check above. */
    checks.push({
      label: 'Enhanced conversions for leads (account-wide)',
      ok: true,
      info: true,
      detail: input.leadsFlagInGoogle
        ? 'On in this account. That is the separate uploads-with-identifiers feature, not the page setting above — this app uploads booked jobs against the click id, so it neither needs nor uses it.'
        : 'Off in this account, which is fine: it is the separate uploads-with-identifiers feature, and this app uploads booked jobs against the click id instead.',
    })
  }

  return checks
}
