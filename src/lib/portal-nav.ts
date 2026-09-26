import { Home, Inbox, BarChart3, Phone, Search, MapPin, Sparkles, type LucideIcon } from 'lucide-react'

/**
 * The portal's menu, as data. A LEAF: the bottom bar and the header row are
 * client components, the Summary page's link cards are server-rendered, and a
 * list declared inside a 'use client' file cannot be read as a value from the
 * server. Two copies of the menu is how a page ends up in one and not the other.
 *
 * THREE TABS, THE SAME FOR EVERY SHOP: Home, Leads, Reports.
 *
 * Each answers one question an owner actually brings to the portal —
 *   Home:    is anything urgent?
 *   Leads:   who do I call back?
 *   Reports: is this working, and is it worth the fee?
 * — and everything that is EVIDENCE the service works (how the phone is
 * handled, how people find the site, where they rank, what we did) lives
 * inside Reports as visible sub-tabs, not in a menu.
 *
 * HOW IT GOT HERE, because each step was reasonable and the sum was not:
 * seven flat tabs, each added with a measurement at 360px, clipped "Home" and
 * "Rankings" off the edges for a shop that had every conditional tab; four
 * tabs plus "More" fixed the clipping but grouped pages by what did not fit
 * rather than by what they are, behind a label that says nothing. And three
 * pages — Traffic, Reports, then Calls — were each reachable only from a
 * home-screen tile at some point, and each time the owner could not find it.
 * The Calls page with the call-quality chart is the one that prompted this.
 *
 * NOT A DROPDOWN UNDER "REPORTS", which was the first idea and a good
 * instinct about grouping: on a phone a dropdown turns a destination into a
 * menu button — two taps to any report, and hidden navigation is measurably
 * found less (NN/g). Reports is a real tab that lands on its Summary, and its
 * children are tabs you can SEE on the page.
 *
 * The bar is identical for every shop on purpose: conditional pages
 * (Calls, Rankings) only ever add or remove SUB-tabs, so the thing a shop's
 * thumb has learned never moves.
 */
export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Only exact-match for highlighting — "/portal" would otherwise match every page. */
  exact?: boolean
}

export const MAIN_TABS: NavItem[] = [
  { href: '/portal', label: 'Home', icon: Home, exact: true },
  { href: '/portal/leads', label: 'Leads', icon: Inbox },
  { href: '/portal/results', label: 'Reports', icon: BarChart3 },
]

export interface ReportSection extends NavItem {
  /** A line for the Summary page's link card: what this report answers. */
  blurb: string
  requires?: 'calls' | 'rankings'
}

/**
 * The sub-tabs inside Reports, in the order an owner reads them: the money
 * first, then the phone, then how people find them, then where they rank,
 * then what we did. URLs are unchanged from when these were top-level pages,
 * so the monthly email and every home tile still land where they did.
 *
 * "Work done", not "Activity": in an app about leads, "Activity" reads as
 * lead activity. The monthly report has always called this "What we did".
 */
export const REPORT_SECTIONS: ReportSection[] = [
  {
    href: '/portal/results',
    label: 'Summary',
    icon: BarChart3,
    blurb: 'Enquiries, what you booked and what the ads cost',
  },
  {
    href: '/portal/calls',
    label: 'Calls',
    icon: Phone,
    blurb: 'When your phone rings, and how well it is answered',
    requires: 'calls',
  },
  {
    href: '/portal/traffic',
    label: 'Traffic',
    icon: Search,
    blurb: 'How people find your website',
  },
  {
    href: '/portal/rankings',
    label: 'Rankings',
    icon: MapPin,
    blurb: 'Where you show up on the map',
    requires: 'rankings',
  },
  {
    href: '/portal/activity',
    label: 'Work done',
    icon: Sparkles,
    blurb: 'What we did for you, and when',
  },
]

export function reportSectionsFor(flags: { hasCalls: boolean; hasRankings: boolean }): ReportSection[] {
  return REPORT_SECTIONS.filter(
    (s) =>
      !s.requires ||
      (s.requires === 'calls' && flags.hasCalls) ||
      (s.requires === 'rankings' && flags.hasRankings)
  )
}

/** Is this path one of the pages that live under Reports? */
export function isReportPath(pathname: string): boolean {
  return REPORT_SECTIONS.some((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  // Reports lights up for every page that lives under it, not just its own URL.
  if (item.href === '/portal/results') return isReportPath(pathname)
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
