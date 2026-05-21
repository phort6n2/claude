'use client'

import { ArrowUp } from 'lucide-react'

interface NewLeadsBannerProps {
  count: number
  onClick: () => void
  /** Sticky top offset in pixels (to clear sticky headers). Defaults to 0. */
  topOffset?: number
}

export function NewLeadsBanner({ count, onClick, topOffset = 0 }: NewLeadsBannerProps) {
  if (count <= 0) return null

  return (
    <div
      className="sticky z-20 pt-2 pb-2 flex justify-center pointer-events-none"
      style={{ top: topOffset }}
    >
      <button
        onClick={onClick}
        className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium shadow-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        <ArrowUp className="h-4 w-4" />
        {count === 1 ? '1 new lead' : `${count} new leads`} · tap to load
      </button>
    </div>
  )
}
