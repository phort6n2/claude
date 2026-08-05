/**
 * Call rating + coaching focus taxonomy.
 *
 * The numeric 0-100 rubric score is useful internally, but as a client-facing
 * grade it reads harsh — a rep who books the job can still score in the 50s on
 * technique. So what the client sees is a three-level rating driven primarily by
 * the OUTCOME:
 *
 *   green  — the job got booked. Always green. Booking is the point.
 *   yellow — real progress (quote sent, callback scheduled), or a call the rep
 *            handled well that simply didn't convert.
 *   red    — no progress and the call had coachable problems.
 *
 * The score still drives the detailed breakdown; it just no longer decides the
 * headline face on its own.
 */

export type CallRating = 'green' | 'yellow' | 'red'

/** A well-run call that didn't convert shouldn't be graded red. */
const WELL_HANDLED_SCORE = 70

export function getCallRating(
  outcome: string | null | undefined,
  score: number | null | undefined
): CallRating {
  // Booking outranks everything — a booked job is a good call, full stop.
  if (outcome === 'booked') return 'green'

  if (outcome === 'quote_sent' || outcome === 'callback_scheduled') return 'yellow'

  // lost / info_only / unknown: red, unless the rep genuinely did the job well
  // and the customer just wasn't ready.
  if (typeof score === 'number' && score >= WELL_HANDLED_SCORE) return 'yellow'

  return 'red'
}

export const RATING_META: Record<
  CallRating,
  { emoji: string; label: string; description: string; text: string; bg: string; border: string }
> = {
  green: {
    emoji: '🙂',
    label: 'Booked',
    description: 'Job booked on this call.',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  yellow: {
    emoji: '😐',
    label: 'In progress',
    description: 'Moved forward, but not booked yet.',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  red: {
    emoji: '🙁',
    label: 'Missed',
    description: 'No booking and opportunities were missed.',
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
}

/**
 * Fixed coaching focus codes.
 *
 * Missed opportunities used to be free text, which meant aggregating them
 * across calls relied on exact string matching — too brittle to build a
 * "top 3 things to work on" list from. The model now tags every missed
 * opportunity with one of these codes, so counting them is reliable.
 *
 * Labels are written as the action to take, since they're shown to shop owners.
 */
export const FOCUS_AREAS = {
  discovery_vehicle: 'Get the vehicle year, make and model',
  discovery_damage: 'Ask where the damage is and how big it is',
  discovery_insurance: 'Find out if it is insurance or cash up front',
  discovery_location: 'Confirm mobile service vs in-shop, and location',
  value_differentiators: 'Mention what sets the shop apart (warranty, OEM glass, certified techs, ADAS)',
  value_urgency: 'Explain the safety reason not to wait',
  price_framing: 'Quote the price with value around it, not a bare number',
  ask_for_appointment: 'Actually ask for the appointment',
  objection_handling: 'Answer objections before dropping the price',
  specific_next_step: 'Lock in a specific day and time, not "we\'ll call you"',
  capture_contact: 'Capture name and phone before the call ends',
  talk_ratio: 'Let the customer talk more',
  interruptions: 'Stop talking over the customer',
  tone: 'Warmer, more confident tone',
} as const

export type FocusAreaCode = keyof typeof FOCUS_AREAS

export const FOCUS_AREA_CODES = Object.keys(FOCUS_AREAS) as FocusAreaCode[]

export function isFocusAreaCode(value: unknown): value is FocusAreaCode {
  return typeof value === 'string' && value in FOCUS_AREAS
}

export function focusAreaLabel(code: string): string {
  return isFocusAreaCode(code) ? FOCUS_AREAS[code] : code
}
