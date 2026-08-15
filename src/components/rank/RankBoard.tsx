'use client'

import { useState } from 'react'
import RankTrend from '@/components/rank/RankTrend'

/**
 * The ranking report: one keyword at a time, its map given the whole page.
 *
 * Keywords are tabs rather than a stack of sections. Local Dominator's map is
 * a big thing — it wants width to be readable at all — and four of them down
 * a page meant every one of them was cropped into a column. One at a time,
 * full width, is the only layout where the map is actually legible, and the
 * tab bar makes switching cheaper than scrolling did.
 *
 * The numbers sit in a single strip above the map instead of a card beside
 * it, for the same reason: nothing may take width away from the map — and
 * they appear ONLY when their map is not the one being shown. Their embed
 * carries its own Avg. Rank / High / Med / Low / Out, and printing a second
 * average of our own an inch above theirs is the one thing a report in front
 * of a paying client may never do: disagree with the tool it came from.
 *
 * Only the URLs and the three numbers travel to the browser per run — never
 * the grids, which would make a year of weekly history an unreasonable
 * payload for a page that shows one map at a time.
 */

export interface RunPoint {
  scanId: string
  date: string
  label: string
  /** Their static heatmap, from the public /share/ route. The default. */
  embedUrl: string | null
  /** Their report in its own tab, where it always works. */
  providerUrl?: string | null
  averageRank: number | null
  top3Percent: number | null
  foundPercent: number | null
}

export interface KeywordRuns {
  term: string
  runs: RunPoint[]
  /** Our own pin grid, shown when their map cannot be framed. */
  fallback?: React.ReactNode
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xl font-extrabold text-gray-900 tabular-nums leading-none">
        {value}
      </span>
      <span className="text-xs font-semibold text-gray-600">{label}</span>
    </div>
  )
}

export default function RankBoard({
  keywords,
  fallbackReason = null,
}: {
  keywords: KeywordRuns[]
  /** Why theirs is not being shown. Admin-facing detail, kept quiet. */
  fallbackReason?: string | null
}) {
  const [term, setTerm] = useState(keywords[0]?.term || '')
  const active = keywords.find((k) => k.term === term) || keywords[0]

  // Index is per keyword, and keywords have different scan counts, so it is
  // held per term rather than shared — otherwise switching tabs could land on
  // a run the new keyword does not have.
  const [indexes, setIndexes] = useState<Record<string, number>>({})



  if (!active) return null

  const index = indexes[active.term] ?? active.runs.length - 1
  const run = active.runs[index] || active.runs[active.runs.length - 1]
  const multiple = active.runs.length > 1

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {keywords.length > 1 && (
        <div
          className="flex gap-1 overflow-x-auto border-b border-gray-200 px-2 pt-2"
          role="tablist"
          aria-label="Keyword"
        >
          {keywords.map((k) => {
            const on = k.term === active.term
            return (
              <button
                key={k.term}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTerm(k.term)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                  on
                    ? 'border-[var(--brand-ink,#1e40af)] text-[var(--brand-ink,#1e40af)] bg-[var(--brand-soft,#1e40af14)]'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {k.term}
              </button>
            )
          })}
        </div>
      )}

      <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {keywords.length === 1 && (
            <h2 className="text-base font-bold text-gray-900">&ldquo;{active.term}&rdquo;</h2>
          )}
          {/* Only when the map on the page is ours. Theirs prints its own. */}
          {!run.embedUrl && (
            <>
              <Stat
                value={run.averageRank === null ? '—' : run.averageRank.toFixed(1)}
                label="avg. position"
              />
              <Stat
                value={run.top3Percent === null ? '—' : `${Math.round(run.top3Percent)}%`}
                label="in the top 3"
              />
              <Stat
                value={run.foundPercent === null ? '—' : `${Math.round(run.foundPercent)}%`}
                label="showing at all"
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {multiple ? `${active.runs.length} scans · ${run.label}` : run.label}
          </span>
          {/* In the header, not under the map: the frame is 92vh and their
              own UI already occupies the bottom of it. */}
          {run.providerUrl && (
            <a
              href={run.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
            >
              Full size ↗
            </a>
          )}
        </div>
      </div>

      {run.embedUrl ? (
        // Their map, framed from the public share route, given the full width
        // of the page. Keyed on the URL so the date slider reloads the frame:
        // React would otherwise keep the element and only swap the attribute,
        // which some browsers do not treat as a navigation.
        <iframe
          key={run.embedUrl}
          src={run.embedUrl}
          title={`Ranking map for ${active.term} on ${run.label}`}
          className="w-full block border-0 bg-gray-100 h-[92vh] min-h-[720px]"
          loading="lazy"
          // allow-storage-access-by-user-activation matters: their app is
          // cross-site here, so its own storage is partitioned by default,
          // and a map that cannot read its own state is a map that renders
          // at 0,0 in the Atlantic. That was the first attempt's bug — read
          // at the time as "it needs a login", which it does not.
          sandbox="allow-scripts allow-same-origin allow-popups allow-storage-access-by-user-activation"
        />
      ) : (
        // Ours stands in. Never a broken frame in front of a client — whether
        // theirs can be framed is settled server-side before this renders.
        <div className="p-4 sm:p-5">
          {active.fallback || (
            <div className="w-full rounded-xl border border-dashed border-gray-300 grid place-items-center text-sm text-gray-600 p-8 text-center min-h-[200px]">
              This scan didn&apos;t come back with a map.
              {run.providerUrl && (
                <>
                  {' '}
                  <a
                    href={run.providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    Open it directly
                  </a>
                  .
                </>
              )}
            </div>
          )}
          {fallbackReason && (
            <p className="mt-2 text-[11px] text-gray-500">Showing our own map: {fallbackReason}</p>
          )}
        </div>
      )}

      <div className="px-4 sm:px-5 py-4 space-y-4">
        {multiple && (
          <div>
            <input
              type="range"
              min={0}
              max={active.runs.length - 1}
              step={1}
              value={index}
              onChange={(e) =>
                setIndexes((prev) => ({ ...prev, [active.term]: Number(e.target.value) }))
              }
              className="w-full accent-[var(--brand-ink,#1e40af)]"
              aria-label={`Scan date for ${active.term}`}
            />
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>{active.runs[0].label}</span>
              <span>{active.runs[active.runs.length - 1].label}</span>
            </div>
          </div>
        )}

        {/* Only when there is a trend. A line of text explaining that a chart
            is absent is clutter sitting under a map that is already tall. */}
        {active.runs.length >= 2 && (
          <RankTrend
            points={active.runs.map((r) => ({ date: r.date, averageRank: r.averageRank }))}
          />
        )}

      </div>
    </section>
  )
}
