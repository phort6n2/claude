import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Trust signal: every shop in the directory is independent / locally owned,
 * not a national chain. This is the directory's core differentiator, so we
 * surface it as a badge on cards and shop pages.
 */
export function IndependentBadge({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md'
  className?: string
}) {
  const sm = size === 'sm'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-emerald-50 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10',
        sm ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className
      )}
      title="Independently owned — not a national chain"
    >
      <ShieldCheck width={sm ? 12 : 15} height={sm ? 12 : 15} />
      {sm ? 'Independent' : 'Independent · locally owned'}
    </span>
  )
}
