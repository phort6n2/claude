'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import Sidebar from '@/components/admin/Sidebar'

/**
 * The admin, usable on a phone.
 *
 * WHAT THIS REPLACES. The layout was `flex h-screen` with a fixed `w-64`
 * sidebar and no mobile variant anywhere — no breakpoint, no drawer, no
 * toggle. On a 390px phone the sidebar took 256px and left 134px for the
 * content, which is not a degraded layout so much as no layout at all. That
 * matters more than it sounds: the nights this platform actually needs
 * attention — a client locked out, calls being dropped — are exactly the
 * nights nobody is sitting at a desk.
 *
 * The sidebar itself is unchanged and used in both places. Below `lg` it
 * becomes a drawer; at `lg` and up it is the same fixed column it always was.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Navigating closes it. Without this the drawer stays over the page you
  // just asked for, which reads as the tap not having worked.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // The page behind a drawer must not scroll under it — on iOS that is how
    // you end up somewhere else entirely when you close it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* The desktop column, exactly as it was. */}
      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>

      <div
        onClick={() => setOpen(false)}
        className={`lg:hidden fixed inset-0 z-40 bg-gray-900/60 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      {/* Rendered always so it can slide rather than appear, and `inert` when
          closed so its links are not reachable by tab or screen reader. */}
      <div
        id="admin-drawer"
        inert={!open}
        className={`lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto, so
          one wide table inside would stretch this column past the viewport and
          take the whole page sideways with it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* DARK, like the sidebar it opens. The logo is white artwork — on a
            white bar it rendered as a faint ghost, which is the sort of thing
            that only shows up in a screenshot. */}
        <header className="lg:hidden flex items-center gap-2 bg-gray-900 px-2 py-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="admin-drawer"
            // 44px, the smallest thing a thumb hits reliably.
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-200 hover:bg-gray-800"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Image src="/logo.png" alt="Auto Glass Marketing Pros" width={120} height={48} priority />
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
