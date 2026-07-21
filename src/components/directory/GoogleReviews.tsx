import { ExternalLink } from 'lucide-react'
import { StarRating } from './StarRating'

// The Google "G" — inline so it renders anywhere with no external asset, and
// so we attribute ratings to Google as their platform terms require.
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.94 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

export function GoogleReviews({
  rating,
  count,
  url,
}: {
  rating: number
  count: number
  url: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2">
        <GoogleG />
        <span className="text-sm font-semibold text-gray-900">Google reviews</span>
      </div>
      <div className="mt-3">
        <StarRating rating={rating} size={18} />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {count.toLocaleString()} {count === 1 ? 'review' : 'reviews'} on Google
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        Read reviews on Google <ExternalLink width={14} height={14} />
      </a>
    </div>
  )
}
