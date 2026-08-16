import { hasRenderableMap, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'
import { campaignShareLinks, localDominatorShareHost } from '@/lib/local-dominator'
import {
  interactiveEmbedUrl,
  pickEmbed,
  shareEmbedUrl,
  whiteLabelEmbedUrl,
} from '@/lib/rank-embed'
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
  mapUrl = null,
  campaignId = null,
  showProviderLink = false,
}: {
  /** Chronological, oldest first, across every keyword. */
  scans: RankScanRow[]
  /**
   * The campaign's all-keywords map, already white-labelled and stored on the
   * client. This is the whole report: their page, every keyword, their own
   * controls, and Local Dominator repoints it as each run completes.
   */
  mapUrl?: string | null
  /** Fallback when the URL has not been captured yet. */
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

  // The campaign's own share link is preferred over anything taken from a
  // stored webhook payload. Their scheduler repoints it as each run
  // completes, so one URL always shows the latest scan — and their docs say
  // it is derived from the newest run that HAS a resolvable share URL, which
  // is exactly the guarantee a per-run link cannot make. A run that came back
  // empty is skipped rather than framed as an empty world map.
  // Stored first: the daily sweep captures it, so the common path costs no
  // request at all. The live fetch is only for a campaign whose first run has
  // not completed since the sweep last ran.
  const campaign = mapUrl || !campaignId ? null : await campaignShareLinks(campaignId)
  // The campaign token, and nothing else. Their `dynamic_url` is ONE
  // keyword's report; using it here showed a single keyword on every
  // client's report and looked like the all-keywords map. When there is no
  // campaign token yet, the per-keyword tabs below reach all of them.
  const campaignEmbed = mapUrl || whiteLabelEmbedUrl(campaign?.campaignLink, shareHost)

  if (campaignEmbed) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Admin only. Which URL is framed is the single most useful fact when
            this looks wrong, and inferring it from a screenshot cost several
            rounds. It costs one line to just say it. */}
        {showProviderLink && (
          <p className="px-4 sm:px-5 py-2 text-[11px] text-gray-500 border-b border-gray-100 truncate">
            {mapUrl ? 'Stored' : 'Live'} all-keywords map:{' '}
            <a
              href={campaignEmbed}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {campaignEmbed}
            </a>
          </p>
        )}
        <iframe
          src={campaignEmbed}
          title="Local ranking map"
          className="w-full block border-0 bg-gray-100 h-[92vh] min-h-[720px]"
          sandbox="allow-scripts allow-same-origin allow-popups allow-storage-access-by-user-activation"
        />
      </section>
    )
  }

  const verdict = await pickEmbed(
    interactiveEmbedUrl(sample?.shareUrl),
    shareEmbedUrl(sample?.mapImageUrl),
    whiteLabelEmbedUrl(sample?.shareUrl, shareHost)
  )

  // Nothing campaign-wide to frame. Say why, once, where an admin will see
  // it — otherwise the per-keyword tabs below just look like the wrong map.
  const noCampaignReason = !shareHost
    ? 'No share domain set (Settings → API keys → Rank report share domain).'
    : !campaignId
      ? 'This client has no Local Dominator campaign yet.'
      : 'Local Dominator has not issued a campaign share link for this campaign. Their API does not create one — opening the campaign once in their dashboard does. Do that, then press “Refresh map URLs” on Local Rankings, or paste the URL into Map URL below. Until then: per-keyword maps.'

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
      fallbackReason={showProviderLink ? noCampaignReason : null}
    />
  )
}
