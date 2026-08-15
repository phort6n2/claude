/**
 * The geogrid, drawn over the shop's actual map.
 *
 * Each pin is one point around the shop, coloured by where they rank in
 * Google's local results when someone searches from there. The map matters:
 * "weak in the upper-left" is not a conversation a shop owner can act on,
 * but "weak on the north side of town" is — so the background carries real
 * streets and place names, drained of colour so the ranking is the only
 * thing competing for attention.
 *
 * Pins rather than filled cells, because a solid grid hides the map it is
 * supposed to be explaining. A point where the business does not appear at
 * all is drawn as a hollow grey pin with a dash, never omitted: being
 * invisible somewhere IS the finding, and a gap reads as missing data.
 */

/** Local-pack convention: the top 3 is the pack, the top 10 is page one. */
function pinColor(rank: number | null): { bg: string; ring: string; text: string } {
  if (rank === null) return { bg: 'rgba(148,163,184,.75)', ring: 'rgba(255,255,255,.75)', text: '#f8fafc' }
  if (rank <= 3) return { bg: 'rgba(22,163,74,.95)', ring: '#fff', text: '#fff' }
  if (rank <= 6) return { bg: 'rgba(132,204,22,.95)', ring: '#fff', text: '#1a2e05' }
  if (rank <= 10) return { bg: 'rgba(250,204,21,.95)', ring: '#fff', text: '#422006' }
  if (rank <= 15) return { bg: 'rgba(249,115,22,.95)', ring: '#fff', text: '#fff' }
  return { bg: 'rgba(220,38,38,.95)', ring: '#fff', text: '#fff' }
}

const LEGEND: Array<[string, string]> = [
  ['Top 3', 'rgba(22,163,74,.95)'],
  ['4–6', 'rgba(132,204,22,.95)'],
  ['7–10', 'rgba(250,204,21,.95)'],
  ['11–15', 'rgba(249,115,22,.95)'],
  ['16+', 'rgba(220,38,38,.95)'],
  ['Not showing', 'rgba(148,163,184,.75)'],
]

export default function RankHeatmap({
  grid,
  label,
  mapUrl,
}: {
  grid: Array<Array<number | null>>
  label?: string
  /** Background map. Without one the pins render on a plain surface. */
  mapUrl?: string | null
}) {
  const rows = grid.length
  if (rows === 0) return null
  const cols = grid[0]?.length || rows

  return (
    <div>
      <div
        className="relative w-full max-w-[460px] aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100"
        role="img"
        aria-label={
          label
            ? `Ranking map for ${label}: ${rows} by ${cols} grid of search points around the business`
            : 'Ranking map'
        }
      >
        {mapUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mapUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Pins are inset by half a cell so the outermost ones sit at the
            true edge of the scanned area rather than on the frame. */}
        <div
          className="absolute grid"
          style={{
            inset: `${50 / rows}% ${50 / cols}%`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {grid.flatMap((row, y) =>
            row.map((rank, x) => {
              const { bg, ring, text } = pinColor(rank)
              return (
                <div key={`${y}-${x}`} className="flex items-center justify-center">
                  <span
                    className="rounded-full flex items-center justify-center font-bold tabular-nums shadow-sm"
                    style={{
                      background: bg,
                      color: text,
                      boxShadow: `0 0 0 1.5px ${ring}, 0 1px 4px rgba(0,0,0,.35)`,
                      // Deliberately under 70% of the cell: at a 10x10 grid
                      // the pins otherwise touch and cover the streets they
                      // exist to explain.
                      width: 'min(66%, 27px)',
                      height: 'min(66%, 27px)',
                      fontSize: 'clamp(8px, 1.8vw, 11px)',
                    }}
                    title={rank === null ? 'Not in results here' : `Rank ${rank}`}
                  >
                    {rank === null ? '–' : rank > 20 ? '20+' : rank}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
        {LEGEND.map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
