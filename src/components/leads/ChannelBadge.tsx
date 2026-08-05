'use client'

import {
  getLeadChannelWithDuplicates,
  CHANNEL_META,
  type LeadAttribution,
} from '@/lib/lead-channel'

/**
 * Compact "where did this lead come from" badge — paid ads vs organic vs the
 * rest. Renders nothing when there's no attribution at all (typically phone
 * calls, which arrive without a click id), so the lists don't fill with
 * meaningless "Unknown" chips.
 */
export function ChannelBadge({
  lead,
  showUnknown = false,
}: {
  lead: LeadAttribution & { duplicates?: LeadAttribution[] | null }
  showUnknown?: boolean
}) {
  const { channel, source, reason } = getLeadChannelWithDuplicates(lead)
  if (channel === 'unknown' && !showUnknown) return null

  const meta = CHANNEL_META[channel]
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.bg} ${meta.text}`}
      title={`${meta.description}${source ? ` — ${source}` : ''}\n${reason}`}
    >
      {meta.label}
      {source && channel === 'paid' && (
        <span className="font-normal opacity-75">· {source.replace(' Ads', '')}</span>
      )}
    </span>
  )
}
