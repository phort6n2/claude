/**
 * The geogrid, drawn.
 *
 * Each cell is one point on the map around the shop, coloured by where they
 * rank in Google's local results when someone searches from there. This is
 * the artifact a client actually understands — "green near the shop, red
 * three suburbs over" needs no explanation — and it is the reason the whole
 * scan exists.
 *
 * A point where the business does not appear at all renders as an explicit
 * dash on a grey cell, never as a blank or a zero. Being invisible somewhere
 * IS the finding, and a gap in the grid reads as missing data instead.
 */

/** Local-pack convention: top 3 is the pack, top 10 is page one. */
function cellStyle(rank: number | null): { bg: string; fg: string } {
  if (rank === null) return { bg: 'bg-gray-200', fg: 'text-gray-400' }
  if (rank <= 3) return { bg: 'bg-green-600', fg: 'text-white' }
  if (rank <= 6) return { bg: 'bg-lime-500', fg: 'text-white' }
  if (rank <= 10) return { bg: 'bg-amber-400', fg: 'text-amber-950' }
  if (rank <= 15) return { bg: 'bg-orange-500', fg: 'text-white' }
  return { bg: 'bg-red-600', fg: 'text-white' }
}

export default function RankHeatmap({
  grid,
  label,
}: {
  grid: Array<Array<number | null>>
  label?: string
}) {
  const size = grid.length
  if (size === 0) return null

  return (
    <div>
      <div
        className="grid gap-[3px] w-full max-w-[420px]"
        style={{ gridTemplateColumns: `repeat(${grid[0]?.length || size}, minmax(0, 1fr))` }}
        role="img"
        aria-label={
          label
            ? `Ranking heatmap for ${label}: ${size} by ${grid[0]?.length || size} grid of search points`
            : 'Ranking heatmap'
        }
      >
        {grid.flatMap((row, y) =>
          row.map((rank, x) => {
            const { bg, fg } = cellStyle(rank)
            return (
              <div
                key={`${y}-${x}`}
                className={`${bg} ${fg} aspect-square rounded-[3px] flex items-center justify-center text-[10px] font-bold tabular-nums`}
                title={rank === null ? 'Not in results here' : `Rank ${rank}`}
              >
                {rank === null ? '–' : rank > 20 ? '20+' : rank}
              </div>
            )
          })
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-green-600 inline-block" /> Top 3</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-lime-500 inline-block" /> 4–6</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400 inline-block" /> 7–10</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-orange-500 inline-block" /> 11–15</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-red-600 inline-block" /> 16+</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-gray-200 inline-block" /> Not showing</span>
      </div>
    </div>
  )
}
