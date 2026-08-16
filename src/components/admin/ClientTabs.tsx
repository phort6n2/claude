'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { confirmDiscard } from '@/hooks/useDirtyForm'
import { useUnsavedWork } from '@/components/admin/UnsavedWorkGuard'
import {
  LayoutDashboard,
  Building2,
  Globe,
  Megaphone,
  Webhook,
  Users,
  MapPin,
  FileText,
  Sparkles,
  BarChart3,
} from 'lucide-react'

/**
 * Tabs across the client's routed sub-pages. Each tab is one task, and each
 * owns its own save — so leaving a tab can never strand unsaved work behind
 * a button on another tab.
 */
export default function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname()
  const { isDirty } = useUnsavedWork()
  const base = `/admin/clients/${clientId}`
  const tabs = [
    { href: base, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `${base}/business`, label: 'Business', icon: Building2 },
    { href: `${base}/site`, label: 'Website', icon: Globe },
    { href: `${base}/advertising`, label: 'Advertising', icon: Megaphone },
    { href: `${base}/rankings`, label: 'Rankings', icon: MapPin },
    { href: `${base}/results`, label: 'Results', icon: BarChart3 },
    { href: `${base}/activity`, label: 'Activity', icon: Sparkles },
    { href: `${base}/seo`, label: 'SEO', icon: FileText },
    { href: `${base}/leads-setup`, label: 'Lead delivery', icon: Webhook },
    { href: `${base}/users`, label: 'Users', icon: Users },
  ]

  return (
    // Wraps rather than scrolls. It was overflow-x-auto with no fade, no
    // arrow and no scrollbar until hovered, so below about 1100px the last
    // three tabs — SEO, Lead delivery, Users — were simply invisible, with
    // nothing on screen suggesting they existed. A second row is uglier than
    // a scroll and infinitely more findable.
    <nav
      className="flex flex-wrap gap-1 border-b border-gray-200 -mb-px"
      aria-label="Client settings"
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            // A tab change is a soft navigation, so the browser's own unsaved
            // guard never sees it. Ask here instead of losing the work.
            onClick={(e) => {
              if (!confirmDiscard(isDirty())) e.preventDefault()
            }}
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              active
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
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
