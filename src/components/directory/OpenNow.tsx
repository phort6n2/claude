'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import type { BusinessHours } from '@/lib/directory/types'
import { openStatus, type OpenStatus } from '@/lib/directory/hours'
import { cn } from '@/lib/utils'

/**
 * Live "Open now / Closed" badge. Computes in the visitor's local time on the
 * client (renders nothing on the server pass to avoid a hydration mismatch,
 * then fills in). Uses the device clock — good enough for an at-a-glance signal.
 */
export function OpenNow({
  hours,
  className,
}: {
  hours: BusinessHours[]
  className?: string
}) {
  const [status, setStatus] = useState<OpenStatus | null>(null)

  useEffect(() => {
    setStatus(openStatus(hours, new Date()))
  }, [hours])

  // Shops with no hours on file (e.g. imported listings) show no badge rather
  // than a misleading "Closed".
  if (!hours || hours.length === 0) return null
  if (!status) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        status.open
          ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/10'
          : 'bg-gray-100 text-gray-500',
        className
      )}
    >
      <Clock width={12} height={12} />
      {status.label}
    </span>
  )
}
