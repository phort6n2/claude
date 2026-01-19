import { ReactNode } from 'react'

// Base skeleton pulse animation
function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 animate-pulse rounded ${className}`} />
}

// Stat card skeleton
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-5 bg-gradient-to-br from-gray-100 to-gray-50 animate-pulse">
      <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
      <div className="h-10 w-20 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-16 bg-gray-200 rounded" />
    </div>
  )
}

// Stat cards grid skeleton
export function StatCardsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[...Array(count)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Table/list row skeleton
export function TableRowSkeleton() {
  return (
    <div className="p-4 flex items-center gap-4 animate-pulse">
      <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
      <div className="flex-1">
        <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-48 bg-gray-200 rounded" />
      </div>
      <div className="h-4 w-16 bg-gray-200 rounded" />
    </div>
  )
}

// Card skeleton
export function CardSkeleton({ height = 'h-48' }: { height?: string }) {
  return <div className={`bg-gray-200 rounded-2xl animate-pulse ${height}`} />
}

// Content card with header skeleton
export function ContentCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center gap-3 animate-pulse">
        <div className="w-10 h-10 bg-gray-200 rounded-lg" />
        <div className="h-5 w-32 bg-gray-200 rounded" />
      </div>
      <div className="divide-y divide-gray-100">
        {[...Array(rows)].map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

// Page header skeleton
export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-8 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-200" />
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-10 w-24 bg-gray-200 rounded-xl" />
        <div className="h-10 w-32 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}

// Grid of card skeletons
export function CardGridSkeleton({ count = 8, cols = 4 }: { count?: number; cols?: 2 | 3 | 4 }) {
  const colsClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  }[cols]

  return (
    <div className={`grid ${colsClass} gap-5`}>
      {[...Array(count)].map((_, i) => (
        <CardSkeleton key={i} height="h-96" />
      ))}
    </div>
  )
}

// Search bar skeleton
export function SearchBarSkeleton() {
  return (
    <div className="bg-gray-200 rounded-xl h-16 mb-6 animate-pulse" />
  )
}

// Text line skeleton
export function TextSkeleton({ width = 'w-full' }: { width?: string }) {
  return <SkeletonPulse className={`h-4 ${width}`} />
}

// Chart skeleton (bar chart style)
export function ChartSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
      <div className="h-5 w-32 bg-gray-200 rounded mb-6" />
      <div className="flex items-end justify-between gap-2 h-32">
        {[40, 70, 50, 90, 60, 30, 80].map((height, i) => (
          <div key={i} className="flex-1 bg-gray-200 rounded-t-lg" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="h-3 w-8 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  )
}

// Ring/donut chart skeleton
export function RingSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
      <div className="flex items-center gap-6">
        <div className="w-[120px] h-[120px] rounded-full border-8 border-gray-200" />
        <div className="flex-1">
          <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-200 rounded" />
            <div className="h-4 w-full bg-gray-200 rounded" />
            <div className="h-4 w-3/4 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Full page skeleton wrapper
export function FullPageSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="p-6 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  )
}

// Complete dashboard page skeleton
export function DashboardSkeleton() {
  return (
    <FullPageSkeleton>
      <PageHeaderSkeleton />
      <StatCardsGridSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <ContentCardSkeleton rows={5} />
    </FullPageSkeleton>
  )
}

// Complete list page skeleton
export function ListPageSkeleton() {
  return (
    <FullPageSkeleton>
      <PageHeaderSkeleton />
      <StatCardsGridSkeleton count={4} />
      <SearchBarSkeleton />
      <CardGridSkeleton count={8} cols={4} />
    </FullPageSkeleton>
  )
}
