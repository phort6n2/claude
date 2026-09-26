'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { UserRound, ExternalLink, LogOut, Globe } from 'lucide-react'
import { MAIN_TABS, isActive, isReportPath, reportSectionsFor } from '@/lib/portal-nav'
import { NotificationToggle } from '@/components/portal/NotificationToggle'

/**
 * Portal navigation, named the way a shop owner talks: Home, Leads, Reports.
 * The menu itself — what is in it, in what order, and why it is three tabs —
 * is data in `lib/portal-nav.ts`, so the bar, the header, the Reports
 * sub-tabs and the Summary page's cards cannot disagree.
 *
 * THE SITE IS OURS TO RUN. This is a done-for-you service, so the portal
 * shows the shop what is happening and gives them no way to change the site
 * itself. "View my website" opens the live page in the account menu so they
 * can look at what they are paying for; the Photos and My Website editors are
 * gone, along with the endpoints behind them.
 */

interface Flags {
  hasCalls: boolean
  hasRankings: boolean
}

const tabClass = (active: boolean) =>
  `inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
    active
      ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
  }`

/** The header row, from `sm` up. */
export default function PortalNav() {
  const pathname = usePathname()
  return (
    <nav className="hidden sm:flex items-center gap-1" aria-label="Portal">
      {MAIN_TABS.map((tab) => {
        const Icon = tab.icon
        const active = isActive(tab, pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={tabClass(active)}
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
export function PortalTabBar() {
  const pathname = usePathname()
  return (
    <nav
      // Columns follow the RENDERED tab count, not a hardcoded number:
      // hardcoding it wrapped the last tab onto a second row twice.
      style={{ gridTemplateColumns: `repeat(${MAIN_TABS.length}, minmax(0, 1fr))` }}
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 grid bg-white/95 backdrop-blur border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Portal"
    >
      {MAIN_TABS.map((tab) => {
        const Icon = tab.icon
        const active = isActive(tab, pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center gap-1 min-h-[60px] text-xs font-semibold ${
              active ? 'text-[var(--brand-ink)]' : 'text-gray-500'
            }`}
          >
            {/* A bar across the top of the active tab, so "where am I" does
                not rest on a colour change alone. */}
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-b-full bg-[var(--brand-ink)]"
              />
            )}
            <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Top right, on every screen size: the things about the ACCOUNT rather than
 * the business — their live website, phone alerts on this device, sign out.
 *
 * SIGN-OUT USED TO EXIST ONLY ON THE LEADS PAGES, which drew their own second
 * header ("Lead Portal", a bell, a logout icon) inside the portal's. Every
 * other page had no way out, and the bell was an unlabelled toggle nobody
 * could decode. It is one labelled menu now, reachable from every page.
 *
 * Open ON A PAGE (it stores the pathname it was opened on), so navigating
 * closes it by construction, not by an effect resetting state a render late.
 */
export function AccountMenu({
  siteUrl,
  businessName,
  email,
}: {
  siteUrl: string | null
  businessName: string
  email: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const ref = useRef<HTMLDivElement>(null)

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

  async function signOut() {
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.push('/portal/login')
  }

  const row = 'flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account"
        className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
          open
            ? 'border-[var(--brand-ink)] bg-[var(--brand-soft)] text-[var(--brand-ink)]'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        <UserRound className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-gray-900">{businessName}</p>
            {email && <p className="truncate text-xs text-gray-500">{email}</p>}
          </div>
          <div className="py-1">
            {siteUrl && (
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={row}>
                <Globe className="h-4 w-4 text-gray-500" />
                View my website
                <ExternalLink className="ml-auto h-3.5 w-3.5 text-gray-400" />
              </a>
            )}
            <NotificationToggle variant="row" />
            <button type="button" onClick={signOut} className={row}>
              <LogOut className="h-4 w-4 text-gray-500" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The tabs INSIDE Reports — Summary, Calls, Traffic, Rankings, Work done —
 * shown only on those pages, on every screen size, in the same place.
 *
 * Visible tabs rather than a dropdown, which is the whole point of the
 * structure (see lib/portal-nav.ts). Five of them do not fit a 360px phone,
 * so the row scrolls inside its own box — the page itself never scrolls
 * sideways — with the active tab scrolled into view and a fade on whichever
 * edge has more, so a cut-off tab reads as "there is more" rather than as a
 * layout fault. The Summary page also links to every section, so nothing
 * depends on noticing the row.
 */
export function ReportsSubNav({ hasCalls, hasRankings }: Flags) {
  const pathname = usePathname()
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const sections = reportSectionsFor({ hasCalls, hasRankings })
  const show = isReportPath(pathname)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () =>
      setEdges({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      })
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [pathname, show])

  if (!show) return null

  const mask =
    edges.left && edges.right
      ? '[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]'
      : edges.right
        ? '[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]'
        : edges.left
          ? '[mask-image:linear-gradient(to_right,transparent,black_32px)]'
          : ''

  return (
    <nav aria-label="Reports" className="-mx-4 mb-6 border-b border-gray-200 sm:mx-0">
      <div
        ref={scroller}
        className={`flex gap-1 overflow-x-auto px-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${mask}`}
      >
        {sections.map((s) => {
          const active = pathname === s.href || pathname.startsWith(`${s.href}/`)
          const Icon = s.icon
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'border-[var(--brand-ink)] text-[var(--brand-ink)]'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
