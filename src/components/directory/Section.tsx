import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionProps {
  children: ReactNode
  /** Optional heading rendered above the content. */
  title?: string
  /** Optional supporting line under the heading. */
  subtitle?: string
  /** Optional "view all" style link on the right of the heading row. */
  action?: { label: string; href: string }
  /** Center the heading block (useful for marketing rows). */
  centered?: boolean
  className?: string
  /** Extra classes for the inner max-width container. */
  containerClassName?: string
}

/**
 * Consistent page section wrapper with a shared heading treatment and
 * spacing rhythm. Server-safe and standalone — pages opt in.
 */
export function Section({
  children,
  title,
  subtitle,
  action,
  centered = false,
  className,
  containerClassName,
}: SectionProps) {
  return (
    <section className={cn('py-14', className)}>
      <div className={cn('mx-auto max-w-6xl px-4', containerClassName)}>
        {(title || action) && (
          <div
            className={cn(
              'mb-8 flex gap-4',
              centered
                ? 'flex-col items-center text-center'
                : 'flex-col items-start justify-between sm:flex-row sm:items-end'
            )}
          >
            <div className={centered ? 'max-w-2xl' : undefined}>
              {title && (
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-1.5 text-gray-600">{subtitle}</p>
              )}
            </div>
            {action && (
              <Link
                href={action.href}
                className="group inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-blue-600 outline-none transition-colors hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {action.label}
                <ArrowRight
                  width={16}
                  height={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}
