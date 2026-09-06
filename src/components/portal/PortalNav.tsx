'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Inbox, Globe, MapPin, Sparkles } from 'lucide-react'

/**
 * Portal navigation, named the way a shop owner talks. Bottom tab bar on a
 * phone (thumb-reachable, safe-area padded), inline row on desktop.
 *
 * THE SITE IS OURS TO RUN. This is a done-for-you service, so the portal
 * shows the shop what is happening — their leads, their rankings, what has
 * been done — and gives them no way to change the site itself. "My site" is
 * an outward link to the live page, so they can look at what they are paying
 * for; the Photos and My Website editors are gone, along with the endpoints
 * behind them. A read-only portal whose write endpoints still answer is not
 * a read-only portal.
 */
interface Tab {
  href: string
  label: string
  icon: typeof Home
  exact?: boolean
  /** Opens the live site in a new tab rather than navigating the portal. */
  external?: boolean
}

const TABS: Tab[] = [
  { href: '/portal', label: 'Home', icon: Home, exact: true },
  { href: '/portal/leads', label: 'Leads', icon: Inbox },
]

const RANKINGS_TAB: Tab = { href: '/portal/rankings', label: 'Rankings', icon: MapPin }
const ACTIVITY_TAB: Tab = { href: '/portal/activity', label: 'Activity', icon: Sparkles }

/**
 * The flag is false until there is something behind the tab. A tab that
 * leads to a permanent empty state is worse than no tab — it reads as
 * something broken rather than something not bought.
 */
function useTabs(showRankings: boolean, siteUrl?: string | null) {
  const pathname = usePathname()
  // Activity is always offered: it has a floor (the day the site went live),
  // so unlike Rankings it can never lead to an empty page.
  // Results is deliberately NOT a tab. Six would already be tight on a 360px
  // phone and seven with Rankings would wrap, which is the exact failure the
  // grid-column comment below records. It is reached from the Booked tile on
  // the home screen, which is where someone asking "what have I made" already
  // is.
  const tabs: Tab[] = [
    ...TABS,
    // Only once there is an address to open. A tab that goes nowhere is worse
    // than no tab — the same rule as Rankings.
    ...(siteUrl ? [{ href: siteUrl, label: 'My site', icon: Globe, external: true }] : []),
    ACTIVITY_TAB,
    ...(showRankings ? [RANKINGS_TAB] : []),
  ]
  const isActive = (tab: Tab) =>
    tab.external ? false : tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  return { tabs, isActive }
}

export default function PortalNav({
  showRankings = false,
  siteUrl = null,
}: {
  showRankings?: boolean
  siteUrl?: string | null
}) {
  const { tabs, isActive } = useTabs(showRankings, siteUrl)

  return (
    <nav className="hidden sm:flex gap-1" aria-label="Portal">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab)
          const className = `inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            active
              ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`
          // Their own site opens in its own tab: it is not part of the portal,
          // and a shop that clicks it should not have to find its way back.
          if (tab.external) {
            return (
              <a key={tab.href} href={tab.href} target="_blank" rel="noopener noreferrer" className={className}>
                <Icon className="h-4 w-4" />
                {tab.label}
              </a>
            )
          }
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          )
      })}
    </nav>
  )
}

/**
 * The phone tab bar, deliberately a SEPARATE export.
 *
 * It must be rendered OUTSIDE the portal header. The header carries
 * `backdrop-blur`, and a backdrop-filter establishes a containing block for
 * fixed-position descendants — so while this lived inside the header,
 * `fixed bottom-0` pinned it to the bottom of the HEADER, i.e. the top of
 * the screen, on every phone.
 */
export function PortalTabBar({
  showRankings = false,
  siteUrl = null,
}: {
  showRankings?: boolean
  siteUrl?: string | null
}) {
  const { tabs, isActive } = useTabs(showRankings, siteUrl)

  return (
    <nav
      // Columns follow the RENDERED tab count, not the base list. Hardcoding
      // three left the fourth tab stacked onto a second row on every phone;
      // reading TABS.length here did the same to the fifth once the
      // rankings tab could appear.
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 grid bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Portal"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = isActive(tab)
        const className = `flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-semibold ${
          active ? 'text-[var(--brand-ink)]' : 'text-gray-500'
        }`
        if (tab.external) {
          return (
            <a key={tab.href} href={tab.href} target="_blank" rel="noopener noreferrer" className={className}>
              <Icon className="h-5 w-5" />
              {tab.label}
            </a>
          )
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={className}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
