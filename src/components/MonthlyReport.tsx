import { AlertTriangle } from 'lucide-react'
import { formatMoney, type MonthlyReport } from '@/lib/monthly-report'

/**
 * Leads → booked → revenue, month by month.
 *
 * One component for the client's portal and the admin's view of that client,
 * so the two can never say different things. The whole point of showing a
 * client this is that it is the same table you are looking at.
 *
 * The numbers are the SHOP'S OWN bookkeeping — what they marked booked and
 * what they typed it was worth. Nothing here is estimated or grossed up, and
 * the page says so, because a revenue figure a client cannot reconcile
 * against their own till is a figure that costs trust rather than building it.
 */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 m-0">{label}</p>
      <p className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 m-0">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500 m-0">{sub}</p>}
    </div>
  )
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)

export default function MonthlyReportView({ report }: { report: MonthlyReport }) {
  const { totals, months, nothingMarked, unmarked } = report

  // Months are newest first, so the all-zero rows from before the shop existed
  // are the TAIL. Trimmed, or a new client opens a report that is mostly blank
  // and reads as twelve months of failure rather than one month of history.
  const oldestWithData = months.reduce(
    (last, m, i) => (m.leads > 0 || m.calls > 0 ? i : last),
    -1
  )
  const visible = oldestWithData === -1 ? [] : months.slice(0, oldestWithData + 1)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Enquiries" value={totals.leads.toLocaleString()} sub="last 12 months" />
        <Stat
          label="Booked"
          value={totals.booked.toLocaleString()}
          sub={totals.bookedRate === null ? 'none marked yet' : `${pct(totals.bookedRate)} of enquiries`}
        />
        <Stat
          label="Revenue"
          value={totals.revenue > 0 ? formatMoney(totals.revenue) : '—'}
          sub="from jobs you marked booked"
        />
        <Stat
          label="Per enquiry"
          value={totals.valuePerLead ? formatMoney(totals.valuePerLead) : '—'}
          sub="revenue ÷ enquiries"
        />
      </div>

      {/* A zero booked column reads as "this does not work" when it usually
          means "nobody ticked the box". Say which it is. */}
      {nothingMarked && totals.leads > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold m-0">No jobs marked booked yet</p>
            <p className="mt-0.5 m-0">
              These figures come from what gets marked on each enquiry — the buttons in your text
              and email alerts, or the status on the lead itself. Until something is marked, the
              booked and revenue columns stay empty even if the work came in.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3 font-semibold">Month</th>
                <th className="px-4 py-3 font-semibold text-right">Enquiries</th>
                <th className="px-4 py-3 font-semibold text-right">Calls</th>
                <th className="px-4 py-3 font-semibold text-right">Booked</th>
                <th className="px-4 py-3 font-semibold text-right">Rate</th>
                <th className="px-4 py-3 font-semibold text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.month.toISOString()} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {m.label}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.leads || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {m.calls || '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{m.booked || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {pct(m.bookedRate)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                    {m.revenue > 0 ? formatMoney(m.revenue) : '—'}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nothing to report yet — this fills in as enquiries arrive.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-500 max-w-prose">
        Every figure here is your own record: an enquiry counts when it reaches you, and a job
        counts as booked when it is marked booked. Nothing is estimated.
        {unmarked > 0 && (
          <>
            {' '}
            {unmarked} enquir{unmarked === 1 ? 'y is' : 'ies are'} still open — neither booked nor
            written off — so the real figures are at least this good.
          </>
        )}
      </p>
    </div>
  )
}
