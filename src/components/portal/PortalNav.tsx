'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Inbox, Globe, Image as ImageIcon, MapPin } from 'lucide-react'

/**
 * Portal navigation, named the way a shop owner talks. Bottom tab bar on a
 * phone (thumb-reachable, safe-area padded), inline row on desktop.
 */
const TABS = [
  { href: '/portal', label: 'Home', icon: Home, exact: true },
  { href: '/portal/leads', label: 'Leads', icon: Inbox },
  { href: '/portal/photos', label: 'Photos', icon: ImageIcon },
  { href: '/portal/website', label: 'My Website', icon: Globe },
]

const RANKINGS_TAB = { href: '/portal/rankings', label: 'Rankings', icon: MapPin }

/**
 * The flag is false until there is something behind the tab. A tab that
 * leads to a permanent empty state is worse than no tab — it reads as
 * something broken rather than something not bought.
 */
function useTabs(showRankings: boolean) {
  const pathname = usePathname()
  const tabs = [...TABS, ...(showRankings ? [RANKINGS_TAB] : [])]
  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  return { tabs, isActive }
}

export default function PortalNav({ showRankings = false }: { showRankings?: boolean }) {
  const { tabs, isActive } = useTabs(showRankings)

  return (
    <nav className="hidden sm:flex gap-1" aria-label="Portal">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
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
export function PortalTabBar({ showRankings = false }: { showRankings?: boolean }) {
  const { tabs, isActive } = useTabs(showRankings)

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
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-semibold ${
              active ? 'text-[var(--brand-ink)]' : 'text-gray-500'
            }`}
          >
            <Icon className="h-5 w-5" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
