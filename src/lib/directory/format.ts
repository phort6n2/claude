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

/** Google Maps directions deep link — by coordinates when available, else address. */
export function directionsHref(shop: {
  lat?: number
  lng?: number
  street: string
  city: string
  state: string
  zip: string
}): string {
  if (typeof shop.lat === 'number' && typeof shop.lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`
  }
  const q = encodeURIComponent(
    `${shop.street}, ${shop.city}, ${shop.state.toUpperCase()} ${shop.zip}`
  )
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`
}
