/**
 * Average position over time, for one keyword.
 *
 * The y-axis is INVERTED — rank 1 sits at the top — because everywhere else
 * a line going up means things are getting better, and a chart where
 * improvement points downward gets misread by the person it is meant to
 * reassure.
 *
 * Scans where the shop appeared nowhere carry no average, so they break the
 * line rather than being plotted as zero. A gap is honest; a zero would draw
 * a spike to the top of the chart and read as a perfect week.
 */

interface TrendPoint {
  date: string
  averageRank: number | null
}

export default function RankTrend({ points }: { points: TrendPoint[] }) {
  const plotted = points.filter((p) => typeof p.averageRank === 'number')
  if (plotted.length < 2) return null

  const W = 320
  const H = 72
  const PAD = 6
  const ranks = plotted.map((p) => p.averageRank as number)
  const best = Math.min(...ranks)
  const worst = Math.max(...ranks)
  // A flat line would divide by zero; give it a band so it draws centred.
  const span = worst - best < 0.6 ? 0.6 : worst - best

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (rank: number) => PAD + ((rank - best) / span) * (H - PAD * 2)

  // Build the path in segments so a scan with no ranking leaves a gap.
  const segments: string[] = []
  let current: string[] = []
  points.forEach((p, i) => {
    if (typeof p.averageRank === 'number') {
      current.push(`${current.length === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.averageRank).toFixed(1)}`)
    } else if (current.length) {
      segments.push(current.join(' '))
      current = []
    }
  })
  if (current.length) segments.push(current.join(' '))

  const first = ranks[0]
  const last = ranks[ranks.length - 1]
  // Lower is better, so a DROP in the number is an improvement.
  const improved = last < first - 0.1
  const worsened = last > first + 0.1
  const stroke = improved ? '#16a34a' : worsened ? '#dc2626' : '#64748b'

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {points.map((p, i) =>
          typeof p.averageRank === 'number' ? (
            <circle key={i} cx={x(i)} cy={y(p.averageRank)} r="2.5" fill={stroke} />
          ) : null
        )}
      </svg>
      <p className="mt-1 text-xs text-gray-600">
        {improved
          ? `Improved from ${first.toFixed(1)} to ${last.toFixed(1)} average position`
          : worsened
            ? `Moved from ${first.toFixed(1)} to ${last.toFixed(1)} average position`
            : `Holding around position ${last.toFixed(1)}`}
      </p>
    </div>
  )
}
