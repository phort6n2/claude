'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw } from 'lucide-react'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 ${className}`}>
      <div className="p-6 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  actions?: ReactNode
  onRefresh?: () => void
  isRefreshing?: boolean
  refreshLabel?: string
  lastUpdated?: string
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  actions,
  onRefresh,
  isRefreshing = false,
  refreshLabel = 'Refresh',
  lastUpdated,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        {backHref && (
          <Link
            href={backHref}
            className="p-2.5 bg-white rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-gray-700 transition-all shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {refreshLabel}
          </button>
        )}
        {lastUpdated && (
          <div className="text-xs text-gray-400 bg-white/50 px-3 py-2 rounded-lg border border-gray-100">
            Updated {lastUpdated}
          </div>
        )}
        {actions}
      </div>
    </div>
  )
}

// Full width container for larger screens
export function WidePageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 ${className}`}>
      <div className="p-6 max-w-[1800px] mx-auto">
        {children}
      </div>
    </div>
  )
}
