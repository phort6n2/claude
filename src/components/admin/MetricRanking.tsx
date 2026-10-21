'use client'

import { rankAccounts, type QuickMetric, type RankInput } from '@/lib/campaign-report'
import { Change, conv, int, money } from './campaign-report-ui'

/**
 * A QUICK SCREEN: one figure, every shop, biggest first, a bar each.
 *
 * Reading one column down a list of names is how a problem is spotted on a
 * phone — the shop whose cost doubled, whose conversions vanished, whose cost
 * per conversion went through the roof. On Cost / conv. the shops that spent
 * and converted NOTHING come first in red: their cost per conversion is
 * unbounded, and as a blank it would sink to the bottom where nobody looks.
 *
 * Bars compare a shop only with others in the SAME currency. Tapping a row
 * opens that shop in the overview.
 */

function formatValue(metric: QuickMetric, value: number | null, currency: string): string {
  if (value == null) return '—'
  if (metric === 'cost' || metric === 'costPerConv') return money(value, currency)
  if (metric === 'conversions') return conv(value)
  return int(value)
}

export default function MetricRanking({
  metric,
  inputs,
  compare,
  onPick,
}: {
  metric: QuickMetric
  inputs: RankInput[]
  compare: boolean
  onPick: (customerId: string) => void
}) {
  const rows = rankAccounts(metric, inputs)
  if (rows.length === 0) {
    return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-500">Nothing to show for this period.</p>
  }
  return (
    <ol className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onPick(r.id)}
            className="block min-h-12 w-full px-3 py-2.5 text-left hover:bg-gray-50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-gray-900" title={r.name}>
                {r.name}
              </span>
              <span className={`shrink-0 text-base font-semibold tabular-nums ${r.noConvSpend ? 'text-red-700' : 'text-gray-900'}`}>
                {/* Short, so a long shop name is not cut to make room; the
                    amount spent goes beside the bar. */}
                {r.noConvSpend ? 'No conv.' : formatValue(metric, r.value, r.currency)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                <div
                  className={`h-full rounded-full ${r.noConvSpend ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.max(r.bar * 100, r.value ? 2 : 0)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right">
                {r.noConvSpend ? (
                  <span className="text-xs font-medium text-red-700">{money(r.costMicros, r.currency, true)} spent</span>
                ) : compare && r.value != null && r.prior != null ? (
                  <Change now={r.value} before={r.prior} />
                ) : (
                  <span className="text-xs text-gray-500">{compare ? 'no prior data' : ''}</span>
                )}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ol>
  )
}
