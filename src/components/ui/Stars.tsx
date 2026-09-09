import { Star } from 'lucide-react'

/**
 * A Google rating, drawn as stars.
 *
 * "4.8" is a number somebody has to interpret; five stars with one nearly full
 * is a thing they recognise before reading anything. Both the admin's Google
 * reviews card and the shop's own rating tile showed the bare figure, next to
 * an icon that was decoration rather than a reading of the score.
 *
 * PARTIAL, NOT ROUNDED. Rounding 4.4 up to five full stars overstates a real
 * business's rating on a screen that shop owner reads, and rounding it down
 * understates it — so the fifth star is filled to the fraction. The width is
 * the whole trick: a grey row with a gold row clipped over it.
 *
 * The number stays beside it. Stars alone lose the difference between 4.6 and
 * 4.8, which is exactly the difference a shop cares about.
 */
export default function Stars({
  rating,
  size = 14,
  className = '',
}: {
  rating: number
  /** Pixel height. Small enough to sit on a line of text by default. */
  size?: number
  className?: string
}) {
  // Out-of-range input is clamped rather than trusted: this renders whatever a
  // third-party feed last returned, and a 6 would otherwise draw a sixth star's
  // worth of gold spilling past the row.
  const value = Math.max(0, Math.min(5, Number.isFinite(rating) ? rating : 0))
  const pct = (value / 5) * 100

  const row = (fill: string) => (
    <span className="flex" style={{ gap: size * 0.1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} style={{ width: size, height: size }} fill={fill} stroke={fill} />
      ))}
    </span>
  )

  return (
    <span
      className={`relative inline-flex align-middle ${className}`}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      {row('#e5e7eb')}
      {/* Clipped to the score. aria-hidden because the label above already
          says the number — a screen reader should hear it once, not ten times. */}
      <span
        aria-hidden
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {row('#f59e0b')}
      </span>
    </span>
  )
}
