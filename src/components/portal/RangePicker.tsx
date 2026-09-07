'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Calendar } from 'lucide-react'
import { RANGES, type RangeKey } from '@/lib/site-analytics'

/**
 * The window every figure on the page is for.
 *
 * IT DRIVES THE QUERY, NOT A FILTER. Each range is a separate question asked
 * of Google — a 7-day channel breakdown is not the 90-day one sliced, and
 * pretending otherwise would put the wrong shares on screen. So the choice
 * goes in the URL, the server re-fetches, and the answer is cached per range.
 *
 * IN THE URL on purpose: the range survives a reload, and a link to "this
 * client, last 12 months" is a link somebody can send.
 *
 * A NATIVE <select>, not a popover. What was here announced itself as a
 * listbox and behaved like a row of buttons — no arrow keys, no Escape, no
 * focus return, no aria-activedescendant — so a keyboard could not drive the
 * thing it claimed to be. The platform control is correct for free, and on a
 * phone it opens the wheel picker people already know.
 */
export default function RangePicker({ value }: { value: RangeKey }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function choose(key: string) {
    const next = new URLSearchParams(params.toString())
    next.set('range', key)
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  return (
    <label className="relative inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
      <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
      <span className="sr-only">Period to report on</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => choose(e.target.value)}
        className="appearance-none bg-transparent pr-5 focus:outline-none disabled:opacity-60"
      >
        {RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 text-gray-400"
      >
        ▾
      </span>
      {/* The label keeps saying what is on screen while the next window loads;
          swapping it on change would claim the page had already updated. */}
      {pending && <span className="text-xs text-gray-400">loading…</span>}
    </label>
  )
}
