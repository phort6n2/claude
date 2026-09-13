import { prisma } from '@/lib/db'
import { formatPhoneDisplay } from '@/lib/lead-display'

/**
 * The phone number a hosted site should SHOW.
 *
 * When a client has a tracking number flagged for the site, every visible
 * phone on their pages — header, footer, CTAs, the widget's call button —
 * becomes that number, so calls from the website get recorded, coached and
 * counted like everything else. Without one, the shop's real line shows and
 * nothing changes.
 *
 * The swap happens at the data layer, on the client object itself, because
 * two dozen components read `client.phone` and swapping at the source keeps
 * every one of them consistent without touching any of them.
 *
 * Deliberately NOT swapped: the LocalBusiness JSON-LD. Search engines
 * cross-check a site's schema phone against the Google Business Profile, and
 * a tracking number there splits the NAP signal local ranking leans on. So
 * pages build their schema from the real client first, then render with the
 * swapped one — display gets tracked, schema stays canonical.
 */
export async function withSitePhone<
  T extends { id: string; phone: string; siteDisplayPhone?: string | null },
>(client: T): Promise<T & { callbackPhone: string }> {
  /**
   * THE SHOP'S OWN LINE, KEPT ALONGSIDE THE SWAP.
   *
   * One `phone` field was doing two opposite jobs, and the confirmation card
   * after a quote submission is where that showed: it said "They will call
   * from (689) 366-6860 — save the number so you do not miss it", naming the
   * TRACKING number. The shop dials back from their own phone, so the call
   * that arrives shows a different number from the one the customer was just
   * told to save — which is precisely the missed call that sentence exists to
   * prevent.
   *
   * The rule is by DIRECTION, not by page:
   *
   * - INBOUND — every "call us" link, the header, the footer, the mobile bar —
   *   is the display number, so the call is recorded, coached and attributed.
   *   That is what the swap is for.
   * - OUTBOUND, or anything the customer will see arrive: the real line. The
   *   callback comes from it, and so does every `sms:` path — the tracking
   *   numbers are bought with a VoiceUrl and nothing else, there is no SMS
   *   webhook among the four Twilio routes, so a photo texted to one is
   *   swallowed silently and the customer believes they sent it.
   *
   * Returned rather than left to each page to capture BEFORE the swap,
   * because that is the same order-dependence the JSON-LD note above already
   * warns about, and a page that forgets would name the wrong number rather
   * than none. Missing, the copy omits the number entirely — the safe
   * direction.
   */
  const callbackPhone = formatPhoneDisplay(client.phone) || client.phone

  try {
    const number = await prisma.trackingNumber.findFirst({
      where: { clientId: client.id, active: true, useOnSite: true },
      select: { phoneNumber: true },
    })
    const display = number ? formatPhoneDisplay(number.phoneNumber) : null
    if (display) return { ...client, phone: display, callbackPhone }
  } catch {
    // Table missing or DB hiccup: fall through to the answers below, which
    // do not depend on it.
  }

  // No number of ours. A shop can still be running call tracking somewhere
  // else — HighLevel, a call-tracking vendor, a Google forwarding number —
  // and if they are, THAT is the number the site has to show, or the calls
  // the site earns land on an untracked line and their ad reporting counts
  // none of them. Collision is exactly this case.
  const external = client.siteDisplayPhone?.trim()
  if (external) {
    // The display number is somebody else's tracking pool, but the callback
    // still comes from the shop's own handset.
    return { ...client, phone: formatPhoneDisplay(external) || external, callbackPhone }
  }

  // The shop's own line, exactly as typed into the intake — which can be
  // "3215995777". Every path out of here formats for display; tel: links
  // are unaffected because telHref strips to digits anyway. With no swap at
  // all the two are the same number, and the copy reads as it always did.
  return { ...client, phone: callbackPhone, callbackPhone }
}
