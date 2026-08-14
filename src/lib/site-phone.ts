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
export async function withSitePhone<T extends { id: string; phone: string }>(
  client: T
): Promise<T> {
  try {
    const number = await prisma.trackingNumber.findFirst({
      where: { clientId: client.id, active: true, useOnSite: true },
      select: { phoneNumber: true },
    })
    if (!number) return client
    const display = formatPhoneDisplay(number.phoneNumber)
    if (!display) return client
    return { ...client, phone: display }
  } catch {
    // Table missing or DB hiccup: the real number is always a safe answer.
    return client
  }
}
