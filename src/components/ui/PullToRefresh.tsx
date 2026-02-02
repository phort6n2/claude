'use client'

import { Loader2, ArrowDown } from 'lucide-react'

interface PullToRefreshIndicatorProps {
  pullDistance: number
  threshold: number
  isRefreshing: boolean
}

export function PullToRefreshIndicator({
  pullDistance,
  threshold,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null

  const progress = Math.min(pullDistance / threshold, 1)
  const rotation = progress * 180

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center justify-center"
      style={{
        top: Math.max(8, pullDistance - 40),
        opacity: isRefreshing ? 1 : progress,
        transition: isRefreshing ? 'none' : 'opacity 0.1s',
      }}
    >
      <div className="bg-white rounded-full shadow-lg p-2 border border-gray-200">
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        ) : (
          <ArrowDown
            className="h-5 w-5 text-gray-600 transition-transform"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        )}
      </div>
    </div>
  )
}
