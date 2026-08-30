'use client'

import {
  HOURS_DAYS,
  hoursText,
  type DayHours,
  type HoursSchedule,
} from '@/lib/business-hours'

/**
 * The hours editor, shaped like the one every shop owner has already used:
 * Google Business Profile's. A row per day, open or closed, times when open,
 * and "copy to all" so a Mon–Fri shop sets one row and unticks the weekend.
 *
 * Days start CLOSED on purpose. Prefilled hours a shop never looked at would
 * end up published as fact, and §2 exists precisely to stop the template
 * asserting things nobody said. An untouched editor produces no hours line
 * at all, which the site renders as nothing — never as a guess.
 *
 * The preview line shows the exact text the site will print, because the
 * grid is the input and the sentence is the output, and the person filling
 * this in should see what they are signing.
 */
export default function HoursGrid({
  value,
  disabled,
  onChange,
}: {
  value: HoursSchedule
  disabled?: boolean
  onChange: (schedule: HoursSchedule) => void
}) {
  const defaultDay: DayHours = { open: '08:00', close: '17:00' }

  const setDay = (key: string, day: DayHours | null) => {
    onChange({ ...value, [key]: day })
  }

  const copyToAll = (day: DayHours) => {
    const all: HoursSchedule = {}
    for (const entry of HOURS_DAYS) all[entry.key] = { ...day }
    onChange(all)
  }

  const preview = hoursText(value)

  return (
    <div className="mt-1.5 space-y-1">
      {HOURS_DAYS.map((entry) => {
        const day = value[entry.key] ?? null
        const open = !!day
        return (
          <div key={entry.key} className="flex items-center gap-2 min-h-[38px] flex-wrap">
            <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={open}
                disabled={disabled}
                onChange={(e) => setDay(entry.key, e.target.checked ? { ...defaultDay } : null)}
                className="h-4 w-4"
              />
              <span className={`text-sm ${open ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                {entry.label}
              </span>
            </label>
            {open ? (
              <>
                <input
                  type="time"
                  value={day.open}
                  disabled={disabled}
                  onChange={(e) => setDay(entry.key, { ...day, open: e.target.value || day.open })}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="time"
                  value={day.close}
                  disabled={disabled}
                  onChange={(e) => setDay(entry.key, { ...day, close: e.target.value || day.close })}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => copyToAll(day)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Copy to all days
                  </button>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400">Closed</span>
            )}
          </div>
        )
      })}
      <p className="text-xs text-gray-500 pt-1.5">
        {preview ? (
          <>
            Your site will show: <span className="font-medium text-gray-700">{preview}</span>
          </>
        ) : (
          'No days set — your site simply won’t show an hours line.'
        )}
      </p>
    </div>
  )
}
