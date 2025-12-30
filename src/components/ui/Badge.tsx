import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-gray-100 text-gray-800': variant === 'default',
          'bg-green-100 text-green-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-red-100 text-red-800': variant === 'error',
          'bg-blue-100 text-blue-800': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const variant = {
    DRAFT: 'default',
    SCHEDULED: 'info',
    GENERATING: 'warning',
    PUBLISHING: 'warning',
    PUBLISHED: 'success',
    FAILED: 'error',
    PAUSED: 'warning',
    ACTIVE: 'success',
    ONBOARDING: 'info',
  }[status] as BadgeProps['variant'] || 'default'

  return <Badge variant={variant}>{status}</Badge>
}
