/**
 * `openingHoursSpecification` for the business entity, read from the hours an
 * operator typed on the shop's location ("Mon–Fri 8:30AM–5PM · Sat–Sun
 * 9AM–3PM") — the same string the contact card already shows, so the markup
 * can never say something the page does not. Import-free, so
 * scripts/check-opening-hours.ts can run it.
 *
 * IT REFUSES RATHER THAN GUESSES. Hours are a claim a customer acts on — they
 * drive to a shop that is open, or ring a phone that is answered — and markup
 * is read by Google into the Business Profile panel as well as the result. So
 * every segment of the string must parse, or nothing is emitted: "9–5" with no
 * am/pm is not read as 9am–5pm, a day name nobody wrote is not inferred, and a
 * string in a shape this does not know produces no hours rather than wrong
 * ones. "Closed" days are left out, which is how schema.org says closed.
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
type Day = (typeof DAYS)[number]

const DAY_NAMES: Record<string, number> = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
}

export interface OpeningHoursSpec {
  '@type': 'OpeningHoursSpecification'
  dayOfWeek: Day[]
  opens: string
  closes: string
}

const dayIndex = (word: string): number | null => {
  const k = word.toLowerCase().replace(/\./g, '')
  return k in DAY_NAMES ? DAY_NAMES[k] : null
}

/** "Mon–Fri", "Sat & Sun", "Mon, Wed", "Daily" → day indexes, or null. */
function parseDays(text: string): number[] | null {
  const t = text.trim().toLowerCase()
  if (/^(daily|every ?day|7 days( a week)?|mon(day)?\s*[–—-]\s*sun(day)?)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6]
  const out = new Set<number>()
  for (const part of t.split(/\s*(?:,|&|\band\b|\/)\s*/).filter(Boolean)) {
    const range = part.split(/\s*(?:[–—-]|\bto\b|\bthrough\b|\bthru\b)\s*/)
    if (range.length === 1) {
      const d = dayIndex(range[0])
      if (d === null) return null
      out.add(d)
    } else if (range.length === 2) {
      const a = dayIndex(range[0])
      const b = dayIndex(range[1])
      if (a === null || b === null) return null
      // A range that wraps the week (Fri–Mon) is written by people too.
      for (let i = a; ; i = (i + 1) % 7) {
        out.add(i)
        if (i === b) break
      }
    } else return null
  }
  return out.size ? [...out].sort((x, y) => x - y) : null
}

/** "8:30AM", "5 pm", "17:00", "noon" → "HH:MM", or null (never a guessed meridiem). */
function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, '')
  if (t === 'noon') return '12:00'
  if (t === 'midnight') return '00:00'
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (min > 59) return null
  if (m[3]) {
    if (h < 1 || h > 12) return null
    if (m[3] === 'am' && h === 12) h = 0
    if (m[3] === 'pm' && h !== 12) h += 12
  } else if (!m[2] || h > 23) {
    // "9" or "5" alone could be either half of the day.
    return null
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function parseOpeningHours(hours: string | null | undefined): OpeningHoursSpec[] | null {
  if (!hours || !hours.trim()) return null
  const specs: OpeningHoursSpec[] = []
  for (const raw of hours.split(/\s*(?:·|•|;|\||\n)\s*/).filter(Boolean)) {
    const seg = raw.trim().replace(/\s+/g, ' ')
    // "Sun closed" / "Sunday: Closed" — a closed day is simply absent.
    const closed = seg.match(/^(.+?):?\s+closed$/i)
    if (closed) {
      if (!parseDays(closed[1])) return null
      continue
    }
    const m = seg.match(/^(.+?):?\s+(\S+(?:\s?[ap]\.?m\.?)?)\s*(?:[–—-]|\bto\b)\s*(\S+(?:\s?[ap]\.?m\.?)?)$/i)
    if (!m) return null
    const days = parseDays(m[1])
    let opens = parseTime(m[2])
    const closes = parseTime(m[3])
    // "9–5PM" carries the meridiem once, on the second time; that is a common
    // way of writing it and not a guess when the first hour is earlier.
    if (!opens && closes && /^\d{1,2}(:\d{2})?$/.test(m[2].trim()) && /pm/i.test(m[3])) {
      const pm = parseTime(`${m[2]}pm`)
      const am = parseTime(`${m[2]}am`)
      opens = pm && pm < closes ? pm : am
    }
    if (!days || !opens || !closes || opens >= closes) return null
    specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days.map((d) => DAYS[d]), opens, closes })
  }
  return specs.length ? specs : null
}
