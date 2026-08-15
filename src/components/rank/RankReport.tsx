import { gridRanks, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'
import RankHeatmap from '@/components/rank/RankHeatmap'
import RankKeywordSection, { type RunPoint } from '@/components/rank/RankKeywordSection'

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
  id: string
  searchTerm: string
  scannedAt: Date
  averageRank: number | null
  top3Percent: number | null
  foundPercent: number | null
  gridSize: number
  distance: number
  raw: unknown
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
        // Only the image and the three numbers travel to the browser — never
        // the grids. A year of weekly scans is a lot of JSON for a page that
        // shows one map at a time.
        const runs: RunPoint[] = list.map((scan) => {
          const meta = readScanRecord((scan.raw || {}) as HeatmapRecord)
          return {
            scanId: scan.id,
            date: scan.scannedAt.toISOString(),
            label: scan.scannedAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
            // `image_link` is an HTML page, not an asset — it returns
            // text/html, so it can never be an <img src>. The map on the page
            // is always our own render of the per-point ranks.
            imageUrl: null,
            // `dynamic_url` is their live dashboard for this run. It goes in
            // an iframe behind a button rather than in place of our map,
            // because it once rendered at 0,0 for a signed-out viewer and a
            // client must never open this tab to a map of the Atlantic.
            interactiveUrl: meta.shareUrl,
            averageRank: scan.averageRank,
            top3Percent: scan.top3Percent,
            foundPercent: scan.foundPercent,
          }
        })

        // Our own render, used only when the provider sent no image.
        const latest = list[list.length - 1]
        const latestRecord = (latest.raw || {}) as HeatmapRecord
        const grid = gridRanks(latestRecord, readScanRecord(latestRecord).placeId || placeId)
        const fallback =
          grid.length > 0 ? (
            <RankHeatmap
              grid={grid}
              label={term}
              mapUrl={
                hasCoordinates
                  ? `/api/rank-map?grid=${latest.gridSize}&distance=${latest.distance}${mapQuery ? `&${mapQuery}` : ''}`
                  : null
              }
            />
          ) : null

        return <RankKeywordSection key={term} term={term} runs={runs} fallback={fallback} />
      })}
    </div>
  )
}
