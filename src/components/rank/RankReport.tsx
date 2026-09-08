import { hasRenderableMap, readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'
import { campaignShareLinks, localDominatorShareHost } from '@/lib/local-dominator'
import {
  interactiveEmbedUrl,
  shareEmbedUrl,
  urlResolves,
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
  trackedTerms = [],
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
  /** The terms this campaign measures, for the before-the-first-scan state. */
  trackedTerms?: string[]
}) {
  const byTerm = new Map<string, RankScanRow[]>()
  for (const scan of scans) {
    const list = byTerm.get(scan.searchTerm) || []
    list.push(scan)
    byTerm.set(scan.searchTerm, list)
  }

  const noScans = byTerm.size === 0
  const shareHost = await localDominatorShareHost()

  /* THE MAP IS THE REPORT, AND IT DOES NOT WAIT FOR A SCAN OF OURS.
     This check sat BELOW the empty-state return, so a client with a working
     all-keywords map pasted on their Rankings tab still saw "Gathering your
     rankings — the first scan has not reported back yet" and never the map.
     Two different things were being conflated: their live map, which is
     current the moment it exists, and OUR stored scan history, which is what
     the week-to-week trend is built from and genuinely does need a webhook to
     land. Somebody who has just pasted a working URL is told nothing is there.

     The live fetch is still skipped when there are no scans — a campaign whose
     first run has not completed has no campaign_link to find, so it would be a
     round trip per page load to learn nothing. */
  const campaign = mapUrl || !campaignId || noScans ? null : await campaignShareLinks(campaignId)
  // The campaign token, and nothing else. Their `dynamic_url` is ONE
  // keyword's report; using it here showed a single keyword on every
  // client's report and looked like the all-keywords map. When there is no
  // campaign token yet, the per-keyword tabs below reach all of them.
  const campaignEmbed = mapUrl || whiteLabelEmbedUrl(campaign?.campaignLink, shareHost)

  if (noScans && !campaignEmbed) {
    /**
     * TWO DIFFERENT NOTHINGS.
     *
     * With a campaign, measuring is set up and the first result is simply not
     * back yet — so the page says what is being measured and when it runs,
     * which is the difference between "we are working on it" and "this is
     * broken". Scans run on a TUESDAY, in business hours, because a geogrid
     * measures the pack as it stands at that moment and the weekend pack is
     * not the one that sells jobs.
     *
     * Without one, there is nothing coming, and saying so is better than an
     * encouraging sentence about a scan nobody has scheduled.
     */
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900">
          {campaignId ? 'Gathering your rankings' : 'Ranking tracking is not set up yet'}
        </h2>
        <p className="mt-1 text-sm text-gray-600 max-w-prose">
          {campaignId ? (
            <>
              Measuring is set up and the first scan has not reported back yet. They run on
              Tuesdays: a 10&times;10 grid across the service area, so the answer is where the
              business ranks in each part of town rather than one average. Once the first one
              lands, this page shows the map and how it moves week to week.
            </>
          ) : (
            <>
              Nothing is being measured for this business yet, so there is nothing to show here.
            </>
          )}
        </p>
        {campaignId && trackedTerms.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
              What is being measured
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {trackedTerms.map((term) => (
                <li
                  key={term}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-700"
                >
                  {term}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  /* The campaign's own share link is preferred over anything taken from a
     stored webhook payload. Their scheduler repoints it as each run completes,
     so one URL always shows the latest scan — and their docs say it is derived
     from the newest run that HAS a resolvable share URL, which is exactly the
     guarantee a per-run link cannot make. A run that came back empty is
     skipped rather than framed as an empty world map. Resolved above, before
     the empty state, because the map does not depend on our scans. */
  if (campaignEmbed) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Admin only. Which URL is framed is the single most useful fact when
            this looks wrong, and inferring it from a screenshot cost several
            rounds. It costs one line to just say it. */}
        {showProviderLink && (
          <p className="px-4 sm:px-5 py-1 text-[10px] text-gray-400 truncate">
            <a
              href={campaignEmbed}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {mapUrl ? 'stored' : 'live'} all-keywords map ↗
            </a>
          </p>
        )}
        {/* The map is live and current; the week-to-week trend is built from
            scans posted to us, and before the first one lands there is no
            trend to draw. Said here rather than withholding the map, which is
            what the page used to do. */}
        {noScans && (
          <p className="px-4 sm:px-5 pt-4 text-sm text-gray-600">
            This is your live map — where you rank in each part of town right now. The
            week-to-week comparison starts once the first scheduled scan reports back.
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

  // Probed PER KEYWORD, not once for the report. Each keyword's runs carry
  // their own share token, so a verdict taken from one of them says nothing
  // about the rest — which is how a keyword whose token no longer resolves
  // still got framed, and their page renders that as an empty world map
  // centred on 0,0 rather than an error.
  const keywords: KeywordRuns[] = await Promise.all(
    [...byTerm.entries()].map(async ([term, list]) => {
    // Only the URLs and the three numbers travel to the browser — never the
    // grids. A year of weekly scans is a lot of JSON for a page that shows
    // one map at a time.
    const urlFor = (meta: ReturnType<typeof readScanRecord>) =>
      whiteLabelEmbedUrl(meta.shareUrl, shareHost) ||
      interactiveEmbedUrl(meta.shareUrl) ||
      shareEmbedUrl(meta.mapImageUrl)

    // One probe per keyword, on its newest run — the one shown by default.
    const latest = readScanRecord((list[list.length - 1].raw || {}) as HeatmapRecord)
    const keywordOk = await urlResolves(urlFor(latest))

    const runs: RunPoint[] = list.map((scan) => {
      const record = (scan.raw || {}) as HeatmapRecord
      const meta = readScanRecord(record)
      // A run with nothing behind it is never framed: their page would draw
      // an empty world map rather than admit it has no data.
      const renderable = keywordOk && hasRenderableMap(record)
      return {
        scanId: scan.id,
        date: scan.scannedAt.toISOString(),
        label: scan.scannedAt.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        // Our own share host first, so a client never reads a vendor's domain
        // in their own portal.
        embedUrl: renderable ? urlFor(meta) : null,
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
  )

  return <RankBoard keywords={keywords} />
}
