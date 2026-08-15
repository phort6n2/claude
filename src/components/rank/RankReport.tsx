import { gridRanks, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'
import { interactiveEmbedUrl, pickEmbed, shareEmbedUrl } from '@/lib/rank-embed'
import RankHeatmap from '@/components/rank/RankHeatmap'
import RankBoard, { type KeywordRuns, type RunPoint } from '@/components/rank/RankBoard'

/**
 * The ranking report itself, rendered identically wherever it appears: the
 * client's portal, the admin's view of a client, and the public share link.
 *
 * One component on purpose. Three copies of this would drift, and the whole
 * value of the share link is that a prospect sees exactly what the client
 * sees — if the admin copy flattered the numbers, the artifact would be
 * worth nothing.
 *
 * The map is Local Dominator's own, framed from their public /share/ route.
 * Ours is the fallback, and whether theirs can be framed is settled
 * server-side before anything renders — see lib/rank-embed.ts.
 *
 * This part is the data; RankBoard is the layout — one keyword at a time
 * behind tabs, so the map gets the whole width of the page.
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

export default async function RankReport({
  scans,
  placeId,
  hasCoordinates,
  mapQuery = '',
  showProviderLink = false,
}: {
  /** Chronological, oldest first, across every keyword. */
  scans: RankScanRow[]
  placeId: string
  hasCoordinates: boolean
  /** Extra query for the map proxy — a share token, or a client id. */
  mapQuery?: string
  /**
   * Admin only. Their `dynamic_url` is the signed-in dashboard, so it is
   * useful to whoever holds the Local Dominator login and to nobody else.
   */
  showProviderLink?: boolean
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

  // One probe for the whole report. Which of their maps can be framed is a
  // property of their routes, not of a particular run, so asking per keyword
  // per visit would be a request per page view for the same answer.
  const sample = (() => {
    for (const list of byTerm.values()) {
      const meta = readScanRecord((list[list.length - 1].raw || {}) as HeatmapRecord)
      if (meta.shareUrl || meta.mapImageUrl) return meta
    }
    return null
  })()
  const verdict = await pickEmbed(
    interactiveEmbedUrl(sample?.shareUrl),
    shareEmbedUrl(sample?.mapImageUrl)
  )

  const keywords: KeywordRuns[] = [...byTerm.entries()].map(([term, list]) => {
    // Only the URLs and the three numbers travel to the browser — never the
    // grids. A year of weekly scans is a lot of JSON for a page that shows
    // one map at a time.
    const runs: RunPoint[] = list.map((scan) => {
      const meta = readScanRecord((scan.raw || {}) as HeatmapRecord)
      return {
        scanId: scan.id,
        date: scan.scannedAt.toISOString(),
        label: scan.scannedAt.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        // Their native map, framed — the interactive one when a signed-out
        // visitor can reach it, their static heatmap when not. Withheld
        // entirely when neither can be, so a client never meets a blank box.
        embedUrl:
          verdict.kind === 'interactive'
            ? interactiveEmbedUrl(meta.shareUrl)
            : verdict.kind === 'static'
              ? shareEmbedUrl(meta.mapImageUrl)
              : null,
        providerUrl: showProviderLink ? meta.shareUrl : null,
        averageRank: scan.averageRank,
        top3Percent: scan.top3Percent,
        foundPercent: scan.foundPercent,
      }
    })

    // Our own render, used when theirs cannot be framed.
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

    return { term, runs, fallback }
  })

  return (
    <RankBoard
      keywords={keywords}
      // Admin only: a client has no use for a framing policy, and showing
      // them one reads as the product being broken.
      fallbackReason={showProviderLink && !verdict.kind ? verdict.reason : null}
    />
  )
}
