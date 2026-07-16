import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  rating: number
  reviewCount?: number
  size?: number
  className?: string
}

export function StarRating({ rating, reviewCount, size = 16, className }: StarRatingProps) {
  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.5
  const label =
    reviewCount != null
      ? `Rated ${rating.toFixed(1)} out of 5 from ${reviewCount.toLocaleString()} reviews`
      : `Rated ${rating.toFixed(1)} out of 5`

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="img"
      aria-label={label}
    >
      <div className="flex" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < full
          const half = i === full && hasHalf
          if (half) {
            return (
              <span
                key={i}
                className="relative inline-flex"
                style={{ width: size, height: size }}
              >
                <Star
                  width={size}
                  height={size}
                  className="absolute inset-0 fill-gray-200 text-gray-200"
                />
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: size / 2 }}
                >
                  <Star
                    width={size}
                    height={size}
                    className="fill-amber-400 text-amber-400"
                  />
                </span>
              </span>
            )
          }
          return (
            <Star
              key={i}
              width={size}
              height={size}
              className={cn(
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-gray-200 text-gray-200'
              )}
            />
          )
        })}
      </div>
      <span className="text-sm font-semibold text-gray-700">{rating.toFixed(1)}</span>
      {reviewCount != null && (
        <span className="text-sm text-gray-500">
          ({reviewCount.toLocaleString()})
        </span>
      )}
    </div>
  )
}
