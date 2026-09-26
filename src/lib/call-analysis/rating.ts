import { callOutcome, isMissedCall } from '@/lib/call-display'

/**
 * WHAT A CALL SHOWS AS, everywhere a call is listed — the portal leads list,
 * the admin leads list, and the coaching report's headline. One decision, so
 * the three can never describe one call three ways again.
 *
 * "MISSED" MEANT TWO OPPOSITE THINGS, AND SHOPS READ THE WRONG ONE. The old
 * rating put "🙁 Missed" on an ANSWERED call that the coaching model graded
 * poorly — shorthand for "opportunities were missed". Shops read it as a
 * missed CALL, which is the only thing "missed" means next to a phone icon.
 * Worse, the portal list never read `Lead.callStatus` at all, so a call that
 * genuinely rang out carried NO marker while one the shop answered and talked
 * on for four minutes said "Missed". The home screen's "3 missed calls in the
 * last 7 days" (which does read callStatus) sent the shop into a list where
 * those three were unmarked and three different ones were — exactly
 * backwards, and the one screen whose job is telling a shop who to ring back.
 *
 * THE RULES THAT FOLLOW FROM THAT:
 *
 * - "Missed call" means a call NOBODY ANSWERED, from `callStatus` via
 *   `callOutcome()`, and nothing else ever uses the word. It is the only red
 *   badge, because it is the only one that needs the shop to act: ring back.
 *   `failed` is the one exception to the wording — the forward never
 *   connected, the phone never rang, and `call-display.ts` records why saying
 *   so is ours, not theirs. It is still red, because it still needs a call
 *   back.
 * - The coaching grade describes WHAT HAPPENED ON THE CALL in the model's own
 *   outcome words — booked, quote given, callback set — never a lead state.
 *   "In progress" read as the lead's status and went on saying so after the
 *   shop marked the job booked; "Quote given" is still true about that call a
 *   month later. The coaching report's badge already used these words
 *   ("Quote Sent") beside a face saying "In progress": one card, two
 *   vocabularies, one call.
 * - A call that was only a QUESTION is not graded as a sale. The rubric is a
 *   sales rubric; a parts-status call or "are you open Saturday" scores badly
 *   against it and used to wear a red face for answering a question well.
 * - Not booked is AMBER at worst — "Coaching tips", pointing at the pointers.
 *   Red is reserved for the calls that need a call back, so a shop scanning
 *   the list for red finds exactly the people to ring.
 */

/**
 * WHERE THE COACHING PROMPT SAYS A COMPETENT CALL STARTS. The prompt tells
 * the model "a competent call that moves the customer forward belongs in the
 * 65–80 range", and the display used to split that band at 70 — so a call the
 * model had scored as competent (65–69) was shown as "opportunities were
 * missed". Both now read this one constant; the prompt interpolates it.
 */
export const COMPETENT_SCORE = 65

/**
 * THE LOWEST SCORE A BOOKED CALL GETS. Booking the job is the whole point of
 * the call, and a booked call is praised, not marked: at 75 it read as a C in
 * a report written for the person who won the job. The prompt interpolates
 * it, so the grader and anything drawn from its scores agree.
 */
export const BOOKED_SCORE_FLOOR = 80

/**
 * What the pipeline stores, after the rules the PROMPT asks for are made true
 * in code as well. The prompt asks; this guarantees — a booked call scored
 * below the floor would show in the trend as a dip on the week the shop did
 * best, and a model does not follow every instruction every time.
 */
export function settleAnalysis<T extends { score: number; outcome: string; rep_name?: unknown }>(
  analysis: T
): T & { rep_name: string | null } {
  const score =
    analysis.outcome === 'booked' ? Math.max(analysis.score, BOOKED_SCORE_FLOOR) : analysis.score
  return { ...analysis, score, rep_name: normalizeRepName(analysis.rep_name) }
}

/**
 * A rep's name as the model heard it in their own introduction — "thanks for
 * calling, this is Mike" — reduced to a first name for grouping.
 *
 * Only ever what the rep SAID, never inferred: a name guessed from a voice or
 * taken from the customer's half of the call would pin one person's scores on
 * another, in front of their boss. Anything that is not a plausible single
 * first name is dropped rather than repaired.
 */
