/**
 * Turn Google's seven-line opening hours into one line a footer can hold.
 *
 * Places returns `weekdayDescriptions` as an array of seven strings —
 * "Monday: 8:00 AM – 5:00 PM", "Tuesday: 8:00 AM – 5:00 PM", … — and the site
 * renders hours inline next to an address. Printing all seven there is the
 * reason nobody fills this field in by hand.
 *
 * So consecutive days with identical hours collapse into a range, which is
 * how a person would write it anyway: "Mon–Fri 8AM–5PM · Sat 9AM–2PM".
 *
 * Nothing here is parsed back out. The stored value is free text rendered
 * verbatim, so if Google says something this doesn't anticipate the worst
 * case is a slightly long string, not a wrong one.
 */

const SHORT: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

/** Google's order starts on Monday; keep it, because that's how shops read. */
const ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function tidyTime(value: string): string {
  return (
    value
      // "8:00 AM" → "8AM". On-the-hour times don't need the minutes, and the
      // space before AM/PM is what pushes this past one line.
      .replace(/(\d{1,2}):00\s*([AP])M/gi, (_m, h, ap) => `${h}${ap.toUpperCase()}M`)
      .replace(/(\d{1,2}:\d{2})\s*([AP])M/gi, (_m, t, ap) => `${t}${ap.toUpperCase()}M`)
      // Normalise the various dashes Google uses.
      .replace(/\s*[–—-]\s*/g, '–')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * @param descriptions Google Places `regularOpeningHours.weekdayDescriptions`
 * @returns One-line hours, or null when there is nothing usable.
 */
export function formatWeekdayDescriptions(descriptions: string[] | undefined | null): string | null {
  if (!Array.isArray(descriptions) || descriptions.length === 0) return null

  // Parse into day → hours, tolerating a locale that doesn't use a colon.
  const byDay = new Map<string, string>()
  for (const line of descriptions) {
    const split = line.indexOf(':')
    if (split < 1) continue
    const day = line.slice(0, split).trim().toLowerCase()
    const hours = tidyTime(line.slice(split + 1))
    if (!SHORT[day] || !hours) continue
    byDay.set(day, hours)
  }
  if (byDay.size === 0) return null

  // Collapse runs of identical days.
  const parts: string[] = []
  let runStart: string | null = null
  let runEnd: string | null = null
  let runHours: string | null = null

  const flush = () => {
    if (!runStart || !runHours) return
    const label =
      runStart === runEnd ? SHORT[runStart] : `${SHORT[runStart]}–${SHORT[runEnd as string]}`
    // "Sun: Closed" reads better as "Sun closed" — lowercase so the words
    // don't look like the start of a new sentence mid-line. Same for
    // Google's "Open 24 hours".
    const words = /^(closed|open 24 hours)$/i.test(runHours) ? runHours.toLowerCase() : runHours
    parts.push(`${label} ${words}`)
    runStart = runEnd = runHours = null
  }

  for (const day of ORDER) {
    const hours = byDay.get(day)
    if (!hours) {
      flush()
      continue
    }
    if (runHours === hours) {
      runEnd = day
      continue
    }
    flush()
    runStart = day
    runEnd = day
    runHours = hours
  }
  flush()

  if (parts.length === 0) return null
  // A shop open the same hours all week says so once. "Every day open 24
  // hours" is a mouthful for what is just "Open 24 hours".
  if (parts.length === 1 && byDay.size === 7) {
    const everyDay = parts[0].replace(/^Mon–Sun /, '')
    return /^open 24 hours$/i.test(everyDay) ? 'Open 24 hours' : `Every day ${everyDay}`
  }
  return parts.join(' · ')
}
