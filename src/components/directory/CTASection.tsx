import Link from 'next/link'
import { Search, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CTAAction {
  label: string
  href: string
}

interface CTASectionProps {
  title?: string
  description?: string
  primary?: CTAAction
  secondary?: CTAAction
  className?: string
}

/**
 * Dark, high-contrast lead-magnet CTA band. Server-safe and standalone —
 * mirrors the shop-owner CTA used on the directory home page, with sensible
 * defaults so it can be dropped in with zero props.
 */
export function CTASection({
  title = 'Own an auto glass shop?',
  description = "Get a free listing and start showing up when local drivers search for windshield repair. When you're ready to grow, we offer done-for-you SEO and Google Ads management built specifically for auto glass shops.",
  primary = { label: 'Add your shop — free', href: '/directory/claim' },
  secondary = { label: 'See SEO & ads services', href: '/directory/for-shops' },
  className,
}: CTASectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden bg-gray-900 px-4 py-16 text-white',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_0%,rgba(37,99,235,0.28),transparent)]"
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-gray-300">{description}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {primary && (
            <Link
              href={primary.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm outline-none transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 sm:w-auto"
            >
              <Search width={18} height={18} /> {primary.label}
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-600 px-6 py-3 font-semibold text-white outline-none transition-colors hover:border-gray-500 hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 sm:w-auto"
            >
              {secondary.label}
              <ArrowRight
                width={16}
                height={16}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
