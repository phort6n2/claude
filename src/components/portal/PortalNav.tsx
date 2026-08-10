'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Inbox, Globe, Image as ImageIcon } from 'lucide-react'

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

export default function PortalNav() {
  const pathname = usePathname()
  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)

  return (
    <>
      {/* Desktop */}
      <nav className="hidden sm:flex gap-1" aria-label="Portal">
        {TABS.map((tab) => {
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

      {/* Phone: fixed bottom bar */}
      <nav
        // Columns follow the tab count. Hardcoding three left the fourth tab
        // stacked onto a second row on every phone.
        style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 grid bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
        aria-label="Portal"
      >
        {TABS.map((tab) => {
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
    </>
  )
}
