import { prisma } from '@/lib/db'
import { siteLinkFor, PRIMARY_DOMAIN_SELECT } from '@/lib/site-origin'
import { headerIsDark } from '@/lib/logo-surface'

/**
 * Which parts of the portal this shop has something behind.
 *
 * ONE DECISION, READ BY THE NAV, THE REPORTS SUB-TABS, THE SUMMARY'S LINK
 * CARDS AND THE HOME TILES. The home screen's "Calls answered" tile linked to
 * the Calls page for every shop while the nav hid that page from shops with
 * no calls — two places deciding the same question two ways, one of them
 * leading to a page the menu said did not exist.
 *
 * A section is offered only once there is something behind it: a tab that
 * leads to a permanent empty state reads as something broken rather than
 * something not bought.
 */
export interface PortalSections {
  /** A line is tracked here, or a call has been coached (older shops' calls came via HighLevel). */
  hasCalls: boolean
  /**
   * ONCE MEASURING IS SET UP, not once it has reported. A campaign that exists
   * and has not run yet is a WAIT, and hiding the page during it means a shop
   * is told nothing in the days between signing up and the first scan.
   */
  hasRankings: boolean
  /**
   * Their own address once a custom domain is live, ours until then. Only a
   * real, reachable address — the preview path is an operator's tool.
   */
  siteUrl: string | null
  /**
   * The logo is drawn for a dark background, so the portal header sets it on
   * a dark tile — the same decision the website's header makes
   * (lib/logo-surface.ts), or the owner sees a lone "PRO" at the top of their
   * own portal, exactly as visitors did on their site.
   */
  logoOnDark: boolean
}

export async function getPortalSections(clientId: string): Promise<PortalSections> {
  const [rankScans, trackingNumbers, coachedCalls, client] = await Promise.all([
    prisma.localRankScan.count({ where: { clientId } }).catch(() => 0),
    prisma.trackingNumber.count({ where: { clientId } }).catch(() => 0),
    prisma.callAnalysis.count({ where: { clientId } }).catch(() => 0),
    prisma.client
      .findUnique({
        where: { id: clientId },
        select: {
          slug: true,
          siteSubdomain: true,
          rankTrackingId: true,
          domains: PRIMARY_DOMAIN_SELECT,
          logoUrl: true,
          logoSurface: true,
          logoSurfaceUrl: true,
          headerTheme: true,
        },
      })
      .catch(() => null),
  ])

  return {
    hasCalls: trackingNumbers > 0 || coachedCalls > 0,
    hasRankings: rankScans > 0 || !!client?.rankTrackingId,
    siteUrl:
      client && (client.siteSubdomain || client.domains.length) ? siteLinkFor(client) : null,
    logoOnDark: !!client?.logoUrl && headerIsDark(client),
  }
}
