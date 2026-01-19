import { ReactNode } from 'react'

export type GradientVariant = 'blue' | 'green' | 'violet' | 'amber' | 'red' | 'cyan' | 'rose' | 'indigo'

interface GradientStatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  variant?: GradientVariant
  trend?: {
    value: number
    label?: string
  }
}

const variantStyles: Record<GradientVariant, { bg: string; shadow: string; lightText: string; subtleText: string }> = {
  blue: {
    bg: 'from-blue-500 to-blue-600',
    shadow: 'shadow-blue-500/25',
    lightText: 'text-blue-100',
    subtleText: 'text-blue-200',
  },
  green: {
    bg: 'from-emerald-500 to-emerald-600',
    shadow: 'shadow-emerald-500/25',
    lightText: 'text-emerald-100',
    subtleText: 'text-emerald-200',
  },
  violet: {
    bg: 'from-violet-500 to-violet-600',
    shadow: 'shadow-violet-500/25',
    lightText: 'text-violet-100',
    subtleText: 'text-violet-200',
  },
  amber: {
    bg: 'from-amber-500 to-orange-500',
    shadow: 'shadow-amber-500/25',
    lightText: 'text-amber-100',
    subtleText: 'text-amber-200',
  },
  red: {
    bg: 'from-red-500 to-red-600',
    shadow: 'shadow-red-500/25',
    lightText: 'text-red-100',
    subtleText: 'text-red-200',
  },
  cyan: {
    bg: 'from-cyan-500 to-cyan-600',
    shadow: 'shadow-cyan-500/25',
    lightText: 'text-cyan-100',
    subtleText: 'text-cyan-200',
  },
  rose: {
    bg: 'from-rose-500 to-rose-600',
    shadow: 'shadow-rose-500/25',
    lightText: 'text-rose-100',
    subtleText: 'text-rose-200',
  },
  indigo: {
    bg: 'from-indigo-500 to-indigo-600',
    shadow: 'shadow-indigo-500/25',
    lightText: 'text-indigo-100',
    subtleText: 'text-indigo-200',
  },
}

export function GradientStatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'blue',
  trend,
}: GradientStatCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${styles.bg} text-white shadow-lg ${styles.shadow}`}
    >
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8" />
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full -ml-6 -mb-6" />

      <div className="relative">
        <div className={`flex items-center gap-2 ${styles.lightText} text-sm mb-2`}>
          <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          {title}
        </div>
        <div className="text-4xl font-bold mb-1">{value}</div>
        {subtitle && <div className={`${styles.subtleText} text-xs`}>{subtitle}</div>}
        {trend && (
          <div className={`mt-2 flex items-center gap-1 text-xs ${styles.lightText}`}>
            <span className={trend.value >= 0 ? 'text-green-300' : 'text-red-300'}>
              {trend.value >= 0 ? '+' : ''}{trend.value}%
            </span>
            {trend.label && <span>{trend.label}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// Neutral variant for "healthy" or "no issues" states
export function NeutralStatCard({
  title,
  value,
  subtitle,
  icon,
  isAlert = false,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  isAlert?: boolean
}) {
  if (isAlert) {
    return (
      <GradientStatCard
        title={title}
        value={value}
        subtitle={subtitle}
        icon={icon}
        variant="red"
      />
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-gray-100 to-gray-50 text-gray-900 shadow-lg shadow-gray-200/50">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gray-200/50 rounded-full -mr-8 -mt-8" />

      <div className="relative">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
          <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          {title}
        </div>
        <div className="text-4xl font-bold mb-1">{value}</div>
        {subtitle && <div className="text-gray-400 text-xs">{subtitle}</div>}
      </div>
    </div>
  )
}

// Grid wrapper for stat cards
export function StatCardGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const colsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  }[cols]

  return <div className={`grid ${colsClass} gap-4 mb-6`}>{children}</div>
}
