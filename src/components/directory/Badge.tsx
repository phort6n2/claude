import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'gray' | 'blue' | 'green' | 'amber' | 'solid'

const variants: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-600',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/10',
  green: 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/10',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10',
  solid: 'bg-blue-600 text-white shadow-sm',
}

/**
 * Small pill/label. Server-safe and standalone.
 * Use for tags, trust signals, or status chips.
 */
export function Badge({
  children,
  variant = 'gray',
  className,
}: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
