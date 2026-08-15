import { gridRanks, type HeatmapRecord } from '@/lib/local-dominator'
import RankHeatmap from '@/components/rank/RankHeatmap'
import RankTrend from '@/components/rank/RankTrend'

/**
 * The ranking report itself, rendered identically wherever it appears: the
 * client's portal, the admin's view of a client, and the public share link.
 *
 * One component on purpose. Three copies of this would drift, and the whole
 * value of the share link is that a prospect sees exactly what the client
 * sees — if the admin copy flattered the numbers, the artifact would be
 * worth nothing.
 */

export interface RankScanRow {
  searchTerm: string
  scannedAt: Date
  averageRank: number | null
  top3Percent: number | null
  foundPercent: number | null
  gridSize: number
  distance: number
  raw: unknown
}

function relative(date: Date): string {
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xl font-extrabold text-gray-900 tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[11px] font-semibold text-gray-700 leading-tight">{label}</div>
      <div className="text-[11px] text-gray-500 leading-tight">{hint}</div>
    </div>
  )
}

export default function RankReport({
  scans,
  placeId,
  hasCoordinates,
  mapQuery = '',
}: {
  /** Chronological, oldest first, across every keyword. */
  scans: RankScanRow[]
  placeId: string
  hasCoordinates: boolean
  /** Extra query for the map proxy — a share token, or a client id. */
  mapQuery?: string
}) {
  const byTerm = new Map<string, RankScanRow[]>()
  for (const scan of scans) {
    const list = byTerm.get(scan.searchTerm) || []
    list.push(scan)
    byTerm.set(scan.searchTerm, list)
  }

  if (byTerm.size === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900">No scans yet</h2>
        <p className="mt-1 text-sm text-gray-600 max-w-prose">
          The first ranking scan hasn&apos;t run yet. Once it does, this shows a map of where the
          business appears across the area, and how that changes over time.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {[...byTerm.entries()].map(([term, list]) => {
        const latest = list[list.length - 1]
        const grid = gridRanks((latest.raw || {}) as HeatmapRecord, placeId)
        const mapUrl = hasCoordinates
          ? `/api/rank-map?grid=${latest.gridSize}&distance=${latest.distance}${mapQuery ? `&${mapQuery}` : ''}`
          : null

        return (
          <section key={term} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900">&ldquo;{term}&rdquo;</h2>
              <span className="text-xs text-gray-500">Last checked {relative(latest.scannedAt)}</span>
            </div>

            <div className="mt-3 grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              {grid.length > 0 && <RankHeatmap grid={grid} label={term} mapUrl={mapUrl} />}

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Stat
                    label="Average position"
                    value={latest.averageRank === null ? '—' : latest.averageRank.toFixed(1)}
                    hint={latest.averageRank === null ? 'not showing yet' : 'where they rank'}
                  />
                  <Stat
                    label="In the top 3"
                    value={latest.top3Percent === null ? '—' : `${Math.round(latest.top3Percent)}%`}
                    hint="of the area"
                  />
                  <Stat
                    label="Showing at all"
                    value={latest.foundPercent === null ? '—' : `${Math.round(latest.foundPercent)}%`}
                    hint="of the area"
                  />
                </div>

                {list.length >= 2 ? (
                  <RankTrend
                    points={list.map((s) => ({
                      date: s.scannedAt.toISOString(),
                      averageRank: s.averageRank,
                    }))}
                  />
                ) : (
                  <p className="text-xs text-gray-500">
                    The trend line appears once there are two scans to compare.
                  </p>
                )}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
