import Link from 'next/link'
import { Shield } from 'lucide-react'
import { getStateSummaries } from '@/lib/directory/data'
import { blogEnabled } from '@/lib/directory/blog'

const footLink =
  'rounded-sm outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:underline'

export function Footer() {
  const states = getStateSummaries()
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <Shield width={18} height={18} />
              </span>
              <span className="text-base font-bold tracking-tight text-gray-900">
                Windshield Repair <span className="text-blue-600">HQ</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              The free listing directory for auto glass and windshield shops. Get
              found by drivers searching for repair and replacement near them.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">For shop owners</h4>
            <ul className="mt-3 space-y-2.5 text-sm text-gray-600">
              <li>
                <Link href="/directory/claim" className={footLink}>
                  Add your shop (free)
                </Link>
              </li>
              <li>
                <Link href="/directory/for-shops" className={footLink}>
                  Grow with SEO &amp; ads
                </Link>
              </li>
              <li>
                <Link href="/directory/search" className={footLink}>
                  Find a shop
                </Link>
              </li>
              {blogEnabled() && (
                <li>
                  <Link href="/directory/blog" className={footLink}>
                    Blog
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-sm font-semibold text-gray-900">Browse by state</h4>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm text-gray-600 sm:grid-cols-3">
              {states.map((s) => (
                <li key={s.state}>
                  <Link href={`/directory/${s.state}`} className={footLink}>
                    {s.stateFull}{' '}
                    <span className="text-gray-400">({s.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-200 pt-6 text-xs text-gray-500">
          <p>
            © {new Date().getFullYear()} Windshield Repair HQ. Listings are provided
            for informational purposes.
          </p>
        </div>
      </div>
    </footer>
  )
}
