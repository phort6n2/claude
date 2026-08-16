export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdminPage } from '@/lib/admin-guard'
import { rankSummaries } from '@/lib/rank-report'
import Header from '@/components/admin/Header'
import RankCampaignActions from '@/components/admin/RankCampaignActions'

/**
 * Every client's local ranking, in one list.
 *
 * This is the view that decides where the week goes: who is improving, who
 * has slipped, and which non-SEO client has numbers bad enough to be worth a
 * phone call. Sorted worst-first for that reason — a table sorted
 * alphabetically makes you read all of it to find the one that matters.
 *
 * EVERY keyword gets a row. This used to show one per client and the numbers
 * read as the whole picture, which they were not: a shop first on "windshield
 * replacement" and twelfth on "auto glass repair" looked like a shop needing
 * nothing. Clients are ordered by their worst keyword for the same reason.
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
    if (a.worstRank === null && b.worstRank === null) return 0
    if (a.worstRank === null) return 1
    if (b.worstRank === null) return -1
    return b.worstRank - a.worstRank
  })

  const tracked = rows.filter((r) => r.scanCount > 0).length
  const keywordCount = rows.reduce((sum, r) => sum + r.keywords.length, 0)

  return (
    <div>
      <Header
        title="Local rankings"
        subtitle={`${tracked} of ${rows.length} clients with scan data · ${keywordCount} keywords`}
      />
      <div className="p-6 space-y-4">
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
              <tbody>
                {sorted.map((row, clientIndex) =>
                  // A client with no keywords configured still gets a line —
                  // an absent row reads as a client that does not exist.
                  (row.keywords.length ? row.keywords : [null]).map((kw, i) => (
                    <tr
                      key={`${row.clientId}:${kw?.keyword ?? 'none'}`}
                      className={`hover:bg-gray-50 ${
                        i === 0
                          ? clientIndex > 0
                            ? 'border-t-4 border-gray-200'
                            : ''
                          : 'border-t border-gray-100'
                      }`}
                    >
                      {/* Spanned down the client's keywords: repeating the
                          name on every row makes four keywords look like four
                          clients. */}
                      {i === 0 && (
                        <td className="px-4 py-3 align-top" rowSpan={row.keywords.length || 1}>
                          <Link
                            href={`/admin/clients/${row.clientId}/rankings`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {row.businessName}
                          </Link>
                          {/* "No campaign" next to a row full of numbers reads
                              as a contradiction. It means rankTrackingId is
                              null, which is only news when there is also no
                              history; with history it means the campaign was
                              deleted and these scans have stopped extending. */}
                          {!row.hasCampaign &&
                            (row.scanCount === 0 ? (
                              <span className="ml-2 text-xs text-amber-700">no campaign yet</span>
                            ) : (
                              <span className="ml-2 text-xs text-amber-700">
                                campaign missing — history only
                              </span>
                            ))}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-600">
                        {kw?.keyword ?? <span className="text-gray-400">no keywords set</span>}
                        {kw && !kw.tracked && (
                          <span className="ml-2 text-xs text-gray-400">no longer tracked</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {kw?.averageRank == null ? '—' : kw.averageRank.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {kw?.top3Percent == null ? '—' : `${Math.round(kw.top3Percent)}%`}
                      </td>
                      <td className="px-4 py-3">
                        <Delta delta={kw?.delta ?? null} />
                      </td>
                      {i === 0 && (
                        <td className="px-4 py-3 align-top" rowSpan={row.keywords.length || 1}>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              row.seoClient
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {row.seoClient ? 'SEO — weekly' : 'Monthly'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))
                )}
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
        {/* Maintenance, below the thing the page is for. This opened on a
            panel of campaign controls with a red "delete every campaign" zone,
            which pushed the actual rankings below the fold on a laptop — a
            page named Local Rankings whose rankings you had to scroll to. */}
        <details className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-gray-700 hover:text-gray-900">
            Campaign controls
          </summary>
          <RankCampaignActions />
        </details>

        <p className="mt-3 text-xs text-gray-500">
          Every tracked keyword, one row each. Clients are sorted by their <em>worst</em> keyword,
          because that is the one worth a phone call. Lower average position is better — 1.0 means
          first place across the whole map.
        </p>
      </div>
    </div>
  )
}
