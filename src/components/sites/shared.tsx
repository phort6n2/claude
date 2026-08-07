import { Phone, Star, MapPin } from 'lucide-react'

/**
 * Shared building blocks for hosted client sites (home + service pages).
 * Server components only — no client JS beyond the quote widget.
 */

export interface SiteClient {
  slug: string
  businessName: string
  phone: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  logoUrl: string | null
  primaryColor: string | null
  accentColor: string | null
  hasShopLocation: boolean
  googleMapsUrl: string | null
}

export interface ReviewQuote {
  author: string
  rating: number
  text: string
  relativeTime: string
}

export interface ReviewsData {
  rating: number
  reviewCount: number
  quotes: ReviewQuote[]
}

export function telHrefFor(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

export function SiteHeader({ client, basePath }: { client: SiteClient; basePath: string }) {
  const primary = client.primaryColor || '#1e40af'
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <a href={basePath || '/'} className="flex items-center gap-3 min-w-0">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt={client.businessName}
              className="h-10 w-10 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
              style={{ backgroundColor: primary }}
            >
              {client.businessName[0]}
            </div>
          )}
          <span className="font-bold truncate text-gray-900">{client.businessName}</span>
        </a>
        <a
          href={telHrefFor(client.phone)}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full text-white font-semibold text-sm shrink-0"
          style={{ backgroundColor: primary }}
        >
          <Phone className="h-4 w-4" />
          {client.phone}
        </a>
      </div>
    </header>
  )
}

export function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className || ''}`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-4 w-4"
          fill={i <= Math.round(rating) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

/**
 * Rating band. Rendered ONLY when live cached data exists — callers must pass
 * null when there is none, and the band disappears entirely (never an empty
 * shell, never a made-up number).
 */
export function ReviewsBand({
  reviews,
  client,
}: {
  reviews: ReviewsData | null
  client: SiteClient
}) {
  if (!reviews) return null
  const accent = client.accentColor || '#f59e0b'

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
      <div className="text-center">
        <div className="inline-flex items-center gap-3">
          <StarRow rating={reviews.rating} className="text-[22px]" />
          <span className="text-3xl font-extrabold text-gray-900">{reviews.rating.toFixed(1)}</span>
        </div>
        <p className="mt-1 text-gray-500">
          from <span className="font-semibold text-gray-700">{reviews.reviewCount}</span> Google reviews
        </p>
        {client.googleMapsUrl && (
          <a
            href={client.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 text-sm font-semibold underline underline-offset-2"
            style={{ color: client.primaryColor || '#1e40af' }}
          >
            Read them all on Google
          </a>
        )}
      </div>
      {reviews.quotes.length > 0 && (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.quotes.slice(0, 3).map((q, i) => (
            <figure
              key={i}
              className="p-5 rounded-2xl border border-gray-100 shadow-sm bg-white flex flex-col"
            >
              <StarRow rating={q.rating} className="mb-2" />
              <blockquote className="text-sm text-gray-600 flex-1">
                “{q.text.length > 220 ? q.text.slice(0, 220).trimEnd() + '…' : q.text}”
              </blockquote>
              <figcaption className="mt-3 text-xs font-semibold text-gray-500">
                {q.author}
                {q.relativeTime ? ` · ${q.relativeTime}` : ''}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="sr-only" style={{ color: accent }} />
    </section>
  )
}

export function SiteFooter({ client }: { client: SiteClient }) {
  const primary = client.primaryColor || '#1e40af'
  return (
    <footer className="border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
        <div>
          <span className="font-semibold text-gray-700">{client.businessName}</span>
          {client.hasShopLocation && (
            <>
              {' '}
              · {client.streetAddress}, {client.city}, {client.state} {client.postalCode}
            </>
          )}
        </div>
        {/* Kept as a plain, un-swapped text instance so call-asset verification
            can always read the real number, per the landing-template rule. */}
        <a href={telHrefFor(client.phone)} className="font-semibold" style={{ color: primary }}>
          {client.phone}
        </a>
      </div>
    </footer>
  )
}

export function MobileCallBar({ client, quoteHref }: { client: SiteClient; quoteHref: string }) {
  const primary = client.primaryColor || '#1e40af'
  const accent = client.accentColor || '#f59e0b'
  return (
    <div className="sm:hidden sticky bottom-0 z-40 p-3 bg-white/95 backdrop-blur border-t border-gray-200 flex gap-2">
      <a
        href={telHrefFor(client.phone)}
        className="flex-1 py-3 rounded-xl font-bold text-white text-center flex items-center justify-center gap-2"
        style={{ backgroundColor: primary }}
      >
        <Phone className="h-4 w-4" /> Call Now
      </a>
      <a
        href={quoteHref}
        className="flex-1 py-3 rounded-xl font-bold text-gray-900 text-center"
        style={{ backgroundColor: accent }}
      >
        Free Quote
      </a>
    </div>
  )
}

export function SiteUnavailable() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <MapPin className="h-10 w-10 mx-auto text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-700">This site is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-gray-500">Please check back soon.</p>
      </div>
    </div>
  )
}
