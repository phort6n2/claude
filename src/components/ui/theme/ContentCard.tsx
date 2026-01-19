import { ReactNode } from 'react'

interface ContentCardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export function ContentCard({
  children,
  className = '',
  padding = 'md',
  hover = false,
}: ContentCardProps) {
  return (
    <div
      className={`
        bg-white rounded-2xl border border-gray-100 shadow-sm
        ${hover ? 'hover:shadow-md hover:border-gray-200 transition-all duration-300' : ''}
        ${paddingStyles[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

interface ContentCardHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  variant?: 'default' | 'warning' | 'error' | 'success'
}

const headerVariants = {
  default: 'bg-white border-gray-200',
  warning: 'bg-amber-50 border-amber-200',
  error: 'bg-red-50 border-red-200',
  success: 'bg-green-50 border-green-200',
}

const headerIconVariants = {
  default: 'bg-gray-100 text-gray-600',
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-red-100 text-red-600',
  success: 'bg-green-100 text-green-600',
}

const headerTextVariants = {
  default: 'text-gray-900',
  warning: 'text-amber-900',
  error: 'text-red-900',
  success: 'text-green-900',
}

export function ContentCardHeader({
  title,
  subtitle,
  icon,
  actions,
  variant = 'default',
}: ContentCardHeaderProps) {
  return (
    <div className={`p-4 border-b ${headerVariants[variant]} flex items-center justify-between`}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`p-2 rounded-lg ${headerIconVariants[variant]}`}>
            <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
          </div>
        )}
        <div>
          <h3 className={`font-semibold ${headerTextVariants[variant]}`}>{title}</h3>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// Themed card with gradient accent at top
interface AccentCardProps {
  children: ReactNode
  accentColor?: 'blue' | 'green' | 'violet' | 'amber' | 'red' | 'cyan' | 'gray'
  className?: string
}

const accentColors = {
  blue: 'from-blue-400 to-indigo-400',
  green: 'from-emerald-400 to-teal-400',
  violet: 'from-violet-400 to-purple-400',
  amber: 'from-amber-400 to-orange-400',
  red: 'from-red-400 to-orange-400',
  cyan: 'from-cyan-400 to-blue-400',
  gray: 'from-gray-300 to-gray-400',
}

export function AccentCard({ children, accentColor = 'blue', className = '' }: AccentCardProps) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      <div className={`h-1.5 bg-gradient-to-r ${accentColors[accentColor]}`} />
      {children}
    </div>
  )
}

// Info box for displaying key-value pairs
interface InfoBoxProps {
  icon?: ReactNode
  label: string
  value: string | number | ReactNode
  variant?: 'default' | 'blue' | 'green' | 'amber'
}

const infoBoxVariants = {
  default: 'bg-gray-50',
  blue: 'bg-blue-50',
  green: 'bg-green-50',
  amber: 'bg-amber-50',
}

const infoBoxIconVariants = {
  default: 'bg-white text-gray-600',
  blue: 'bg-white text-blue-600',
  green: 'bg-white text-green-600',
  amber: 'bg-white text-amber-600',
}

export function InfoBox({ icon, label, value, variant = 'default' }: InfoBoxProps) {
  return (
    <div className={`${infoBoxVariants[variant]} rounded-xl p-3`}>
      <div className="flex items-center gap-2">
        {icon && (
          <div className={`${infoBoxIconVariants[variant]} rounded-lg p-1.5 shadow-sm`}>
            <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          </div>
        )}
        <div>
          <p className="text-lg font-bold text-gray-900">{value}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
        </div>
      </div>
    </div>
  )
}

// Section divider with title
export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-lg font-semibold text-gray-900 mb-4 ${className}`}>{children}</h2>
  )
}

// Empty state component
interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="p-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="[&>svg]:h-8 [&>svg]:w-8 text-gray-400">{icon}</span>
      </div>
      <p className="text-gray-500 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
