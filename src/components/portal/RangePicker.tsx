'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Calendar, Check, ChevronDown } from 'lucide-react'
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
 */
export default function RangePicker({ value }: { value: RangeKey }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const current = RANGES.find((r) => r.key === value) ?? RANGES[3]

  function choose(key: RangeKey) {
    setOpen(false)
    const next = new URLSearchParams(params.toString())
    next.set('range', key)
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        disabled={pending}
      >
        <Calendar className="h-4 w-4 text-gray-400" />
        {/* The label keeps saying what is on screen while the next one loads.
            Swapping it on click claims the page has changed before it has. */}
        {pending ? 'Loading…' : current.label}
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <>
          {/* Catches the click that closes the menu, so a tap outside does not
              also press whatever it landed on. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            {RANGES.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r.key === value}
                  onClick={() => choose(r.key)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    r.key === value ? 'font-semibold text-gray-900' : 'text-gray-700'
                  }`}
                >
                  {r.label}
                  {r.key === value && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
