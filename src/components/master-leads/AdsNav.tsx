'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Sub-navigation shared across the mobile Google Ads pages so you can move
// between Today's metrics and the optimization tools with one tap.
const TABS = [
  { name: 'Today', href: '/master-leads/ads' },
  { name: 'Performance', href: '/master-leads/ads-performance' },
  { name: 'Health', href: '/master-leads/ads-health' },
  { name: 'Negatives', href: '/master-leads/ads-negatives' },
]

export function AdsNav() {
  const pathname = usePathname()
  return (
    <div className="max-w-3xl mx-auto px-4 pt-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
