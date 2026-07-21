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
  eyebrow?: string
  primary?: CTAAction
  secondary?: CTAAction
  className?: string
}

/**
 * Deep-blue lead-magnet CTA band — the "dark twin" of the homepage hero, using
 * the same layered depth (base gradient + cyan/blue radial glows + glass-grid
 * motif) so the page reads as one visual system. Server-safe and standalone.
 */
export function CTASection({
  title = 'Own an auto glass shop?',
  description = "Get a free listing and start showing up when local drivers search for windshield repair. When you're ready to grow, we offer done-for-you SEO and Google Ads management built specifically for auto glass shops.",
  eyebrow,
  primary = { label: 'Add your shop — free', href: '/directory/claim' },
  secondary = { label: 'See SEO & ads services', href: '/directory/for-shops' },
  className,
}: CTASectionProps) {
  return (
    <section
      className={cn(
        'relative isolate overflow-hidden bg-blue-950 px-4 py-20 text-white',
        className
      )}
    >
      {/* Depth: base gradient */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-gradient-to-b from-blue-950 via-blue-900 to-blue-950"
      />
      {/* Depth: layered radial glows */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(55% 90% at 50% 0%, rgba(56,189,248,0.22), transparent 70%), radial-gradient(40% 60% at 88% 20%, rgba(37,99,235,0.35), transparent 70%), radial-gradient(40% 60% at 10% 90%, rgba(29,78,216,0.35), transparent 70%)',
        }}
      />
      {/* Depth: faint glass-grid motif */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full opacity-[0.06]"
        style={{
          maskImage: 'radial-gradient(70% 80% at 50% 30%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(70% 80% at 50% 30%, black, transparent)',
        }}
      >
        <defs>
          <pattern id="cta-glassgrid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M44 0H0V44" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cta-glassgrid)" />
      </svg>

      <div className="relative mx-auto max-w-3xl text-center">
        {eyebrow && (
          <div className="mb-5 flex justify-center">
            <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-blue-50 ring-1 ring-inset ring-white/20 backdrop-blur">
              {eyebrow}
            </span>
          </div>
        )}
        <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-blue-100/85">{description}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {primary && (
            <Link
              href={primary.href}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/40 outline-none transition-colors hover:from-blue-400 hover:to-blue-500 active:from-blue-600 active:to-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950 sm:w-auto"
            >
              <Search width={18} height={18} /> {primary.label}
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white backdrop-blur outline-none transition-colors hover:border-white/30 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950 sm:w-auto"
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
