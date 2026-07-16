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
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="flex" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < full || (i === full && hasHalf)
          return (
            <Star
              key={i}
              width={size}
              height={size}
              className={filled ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}
            />
          )
        })}
      </div>
      <span className="text-sm font-medium text-gray-700">{rating.toFixed(1)}</span>
      {reviewCount != null && (
        <span className="text-sm text-gray-500">({reviewCount.toLocaleString()})</span>
      )}
    </div>
  )
}
