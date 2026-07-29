'use client'

import { Navigation } from 'lucide-react'
import { haversineMiles, formatMiles } from '@/lib/directory/distance'
import { useViewerLocation } from '@/lib/directory/viewer-location'
import { cn } from '@/lib/utils'

/**
 * "12.4 mi away" on a shop.
 *
 * The map answers "where is this" but not "how far is it from me", which is
 * the question someone with a cracked windshield is actually asking. Renders
 * nothing until a location is known and nothing for a shop we couldn't
 * geocode, so it never shows a placeholder or a guess.
 */
export function DistanceBadge({
  lat,
  lng,
  className,
}: {
  lat?: number
  lng?: number
  className?: string
}) {
  const me = useViewerLocation()
  if (!me || typeof lat !== 'number' || typeof lng !== 'number') return null
  const miles = haversineMiles(me.lat, me.lng, lat, lng)
  // Beyond this the number stops being useful and starts being discouraging;
  // "480 mi away" on a directory listing reads as an error.
  if (miles > 250) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold text-brand-700',
        className
      )}
      title={me.precise ? 'From your location' : `Approximate, from ${me.label ?? 'your area'}`}
    >
      <Navigation width={11} height={11} />
      {formatMiles(miles)} away
      {!me.precise && <span className="font-normal text-gray-400">approx.</span>}
    </span>
  )
}
