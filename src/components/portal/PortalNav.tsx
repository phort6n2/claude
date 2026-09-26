'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
  Inbox,
  Globe,
  MapPin,
  Sparkles,
  Search,
  BarChart3,
  Phone,
  MoreHorizontal,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'

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

const HOME_TAB: Tab = { href: '/portal', label: 'Home', icon: Home, exact: true }
const LEADS_TAB: Tab = { href: '/portal/leads', label: 'Leads', icon: Inbox }
/* "Your phone" — missed calls, when the phone rings, and whether the team is
   getting better at answering it. It was reachable only from a home-screen
   tile, which is the mistake the Traffic and Reports notes below record twice:
   the call-quality chart shipped there and the owner asked where it was. */
const CALLS_TAB: Tab = { href: '/portal/calls', label: 'Calls', icon: Phone }
const RANKINGS_TAB: Tab = { href: '/portal/rankings', label: 'Rankings', icon: MapPin }
const ACTIVITY_TAB: Tab = { href: '/portal/activity', label: 'Activity', icon: Sparkles }
/* Always offered, like Activity, because the page can never be empty: with a
   property connected it is the report, and without one it is the case for
   buying the service. "Traffic" rather than the page's own "How people find
   you" — a tab label has one line of an eighth of a phone screen. */
const TRAFFIC_TAB: Tab = { href: '/portal/traffic', label: 'Traffic', icon: Search }
/* Reporting, which used to be reachable only from the Booked tile. Same
   lesson Traffic taught: a tile-only report is a report the shop never finds,
   and this is now the page that says what the ads cost and what came of it —
   the one a shop opens when deciding whether to keep paying. The month's
   email links straight here. */
const REPORTING_TAB: Tab = { href: '/portal/results', label: 'Reports', icon: BarChart3 }

/**
 * FOUR TABS AND "MORE", because seven did not fit and nobody could see it.
 *
 * The bar grew one tab at a time, each added with a measurement: six at 360px
 * were 60px a column, seven were 51px, "Seven is the ceiling". What the
 * measurement did not include was the phone the owner actually uses, nor a
 * shop with BOTH "My site" and "Rankings" — and a real render of NorthStar at
 * 390px showed "ome" at the left edge and "Rankin" at the right, the first
 * and last tabs cut off. On desktop the same seven tabs sat beside the logo
 * and the business name in a 1024px header and could not fit either. Every
 * page added since would have made it worse, and there were more to come.
 *
 * So the pages a shop works in every day — Home, Leads, Calls, Reports — are
 * one tap, and the ones they check now and then sit under More. Not a
 * DROPDOWN on a phone: a menu hanging off a bottom bar has nowhere to drop,
 * so there it is a panel that rises above the bar; on desktop it is the
 * ordinary dropdown. Either way the More button takes the NAME of the page
 * you are on when that page lives inside it, so "where am I" never reads as
 * "More".
 *
 * A page moved under More is one tap further, not hidden: it is still in the
 * menu, labelled, which is the whole difference from a tile.
 *
 * The flags are false until there is something behind the tab. A tab that
 * leads to a permanent empty state is worse than no tab — it reads as
 * something broken rather than something not bought.
 */
function useTabs(showRankings: boolean, siteUrl: string | null | undefined, showCalls: boolean) {
  const pathname = usePathname()
  const primary: Tab[] = [HOME_TAB, LEADS_TAB, ...(showCalls ? [CALLS_TAB] : []), REPORTING_TAB]
  const more: Tab[] = [
    ACTIVITY_TAB,
    TRAFFIC_TAB,
    ...(showRankings ? [RANKINGS_TAB] : []),
    // Only once there is an address to open — the same rule as Rankings.
    ...(siteUrl ? [{ href: siteUrl, label: 'My site', icon: Globe, external: true }] : []),
  ]
  const isActive = (tab: Tab) =>
    tab.external ? false : tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  return { primary, more, isActive, pathname }
}

/**
 * The More control, for both layouts. Closes on navigation, on a tap outside
 * and on Escape — a menu left open over the page after the page changed is
 * the thing people report as "the menu is stuck".
 */
function MoreMenu({
  items,
  isActive,
  pathname,
  variant,
}: {
  items: Tab[]
  isActive: (tab: Tab) => boolean
  pathname: string
  variant: 'bar' | 'row'
}) {
  // Open ON A PAGE, not just open: the menu remembers where it was opened, so
  // navigating anywhere closes it by construction — no effect resetting state
  // after the render that already showed it open over the new page.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (next: boolean | ((was: boolean) => boolean)) =>
    setOpenOn((prev) => {
      const was = prev === pathname
      return (typeof next === 'function' ? next(was) : next) ? pathname : null
    })
  const ref = useRef<HTMLDivElement>(null)
  const current = items.find(isActive)
  const Icon = current?.icon ?? MoreHorizontal

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenOn(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  const button =
    variant === 'bar'
      ? `flex w-full flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-semibold ${
          current || open ? 'text-[var(--brand-ink)]' : 'text-gray-500'
        }`
      : `inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
          current
            ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
        }`

  const panel =
    variant === 'bar'
      ? // Rises above the bar: fixed to the viewport, clear of the bar's
        // 56px and the home-indicator inset.
        'fixed right-2 bottom-[calc(64px+env(safe-area-inset-bottom))] w-56'
      : 'absolute right-0 top-full mt-2 w-52'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-current={current ? 'page' : undefined}
        className={button}
      >
        <Icon className={variant === 'bar' ? 'h-5 w-5' : 'h-4 w-4'} />
        {current?.label ?? 'More'}
        {variant === 'row' && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <div
          className={`${panel} z-50 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg`}
        >
          {items.map((tab) => {
            const TabIcon = tab.icon
            const active = isActive(tab)
            const cls = `flex items-center gap-3 px-4 py-3 text-sm font-medium ${
              active ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'text-gray-700 hover:bg-gray-50'
            }`
            return tab.external ? (
              <a key={tab.href} href={tab.href} target="_blank" rel="noopener noreferrer" className={cls}>
                <TabIcon className="h-4 w-4" />
                {tab.label}
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-gray-400" />
              </a>
            ) : (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cls}
                onClick={() => setOpen(false)}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface NavProps {
  showRankings?: boolean
  siteUrl?: string | null
  showCalls?: boolean
}

export default function PortalNav({ showRankings = false, siteUrl = null, showCalls = false }: NavProps) {
  const { primary, more, isActive, pathname } = useTabs(showRankings, siteUrl, showCalls)

  return (
    <nav className="hidden sm:flex items-center gap-1" aria-label="Portal">
      {primary.map((tab) => {
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
      <MoreMenu items={more} isActive={isActive} pathname={pathname} variant="row" />
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
export function PortalTabBar({ showRankings = false, siteUrl = null, showCalls = false }: NavProps) {
  const { primary, more, isActive, pathname } = useTabs(showRankings, siteUrl, showCalls)
  const columns = primary.length + (more.length ? 1 : 0)

  return (
    <nav
      // Columns follow the RENDERED tab count, not the base list. Hardcoding
      // three left the fourth tab stacked onto a second row on every phone;
      // reading TABS.length here did the same to the fifth once the
      // rankings tab could appear.
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 grid bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Portal"
    >
      {primary.map((tab) => {
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
      <MoreMenu items={more} isActive={isActive} pathname={pathname} variant="bar" />
    </nav>
  )
}
