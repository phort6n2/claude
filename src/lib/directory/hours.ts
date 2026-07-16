// Open/closed status derived from a shop's weekly hours. Pure function — the
// caller passes `now`, so a client component can compute it in the visitor's
// local time (static pages can't know "now" at build time).

import type { BusinessHours } from './types'
import { formatTime, dayLabel } from './format'

export interface OpenStatus {
  open: boolean
  label: string
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function openStatus(hours: BusinessHours[], now: Date): OpenStatus {
  const day = now.getDay()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const today = hours.find((h) => h.day === day)

  if (today?.open && today.close) {
    // Whole-day hours (00:00–23:59) represent a 24-hour operation.
    if (today.open === '00:00' && today.close === '23:59') {
      return { open: true, label: 'Open 24 hours' }
    }
    const open = toMinutes(today.open)
    const close = toMinutes(today.close)
    if (nowMins >= open && nowMins < close) {
      return { open: true, label: `Open now · closes ${formatTime(today.close)}` }
    }
    if (nowMins < open) {
      return { open: false, label: `Opens today ${formatTime(today.open)}` }
    }
  }

  // Look ahead for the next day the shop opens.
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7
    const next = hours.find((h) => h.day === d)
    if (next?.open) {
      const when = i === 1 ? 'tomorrow' : dayLabel(d)
      return { open: false, label: `Closed · opens ${when} ${formatTime(next.open)}` }
    }
  }

  return { open: false, label: 'Closed' }
}
