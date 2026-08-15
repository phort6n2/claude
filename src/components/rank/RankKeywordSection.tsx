'use client'

import { useState } from 'react'
import RankTrend from '@/components/rank/RankTrend'

/**
 * One keyword's report, with a date control across every scan taken.
 *
 * The slider is the point of keeping history rather than only the latest
 * scan: "here is the map today" is a screenshot, but "drag back to March and
 * watch the red go green" is the argument for the retainer. It defaults to
 * the most recent run, because that is the answer to the question a client
 * actually opened the page to ask.
 *
 * Only the rendered image and the three numbers are sent per run — never the
 * grids, which are large and would make a year of weekly history an
 * unreasonable payload for a page that shows one map at a time.
 */

export interface RunPoint {
  scanId: string
  date: string
  label: string
  imageUrl: string | null
  averageRank: number | null
  top3Percent: number | null
  foundPercent: number | null
  /** Local Dominator's own interactive report for this run, when shared. */
  interactiveUrl?: string | null
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

export default function RankKeywordSection({
  term,
  runs,
  fallback,
}: {
  term: string
  /** Oldest first. */
  runs: RunPoint[]
  /** Rendered when a run carries no provider image (our own pin grid). */
  fallback?: React.ReactNode
}) {
  const [index, setIndex] = useState(runs.length - 1)
  const [imageFailed, setImageFailed] = useState(false)
  const [showInteractive, setShowInteractive] = useState(false)
  const run = runs[index] || runs[runs.length - 1]
  const multiple = runs.length > 1

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">&ldquo;{term}&rdquo;</h2>
        <span className="text-xs text-gray-500">
          {multiple ? `${runs.length} scans · showing ${run.label}` : run.label}
        </span>
      </div>

      {showInteractive && run.interactiveUrl && (
        <div className="mt-3">
          {/* Their own interactive report, framed. Plenty of apps refuse to
              be embedded, so the link below always works even when the frame
              stays blank — better than a dead grey box with no way out. */}
          <iframe
            src={run.interactiveUrl}
            title={`Interactive ranking map for ${term}`}
            className="w-full h-[520px] rounded-xl border border-gray-200 bg-gray-50"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <p className="mt-1 text-xs text-gray-500">
            Not loading?{' '}
            <a
              href={run.interactiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Open it in a new tab
            </a>
            .
          </p>
        </div>
      )}

      <div className="mt-3 grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <div className="w-full max-w-[460px]">
          {run.imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={run.imageUrl}
              alt={`Ranking heatmap for ${term} on ${run.label}`}
              className="w-full rounded-xl border border-gray-200 bg-gray-100"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            // Our own render stands in when theirs cannot be fetched — a
            // broken-image icon in front of a client is worse than either.
            fallback || (
              <div className="w-full aspect-square rounded-xl border border-dashed border-gray-300 grid place-items-center text-xs text-gray-500 p-4 text-center">
                The map for this scan could not be loaded.
              </div>
            )
          )}

          {run.interactiveUrl && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowInteractive((v) => !v)}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                {showInteractive ? 'Hide the interactive map' : 'Open the interactive map'}
              </button>
            </div>
          )}

          {multiple && (
            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={runs.length - 1}
                step={1}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                className="w-full accent-[var(--brand-ink,#1e40af)]"
                aria-label={`Scan date for ${term}`}
              />
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{runs[0].label}</span>
                <span>{runs[runs.length - 1].label}</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Average position"
              value={run.averageRank === null ? '—' : run.averageRank.toFixed(1)}
              hint={run.averageRank === null ? 'not showing yet' : 'where they rank'}
            />
            <Stat
              label="In the top 3"
              value={run.top3Percent === null ? '—' : `${Math.round(run.top3Percent)}%`}
              hint="of the area"
            />
            <Stat
              label="Showing at all"
              value={run.foundPercent === null ? '—' : `${Math.round(run.foundPercent)}%`}
              hint="of the area"
            />
          </div>

          {runs.length >= 2 ? (
            <RankTrend
              points={runs.map((r) => ({ date: r.date, averageRank: r.averageRank }))}
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
}
