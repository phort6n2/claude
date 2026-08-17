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
>(client: T): Promise<T> {
  try {
    const number = await prisma.trackingNumber.findFirst({
      where: { clientId: client.id, active: true, useOnSite: true },
      select: { phoneNumber: true },
    })
    const display = number ? formatPhoneDisplay(number.phoneNumber) : null
    if (display) return { ...client, phone: display }
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
    return { ...client, phone: formatPhoneDisplay(external) || external }
  }

  return client
}
