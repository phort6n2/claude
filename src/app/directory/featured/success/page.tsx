import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Star } from 'lucide-react'

export const metadata: Metadata = {
  title: "You're Featured",
  robots: { index: false, follow: false },
}

// Stripe Payment Link redirects here after a successful $7/mo Featured purchase.
// The actual Featured grant is driven by the Stripe webhook (authoritative), so
// this page just confirms and reassures — the ranking updates within a minute.
export default function FeaturedSuccessPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 ring-8 ring-green-50">
        <CheckCircle2 className="text-green-600" width={36} height={36} />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-gray-900">You&apos;re Featured! 🎉</h1>
      <p className="mx-auto mt-3 max-w-md text-gray-600">
        Payment received. Your listing is being moved to the top of your city and will show the{' '}
        <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
          <Star width={14} height={14} /> Featured
        </span>{' '}
        badge within a minute. Thanks for growing with Windshield Repair HQ.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/directory/owner"
          className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Go to my dashboard
        </Link>
        <Link
          href="/directory"
          className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back to directory
        </Link>
      </div>
      <p className="mt-6 text-xs text-gray-400">
        Manage or cancel anytime from the receipt Stripe emailed you.
      </p>
    </div>
  )
}
