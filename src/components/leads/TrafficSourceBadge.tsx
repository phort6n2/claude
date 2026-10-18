import { TRAFFIC_SOURCES, trafficSourceLabel, type TrafficSource } from '@/lib/traffic-source'

/**
 * Which platform sent the lead — Google, Microsoft, Meta — as decided on
 * landing (lib/traffic-source.ts) or, for a call or text, by the number that
 * was dialled. Shared by the admin list, master leads and the portal, so one
 * lead reads the same everywhere.
 */

const TONE: Record<TrafficSource, string> = {
  google: 'bg-blue-50 text-blue-700 border-blue-200',
  microsoft: 'bg-teal-50 text-teal-700 border-teal-200',
  meta: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
  direct: 'bg-gray-50 text-gray-600 border-gray-200',
  unknown: 'bg-white text-gray-400 border-gray-200',
}

export function TrafficSourceBadge({
  source,
  medium,
  className = '',
}: {
  source: string | null | undefined
  medium?: string | null
  className?: string
}) {
  const key = (TRAFFIC_SOURCES as readonly string[]).includes(source || '') ? (source as TrafficSource) : 'unknown'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE[key]} ${className}`}
      title="Where this lead came from"
    >
      {trafficSourceLabel(key, medium)}
    </span>
  )
}

/** Options for a "Source" filter, in the order people ask about them. */
export const TRAFFIC_SOURCE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'google', label: 'Google' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'meta', label: 'Meta' },
  { value: 'other', label: 'Other sites' },
  { value: 'direct', label: 'Direct' },
  { value: 'unknown', label: 'Unknown' },
]
