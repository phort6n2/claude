import { hasRenderableMap, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'
import {
  interactiveEmbedUrl,
  pickEmbed,
  shareEmbedUrl,
  whiteLabelEmbedUrl,
} from '@/lib/rank-embed'
import { localDominatorShareHost } from '@/lib/local-dominator'
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
 * The map is Local Dominator's own and only ever theirs. We do not draw a
 * geogrid of our own: a second rendering of the same scan is a second thing
 * to keep correct, and when the two disagree in front of a client — which is
 * exactly what happened, ours reading 2.8 against their 1.80 — the report is
 * worth less than no report. When theirs cannot be framed the page says so
 * and links to it rather than substituting something homemade.
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
  campaignId = null,
  showProviderLink = false,
}: {
  /** Chronological, oldest first, across every keyword. */
  scans: RankScanRow[]
  /** Their scheduled_scan_id — unlocks the campaign-wide map. */
  campaignId?: string | null
  /** Admin only: shows why theirs is not framed, when it is not. */
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
  const shareHost = await localDominatorShareHost()
  const verdict = await pickEmbed(
    interactiveEmbedUrl(sample?.shareUrl),
    shareEmbedUrl(sample?.mapImageUrl),
    whiteLabelEmbedUrl(sample?.shareUrl, shareHost)
  )

  const keywords: KeywordRuns[] = [...byTerm.entries()].map(([term, list]) => {
    // Only the URLs and the three numbers travel to the browser — never the
    // grids. A year of weekly scans is a lot of JSON for a page that shows
    // one map at a time.
    const runs: RunPoint[] = list.map((scan) => {
      const record = (scan.raw || {}) as HeatmapRecord
      const meta = readScanRecord(record)
      // A run with nothing behind it is never framed: their page would draw
      // an empty world map rather than admit it has no data.
      const renderable = hasRenderableMap(record)
      return {
        scanId: scan.id,
        date: scan.scannedAt.toISOString(),
        label: scan.scannedAt.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        // Same report, in order of preference: our own share host first, so
        // a client never reads a vendor's domain in their own portal.
        embedUrl: !renderable
          ? null
          : verdict.whiteLabelOk
            ? whiteLabelEmbedUrl(meta.shareUrl, shareHost)
            : verdict.interactiveOk
              ? interactiveEmbedUrl(meta.shareUrl)
              : verdict.staticOk
                ? shareEmbedUrl(meta.mapImageUrl)
                : null,
        // The new-tab link is for everyone: it is where their interactive
        // report is reliable, frame partitioning being the whole problem.
        providerUrl:
          whiteLabelEmbedUrl(meta.shareUrl, shareHost) || interactiveEmbedUrl(meta.shareUrl),
        averageRank: scan.averageRank,
        top3Percent: scan.top3Percent,
        foundPercent: scan.foundPercent,
      }
    })

    return { term, runs }
  })

  return (
    <RankBoard
      keywords={keywords}
      // Admin only: a client has no use for a framing policy, and showing
      // them one reads as the product being broken.
      fallbackReason={
        showProviderLink && !verdict.whiteLabelOk && !verdict.interactiveOk && !verdict.staticOk
          ? verdict.reason
          : null
      }
    />
  )
}
