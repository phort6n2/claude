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
