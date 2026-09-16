/**
 * Call facts and labels with NO imports.
 *
 * A LEAF ON PURPOSE. These are needed by a client component and by the server
 * lib that queries for them, and the obvious home — `call-lead.ts` — reaches
 * push-notifications and from there `web-push`, which is Node-only. Importing
 * one function from it dragged `net` and `tls` into the browser bundle and
 * failed the build. Anything both sides need lives here instead.
 */

/**
 * The Twilio statuses that mean nobody picked up.
 *
 * ONE LIST. `call-lead.ts` alerts on it, the portal counts on it, and the
 * home-screen banner queries on it — three places that must agree about what
 * "missed" means, or a shop is told about a call the page will not show them.
 */
export const MISSED_CALL_STATUSES = ['no-answer', 'busy', 'failed', 'canceled'] as const

/**
 * A call the shop did not pick up needs somebody to act NOW. One they
 * answered is a record: they already had the conversation, and the alert
 * exists so the number is in their inbox when they want to ring back.
 */
export function isMissedCall(status: string | null | undefined): boolean {
  if (!status) return false
  return (MISSED_CALL_STATUSES as readonly string[]).includes(status)
}

/**
 * WHICH KIND OF MISSED, and whether the shop's phone actually RANG.
 *
 * "NOBODY PICKED UP" IS A CLAIM ABOUT THE SHOP, and three of the four missed
 * statuses do not support it. Every one of them used to produce that one
 * sentence, so a shop whose line could not be reached at all was told they had
 * ignored a ringing phone — and the first report of this was exactly that: a
 * NorthStar alert headed "Missed Call / Nobody picked up", and the shop saying
 * the phone never rang. Both were true. The alert was the thing that was wrong.
 *
 * - `no-answer` — it rang, for the full `timeout`, and nobody answered. This
 *   is the ONLY status that means what the old sentence said.
 * - `busy` — the line was engaged. Nothing rang.
 * - `failed` — Twilio could not place the call to `forwardTo` at all: a
 *   disconnected or mistyped number, a carrier rejection, a geo permission.
 *   Nothing rang, and this one is OURS, not theirs — the copy says so.
 * - `canceled` — the caller hung up while it was still ringing. With
 *   `answerOnBridge` they hear real ringing, so the shop's phone may have rung
 *   briefly or, on a slow carrier hand-off, not at all.
 *
 * WHY THIS MATTERS BEYOND THE COPY: a `forwardTo` that can never connect
 * writes a "missed call" lead on every single call. A lead IS created, so
 * nothing looks absent — no missing row, no error, no silence to notice. It is
 * the `<Dial record>` class of failure with a wrong row in place of no row,
 * which is worse: the shop is blamed monthly for calls that never reached them.
 */
export type CallOutcomeKind = 'answered' | 'no-answer' | 'busy' | 'failed' | 'canceled' | 'unknown'

export interface CallOutcome {
  kind: CallOutcomeKind
  missed: boolean
  /**
   * Did the shop's phone ring? `null` where it genuinely cannot be known —
   * never guessed, because the guess is the bug this replaced.
   */
  rang: boolean | null
  /** For an operator, on the lead page. */
  label: string
  /** For the shop, in the alert. Says what happened and whose problem it is. */
  note: string
}

export function callOutcome(
  status: string | null | undefined,
  durationSeconds?: number | null
): CallOutcome {
  const spoke = durationSeconds && durationSeconds > 0 ? durationSeconds : null
  switch (status) {
    case 'completed':
    case 'answered':
      return {
        kind: 'answered',
        missed: false,
        rang: true,
        label: 'Answered',
        note: 'Somebody answered. Nothing to do — this is your record of the call, with the number to hand if you need to ring them back.',
      }
    case 'no-answer':
      return {
        kind: 'no-answer',
        missed: true,
        rang: true,
        label: 'Rang, not answered',
        note: 'Your line rang and nobody picked up. The caller left no details — calling straight back is the whole opportunity.',
      }
    case 'busy':
      return {
        kind: 'busy',
        missed: true,
        rang: false,
        label: 'Line engaged',
        note: 'Your line was engaged, so this one never rang through. The caller left no details — calling straight back is the whole opportunity.',
      }
    case 'failed':
      return {
        kind: 'failed',
        missed: true,
        rang: false,
        // OURS. A shop reading this has done nothing wrong, and telling them
        // to answer the phone faster would be the worst sentence in the app.
        label: 'Could not connect to your line',
        note: 'We could not connect this call to your line, so your phone never rang — that is our end, not yours, and we are on it. The caller left no details, so it is still worth ringing them straight back.',
      }
    case 'canceled':
      return {
        kind: 'canceled',
        missed: true,
        // Unknowable: they hang up during ringing, and how much of that
        // reached the handset depends on the carrier.
        rang: null,
        label: 'Caller hung up while ringing',
        note: `The caller hung up before anyone answered${
          spoke ? `, after about ${spoke} second${spoke === 1 ? '' : 's'}` : ''
        } — your phone may only have rung for a moment. They left no details, so ringing straight back is the whole opportunity.`,
      }
    default:
      return {
        kind: 'unknown',
        missed: false,
        rang: null,
        label: status ? `Twilio reported "${status}"` : 'Outcome not reported yet',
        note: 'This is your record of the call, with the number to hand if you need to ring them back.',
      }
  }
}

/** "7am", "12pm", "6pm" — how a shop owner says an hour. */
export function hourLabel(hour: number): string {
  const h = ((hour + 11) % 12) + 1
  return `${h}${hour < 12 ? 'am' : 'pm'}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayLabel(day: number): string {
  return WEEKDAYS[day] ?? ''
}

export interface MissedCall {
  id: string
  /** Caller's number, as dialled. Null when Twilio withheld it. */
  phone: string | null
  at: string
  /** Already acted on — status moved off NEW, or somebody touched it. */
  handled: boolean
  /** Which tracking line they rang. */
  line: string | null
}

export interface CallPatterns {
  /** Calls per hour 0-23, in the shop's timezone. */
  byHour: number[]
  /** Calls per weekday, 0 = Sunday. */
  byWeekday: number[]
  totalCalls: number
  missedCalls: number
  answeredCalls: number
  /** Missed as a percentage of calls whose outcome we know. */
  missedRate: number
  /** The busiest run of hours, as a label — "7am to 10am". */
  busiestWindow: string | null
  /** The hour with the worst answer rate, when there is enough to say so. */
  worstHour: { hour: number; missed: number; total: number } | null
  daysCovered: number
}

export interface CallInsight {
  patterns: CallPatterns
  recentMissed: MissedCall[]
  timezone: string
}
