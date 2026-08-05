'use client'

import {
  getLeadChannelWithDuplicates,
  CHANNEL_META,
  type LeadAttribution,
} from '@/lib/lead-channel'

/**
 * Compact "where did this lead come from" badge — paid ads vs organic vs the
 * rest. Every lead gets one, including phone calls that arrived without a click
 * id: those read "Untracked", which is more useful than a blank space.
 */
export function ChannelBadge({
  lead,
}: {
  lead: LeadAttribution & { duplicates?: LeadAttribution[] | null }
}) {
  const { channel, source, reason } = getLeadChannelWithDuplicates(lead)
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
