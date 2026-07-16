// Small presentation helpers shared across directory pages.

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? ''
}

/** "07:30" -> "7:30 AM" */
export function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`
}

/** Strip everything but digits for a tel: href. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9]/g, '')}`
}
