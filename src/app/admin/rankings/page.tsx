export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdminPage } from '@/lib/admin-guard'
import { rankSummaries } from '@/lib/rank-report'
import Header from '@/components/admin/Header'

/**
 * Every client's local ranking, in one list.
 *
 * This is the view that decides where the week goes: who is improving, who
 * has slipped, and which non-SEO client has numbers bad enough to be worth a
 * phone call. Sorted worst-first for that reason — a table sorted
 * alphabetically makes you read all of it to find the one that matters.
 */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-gray-400">—</span>
  // Lower average position is better, so a NEGATIVE delta is an improvement.
  if (delta < -0.2) {
    return <span className="text-green-700 font-semibold">▲ {Math.abs(delta).toFixed(1)} better</span>
  }
  if (delta > 0.2) {
    return <span className="text-red-700 font-semibold">▼ {delta.toFixed(1)} worse</span>
  }
  return <span className="text-gray-500">flat</span>
}

export default async function AdminRankingsPage() {
  await requireAdminPage()
  const rows = await rankSummaries()

  // Worst average position first; clients with no data sink to the bottom
  // rather than pretending to be rank zero.
  const sorted = [...rows].sort((a, b) => {
    if (a.averageRank === null && b.averageRank === null) return 0
    if (a.averageRank === null) return 1
    if (b.averageRank === null) return -1
    return b.averageRank - a.averageRank
  })

  const tracked = rows.filter((r) => r.scanCount > 0).length

  return (
    <div>
      <Header title="Local rankings" subtitle={`${tracked} of ${rows.length} clients with scan data`} />
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Client</th>
                  <th className="text-left font-semibold px-4 py-3">Keyword</th>
                  <th className="text-right font-semibold px-4 py-3">Avg position</th>
                  <th className="text-right font-semibold px-4 py-3">Top 3</th>
                  <th className="text-left font-semibold px-4 py-3">Since first scan</th>
                  <th className="text-left font-semibold px-4 py-3">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row) => (
                  <tr key={row.clientId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clients/${row.clientId}/rankings`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {row.businessName}
                      </Link>
                      {!row.hasCampaign && (
                        <span className="ml-2 text-xs text-amber-700">no campaign yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.keyword || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {row.averageRank === null ? '—' : row.averageRank.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.top3Percent === null ? '—' : `${Math.round(row.top3Percent)}%`}
                    </td>
                    <td className="px-4 py-3">
                      <Delta delta={row.delta} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          row.seoClient ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {row.seoClient ? 'SEO — weekly' : 'Monthly'}
                      </span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No active clients yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Sorted worst-first. A negative change is an improvement — lower average position means
          closer to the top of the map results.
        </p>
      </div>
    </div>
  )
}