export function normalizeRepName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const token = raw.trim().split(/\s+/)[0] ?? ''
  if (/^(unknown|none|null|rep|agent|n\/?a|the|shop)$/i.test(token)) return null
  // ANY letter, not A-Z: the first cut stripped accents and turned "José"
  // into "Jos" — a mangled name on a chart the person's boss reads.
  const first = token.replace(/[^\p{L}'-]/gu, '')
  if (first.length < 2 || first.length > 20) return null
  // Title-case only a name given in ONE case ("mike", "MIKE"), so the same
  // person groups as one line; "McKenzie" and "O'Neil" keep their own shape.
  const oneCase = first === first.toLowerCase() || first === first.toUpperCase()
  const body = oneCase ? first.toLowerCase() : first
  return body[0].toUpperCase() + body.slice(1)
}

export type CallBadgeKind =
  | 'missed'
  | 'not-connected'
  | 'booked'
  | 'quote'
  | 'callback'
  | 'info'
  | 'well-handled'
  | 'coaching'
  | 'analysing'

export type CallBadgeTone = 'red' | 'green' | 'blue' | 'slate' | 'amber' | 'gray'

export interface CallBadge {
  kind: CallBadgeKind
  /** Short enough for a chip on a 360px phone. */
  label: string
  /** One sentence, for a tooltip or the report headline. */
  detail: string
  tone: CallBadgeTone
  /** The shop should ring this person back. Only ever a missed call. */
  needsCallback: boolean
}

interface CallBadgeInput {
  callStatus?: string | null
  durationSecs?: number | null
  analysis?: { status: string; outcome: string | null; score: number | null } | null
}

/**
 * The badge for one call, or null when there is nothing true to say.
 *
 * Null is the honest answer for a form lead, for a phone lead that predates
 * `callStatus`, and for an answered call with no coaching yet: a badge is a
 * claim, and a guess is how "missed" came to mean two things.
 */
export function callBadge({ callStatus, durationSecs, analysis }: CallBadgeInput): CallBadge | null {
  // A call nobody answered outranks everything: it is the one that needs the
  // shop to act, and it has no recording, so no analysis could contradict it.
  if (isMissedCall(callStatus)) {
    const outcome = callOutcome(callStatus, durationSecs)
    if (outcome.kind === 'failed') {
      return {
        kind: 'not-connected',
        label: "Call didn't connect",
        detail: outcome.note,
        tone: 'red',
        needsCallback: true,
      }
    }
    const why = outcome.kind === 'busy' ? ' · busy' : outcome.kind === 'canceled' ? ' · hung up' : ''
    return {
      kind: 'missed',
      label: `Missed call${why}`,
      detail: outcome.note,
      tone: 'red',
      needsCallback: true,
    }
  }

  if (!analysis || analysis.status === 'FAILED') return null
  if (analysis.status !== 'COMPLETE' || analysis.score == null) {
    return {
      kind: 'analysing',
      label: 'Coaching…',
      detail: 'The call is being transcribed and reviewed. Coaching appears here in a minute or two.',
      tone: 'gray',
      needsCallback: false,
    }
  }

  switch (analysis.outcome) {
    // Booking is the point, whatever the technique scored.
    case 'booked':
      return {
        kind: 'booked',
        label: 'Booked on call',
        detail: 'The job was booked on this call.',
        tone: 'green',
        needsCallback: false,
      }
    case 'quote_sent':
      return {
        kind: 'quote',
        label: 'Quote given',
        detail: 'A price was given on this call. Worth a follow-up if they have not booked.',
        tone: 'blue',
        needsCallback: false,
      }
    case 'callback_scheduled':
      return {
        kind: 'callback',
        label: 'Callback set',
        detail: 'A callback was arranged on this call — make sure it happens when you said.',
        tone: 'blue',
        needsCallback: false,
      }
    case 'info_only':
      return {
        kind: 'info',
        label: 'Question call',
        detail: 'The caller had a question rather than a job to book, so this call is not graded as a sale.',
        tone: 'gray',
        needsCallback: false,
      }
  }

  // Not booked, and not one of the named next steps: grade the HANDLING, in
  // words that make no claim about whether the lead is lost.
  if (analysis.score >= COMPETENT_SCORE) {
    return {
      kind: 'well-handled',
      label: 'Well handled',
      detail: 'Not booked on this call, but it was handled well — the customer may simply not have been ready.',
      tone: 'slate',
      needsCallback: false,
    }
  }
  return {
    kind: 'coaching',
    label: 'Coaching tips',
    detail: 'Not booked on this call. The coaching has specific things to try next time.',
    tone: 'amber',
    needsCallback: false,
  }
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
  // No examples of CLAIMS in the label. It used to read "(warranty, OEM glass,
  // certified techs, ADAS)", which coached every shop to say those things —
  // and a shop without certified techs can only follow that advice by saying
  // something untrue about itself (§2). What sets a shop apart is theirs to
  // name.
  value_differentiators: 'Mention what genuinely sets your shop apart',
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
