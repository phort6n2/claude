import Link from 'next/link'
import { getStateSummaries } from '@/lib/directory/data'

export function Footer() {
  const states = getStateSummaries()
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">AutoGlass Directory</h4>
            <p className="mt-3 text-sm text-gray-600">
              The free listing directory for auto glass and windshield shops. Get
              found by drivers searching for repair and replacement near them.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">For shop owners</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>
                <Link href="/directory/claim" className="hover:text-blue-600">
                  Add your shop (free)
                </Link>
              </li>
              <li>
                <Link href="/directory/for-shops" className="hover:text-blue-600">
                  Grow with SEO &amp; ads
                </Link>
              </li>
              <li>
                <Link href="/directory/search" className="hover:text-blue-600">
                  Find a shop
                </Link>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-sm font-semibold text-gray-900">Browse by state</h4>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600 sm:grid-cols-3">
              {states.map((s) => (
                <li key={s.state}>
                  <Link
                    href={`/directory/${s.state}`}
                    className="hover:text-blue-600"
                  >
                    {s.stateFull} ({s.count})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-500">
          <p>
            © {new Date().getFullYear()} AutoGlass Directory. Listings are provided
            for informational purposes. Sample data shown for demonstration.
          </p>
        </div>
      </div>
    </footer>
  )
}
