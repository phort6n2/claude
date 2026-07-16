import Link from 'next/link'
import { Shield } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/directory" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Shield width={18} height={18} />
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            AutoGlass<span className="text-blue-600">Directory</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/directory/search"
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            Find a shop
          </Link>
          <Link
            href="/directory/browse"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 sm:block"
          >
            Browse by city
          </Link>
          <Link
            href="/directory/claim"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add your shop — free
          </Link>
        </nav>
      </div>
    </header>
  )
}
