import {
  PhoneMissed,
  PhoneOff,
  CalendarCheck,
  FileText,
  PhoneForwarded,
  HelpCircle,
  ThumbsUp,
  Lightbulb,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { callBadge, type CallBadgeKind, type CallBadgeTone } from '@/lib/call-analysis/rating'

/**
 * The badge a call wears in a leads list — portal and admin alike.
 *
 * ONE component for both, because they were two copies of the same chip, and
 * the words on it are the whole problem this replaces: see `callBadge()` for
 * why "Missed" had to stop meaning a poorly graded ANSWERED call.
 *
 * Icons instead of the faces the old rating used. A frowning emoji beside a
 * call the owner answered and handled reads as a verdict on a person; an icon
 * says which kind of call it was.
 */

const ICONS: Record<CallBadgeKind, LucideIcon> = {
  missed: PhoneMissed,
  'not-connected': PhoneOff,
  booked: CalendarCheck,
  quote: FileText,
  callback: PhoneForwarded,
  info: HelpCircle,
  'well-handled': ThumbsUp,
  coaching: Lightbulb,
  analysing: Loader2,
}

export const TONE_CLASSES: Record<CallBadgeTone, { chip: string; tile: string }> = {
  red: { chip: 'bg-red-50 text-red-700 ring-1 ring-red-200', tile: 'bg-red-50 border-red-200 text-red-700' },
  green: { chip: 'bg-emerald-50 text-emerald-700', tile: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  blue: { chip: 'bg-blue-50 text-blue-700', tile: 'bg-blue-50 border-blue-200 text-blue-700' },
  slate: { chip: 'bg-slate-100 text-slate-700', tile: 'bg-slate-50 border-slate-200 text-slate-700' },
  amber: { chip: 'bg-amber-50 text-amber-800', tile: 'bg-amber-50 border-amber-200 text-amber-800' },
  gray: { chip: 'bg-gray-100 text-gray-600', tile: 'bg-gray-50 border-gray-200 text-gray-600' },
}

export function callBadgeIcon(kind: CallBadgeKind): LucideIcon {
  return ICONS[kind]
}

export function CallBadgeChip({
  callStatus,
  durationSecs,
  analysis,
}: {
  callStatus?: string | null
  durationSecs?: number | null
  analysis?: { status: string; outcome: string | null; score: number | null } | null
}) {
  const badge = callBadge({ callStatus, durationSecs, analysis })
  if (!badge) return null
  const Icon = ICONS[badge.kind]
  const tone = TONE_CLASSES[badge.tone]
  // The rubric score stays in the tooltip, as it always was — it is detail
  // for whoever hovers, never the headline.
  const scoreNote =
    analysis?.score != null && !badge.needsCallback && badge.kind !== 'analysing'
      ? ` (coaching score ${analysis.score}/100)`
      : ''

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${tone.chip}`}
      title={`${badge.label} — ${badge.detail}${scoreNote}`}
    >
      <Icon className={`h-2.5 w-2.5 shrink-0 ${badge.kind === 'analysing' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {badge.label}
    </span>
  )
}
