/**
 * Structured opening hours, and the one string the rest of the app wants.
 *
 * The intake collects hours as data — a row per day, open and close times —
 * because that is what a person can fill in without inventing a format. But
 * everything downstream (`ClientLocation.hours`, the site's location cards)
 * renders ONE free-text line verbatim, and that stays the storage format:
 * plenty of shops have hours an editor cannot express ("by appointment
 * Sundays"), and free text is the format an admin can always fix by hand.
 * So the schedule compresses to text at the moment it leaves the intake,
 * and nothing downstream learns a second format.
 */

export const HOURS_DAYS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
] as const

export type DayKey = (typeof HOURS_DAYS)[number]['key']

export interface DayHours {
  /** 24h "HH:MM", straight from an <input type="time">. */
  open: string
  close: string
}

/** A missing or null day is closed. */
export type HoursSchedule = Partial<Record<DayKey, DayHours | null>>

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isHoursSchedule(value: unknown): value is HoursSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = new Set<string>(HOURS_DAYS.map((d) => d.key))
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (!keys.has(key)) return false
    if (day === null || day === undefined) continue
    if (typeof day !== 'object') return false
    const { open, close } = day as Record<string, unknown>
    if (typeof open !== 'string' || typeof close !== 'string') return false
    if (!TIME.test(open) || !TIME.test(close)) return false
  }
  return true
}

/** "13:05" → "1:05 PM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const meridiem = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${meridiem}`
}

/**
 * "Mon–Fri 8:00 AM – 5:00 PM, Sat 9:00 AM – 2:00 PM". Consecutive days with
 * identical times collapse into a range; closed days are simply absent, the
 * way hours read on a shop door. Empty schedule → empty string.
 */
export function hoursText(schedule: HoursSchedule): string {
  const spans: Array<{ from: number; to: number; open: string; close: string }> = []
  HOURS_DAYS.forEach((day, index) => {
    const hours = schedule[day.key]
    if (!hours || !hours.open || !hours.close) return
    const last = spans[spans.length - 1]
    if (last && last.to === index - 1 && last.open === hours.open && last.close === hours.close) {
      last.to = index
    } else {
      spans.push({ from: index, to: index, open: hours.open, close: hours.close })
    }
  })
  return spans
    .map((span) => {
      const days =
        span.from === span.to
          ? HOURS_DAYS[span.from].short
          : `${HOURS_DAYS[span.from].short}–${HOURS_DAYS[span.to].short}`
      return `${days} ${formatTime(span.open)} – ${formatTime(span.close)}`
    })
    .join(', ')
}

/**
 * Whatever an intake's hours answer holds, as the display string — the
 * structured schedule from the editor, or plain text from an answer typed
 * before the editor existed. Null when there is nothing to show.
 */
export function hoursAnswerText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (isHoursSchedule(value)) return hoursText(value) || null
  return null
}
