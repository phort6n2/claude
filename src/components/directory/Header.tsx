import Link from 'next/link'
import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { blogEnabled } from '@/lib/directory/blog'

const navLink =
  'rounded-lg px-3 py-2 text-sm font-medium text-gray-600 outline-none transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/70',
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/directory"
          className="group flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          aria-label="Windshield Repair HQ home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm ring-1 ring-inset ring-white/10 transition-colors group-hover:bg-blue-700">
            <Shield width={18} height={18} />
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            Windshield Repair <span className="text-blue-600">HQ</span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="flex items-center gap-0.5 sm:gap-1"
        >
          <Link href="/directory/search" className={navLink}>
            Find a shop
          </Link>
          <Link
            href="/directory/browse"
            className={cn(navLink, 'hidden sm:inline-flex')}
          >
            Browse by city
          </Link>
          {blogEnabled() && (
            <Link
              href="/directory/blog"
              className={cn(navLink, 'hidden sm:inline-flex')}
            >
              Blog
            </Link>
          )}
          <Link
            href="/directory/claim"
            className="ml-1 inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span className="sm:hidden">Add shop</span>
            <span className="hidden sm:inline">Add your shop — free</span>
          </Link>
        </nav>
      </div>
    </header>
  )
}
