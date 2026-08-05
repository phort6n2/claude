'use client'

import { useEffect, useState } from 'react'
import { Target, ChevronDown, ChevronUp } from 'lucide-react'

interface FocusArea {
  code: string
  label: string
  count: number
  pct: number
  example: { quote: string; timestamp: string | null } | null
}

interface FocusSummary {
  callsAnalysed: number
  bookedCount: number
  focusAreas: FocusArea[] | null
  reason?: string
}

/**
 * The three recurring things this shop's team should work on, derived from
 * patterns across their own calls rather than any single call.
 */
export function CoachingFocusAreas({
  endpoint = '/api/portal/coaching-focus',
}: {
  endpoint?: string
}) {
  const [data, setData] = useState<FocusSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [endpoint])

  // Stay out of the way until there's something genuinely useful to say.
  if (loading || !data?.focusAreas?.length) return null

  const bookedPct =
    data.callsAnalysed > 0 ? Math.round((data.bookedCount / data.callsAnalysed) * 100) : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
          <Target className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900">Top 3 things to work on</div>
          <div className="text-xs text-gray-500">
            From {data.callsAnalysed} recent call{data.callsAnalysed === 1 ? '' : 's'} ·{' '}
            {data.bookedCount} booked ({bookedPct}%)
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
        )}
      </button>

      {!open && (
        <ol className="px-4 pb-4 space-y-1.5">
          {data.focusAreas.map((f, i) => (
            <li key={f.code} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                {i + 1}
              </span>
              <span>{f.label}</span>
            </li>
          ))}
        </ol>
      )}

      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {data.focusAreas.map((f, i) => (
            <div key={f.code} className="p-4">
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{f.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Came up in {f.count} of {data.callsAnalysed} calls ({f.pct}%)
                  </p>
                  {f.example?.quote && (
                    <blockquote className="mt-2 border-l-2 border-gray-200 pl-3 text-xs text-gray-600 italic">
                      &ldquo;{f.example.quote}&rdquo;
                      {f.example.timestamp && (
                        <span className="not-italic text-gray-400"> — {f.example.timestamp}</span>
                      )}
                    </blockquote>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
