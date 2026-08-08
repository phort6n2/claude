import { Phone, MapPin, ShieldCheck } from 'lucide-react'
import type { SiteExtras } from '@/lib/site-content'

/**
 * Shared building blocks for hosted client sites (home + service pages),
 * styled after the landing-template reference build (collisionglass.co):
 * light theme on brand-tinted surfaces, brand-gradient CTAs, gold stroked
 * stars, dark bands for warranty/footer. All colors come from the CSS
 * variables emitted by sitePaletteVars() on the page root.
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

/* ------------------------------------------------------------------ atoms */

/** Uppercase section label with the accent bar above, per the template. */
export function Eyebrow({ children, center, onDark }: { children: React.ReactNode; center?: boolean; onDark?: boolean }) {
  return (
    <p
      className={`text-[13px] font-bold uppercase tracking-[.09em] mb-2.5 ${
        onDark ? 'text-[var(--brand-light)]' : 'text-[var(--brand)]'
      } ${center ? 'text-center' : ''}`}
    >
      <span
        className={`block w-[26px] h-[3px] rounded-sm mb-3 bg-[var(--cta)] ${center ? 'mx-auto' : ''}`}
      />
      {children}
    </p>
  )
}

/** Gold stars with a dark stroke so the rating is never color-only. */
export function StarRow({ rating, size = 16, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex gap-px leading-none ${className || ''}`}
      aria-label={`${rating} out of 5 stars`}
      style={{ fontSize: size }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            color: 'var(--gold)',
            WebkitTextStroke: '0.9px var(--gold-stroke)',
            opacity: i <= Math.round(rating) ? 1 : 0.35,
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.2 3.5 2.7h.2c2.2-2 3.5-5 3.5-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.7 2.8v.2C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4c-.3-.7-.4-1.5-.4-2.4 0-.8.2-1.6.4-2.4V9.4L1.5 6.6l-.1.1C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l3.9-3z" />
      <path fill="#EB4335" d="M12 4.6c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.9 3c.9-2.9 3.6-5 6.7-5z" />
    </svg>
  )
}

/** Brand-gradient primary action button. */
export function CtaButton({ href, children, block }: { href: string; children: React.ReactNode; block?: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-[14px] font-bold text-[17px] text-white shadow-lg hover:-translate-y-px transition-transform ${
        block ? 'flex w-full' : ''
      }`}
      style={{ background: 'linear-gradient(180deg, var(--cta), var(--cta-b))' }}
    >
      {children}
    </a>
  )
}

/** Call button — solid brand on light surfaces, inverted white on dark bands. */
export function CallButton({ client, onDark, block }: { client: SiteClient; onDark?: boolean; block?: boolean }) {
  return (
    <a
      href={telHrefFor(client.phone)}
      className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-[14px] font-bold text-[17px] shadow ${
        onDark ? 'bg-white text-[var(--cta)]' : 'text-white bg-[var(--cta)]'
      } ${block ? 'flex w-full' : ''}`}
    >
      <Phone className="h-4 w-4" />
      {client.phone}
    </a>
  )
}

/* -------------------------------------------------------------- top bars */

/** Thin dark strip above the header: one factual note + the phone number. */
export function UtilBar({ client, note }: { client: SiteClient; note: string }) {
  return (
    <div className="bg-[var(--dark)] text-[var(--on-dark-2)] text-[13px]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[34px] py-1.5 flex items-center justify-between gap-4">
        <span className="flex-1 min-w-0 truncate">{note}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <span className="hidden sm:inline">Call</span>
          <a href={telHrefFor(client.phone)} className="font-bold no-underline text-[var(--gold-on-dark)]">
            {client.phone}
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * Sticky header: logo/name, live rating in the middle (only when cached GBP
 * data exists — never fabricated), solid brand call button.
 */
export function SiteHeader({
  client,
  basePath,
  reviews,
}: {
  client: SiteClient
  basePath: string
  reviews?: ReviewsData | null
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[64px] flex items-center gap-4">
        <a href={basePath || '/'} className="flex items-center gap-3 min-w-0 no-underline">
          {client.logoUrl ? (
            // Natural aspect at 44px tall, like the template's .brand img —
            // wordmark logos must never be cropped into a circle.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt={client.businessName}
              className="h-11 w-auto max-w-[220px] object-contain shrink-0"
            />
          ) : (
            <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold shrink-0 bg-[var(--brand)]">
              {client.businessName[0]}
            </div>
          )}
          {/* A wordmark logo already carries the name — show the text only
              when the logo is a mark or missing. Heuristic: always render on
              small screens where the logo is capped anyway, hide beside wide
              logos via the truncate cap. */}
          <span className={`font-bold truncate text-[var(--tx)] ${client.logoUrl ? 'hidden min-[480px]:inline' : ''}`}>
            {client.businessName}
          </span>
        </a>
        {reviews && (
          <div className="mx-auto hidden min-[380px]:flex flex-col items-center leading-none gap-0.5">
            <span className="flex items-center gap-1.5">
              <GoogleG size={14} />
              <span className="text-[15px] font-extrabold text-[var(--tx)] tabular-nums">
                {reviews.rating.toFixed(1)}
              </span>
              <StarRow rating={reviews.rating} size={11} />
            </span>
            <span className="text-[10px] font-semibold text-[var(--tx-muted)] whitespace-nowrap">
              {reviews.reviewCount} Google reviews
            </span>
          </div>
        )}
        <a
          href={telHrefFor(client.phone)}
          className={`${reviews ? '' : 'ml-auto '}inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[14px] font-extrabold text-[15px] text-white shrink-0 no-underline bg-[var(--cta)] shadow-sm`}
        >
          <Phone className="h-4 w-4" />
          <span className="hidden sm:inline">{client.phone}</span>
          <span className="sr-only">Call us</span>
        </a>
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------- bands */

/**
 * Google rating chip for the hero. Rendered ONLY from live cached data —
 * callers pass null when there is none and the chip disappears entirely.
 */
export function RatingChip({ reviews, client }: { reviews: ReviewsData | null; client: SiteClient }) {
  if (!reviews) return null
  const inner = (
    <>
      <GoogleG />
      <span className="text-2xl font-extrabold tracking-tight text-[var(--tx)] tabular-nums">
        {reviews.rating.toFixed(1)}
      </span>
      <span className="flex flex-col gap-0.5 leading-tight">
        <StarRow rating={reviews.rating} size={14} />
        <span className="text-[13px] text-[var(--tx-muted)]">
          from {reviews.reviewCount} Google reviews
        </span>
      </span>
    </>
  )
  const cls =
    'inline-flex items-center gap-2.5 min-h-[52px] px-4 py-2 bg-white border border-[var(--line-card)] rounded-full shadow-sm no-underline'
  return client.googleMapsUrl ? (
    <a href={client.googleMapsUrl} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  )
}

/** "What customers say" band on the s2 tint. Stripped without live data. */
export function ReviewsBand({ reviews }: { reviews: ReviewsData | null }) {
  if (!reviews) return null
  return (
    <section className="bg-[var(--s2)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="text-center max-w-xl mx-auto">
          <Eyebrow center>What customers say</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--tx)]">
            {reviews.rating.toFixed(1)} stars from {reviews.reviewCount} Google reviews
          </h2>
          <div className="mt-3 flex justify-center">
            <StarRow rating={reviews.rating} size={22} />
          </div>
        </div>
        {reviews.quotes.length > 0 && (
          <div className="mt-9 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {reviews.quotes.slice(0, 3).map((q, i) => (
              <figure
                key={i}
                className="p-5 rounded-[20px] border border-[var(--line-card)] shadow-sm bg-white flex flex-col m-0"
              >
                <StarRow rating={q.rating} size={13} className="mb-2" />
                <blockquote className="m-0 text-sm text-[var(--tx2)] flex-1 leading-relaxed">
                  “{q.text.length > 220 ? q.text.slice(0, 220).trimEnd() + '…' : q.text}”
                </blockquote>
                <figcaption className="mt-3 text-xs font-semibold text-[var(--tx-muted)]">
                  {q.author}
                  {q.relativeTime ? ` · ${q.relativeTime}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Warranty on a dark brand band, template-style. Rendered only when warranty
 * text exists, and always shows the definition in full beside the claim — a
 * warranty headline without its terms is the compliance failure the
 * landing-template rules exist to prevent.
 */
export function WarrantyBand({ extras }: { extras: SiteExtras | null }) {
  if (!extras?.warrantyText) return null
  return (
    <section className="bg-[var(--dark)] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 text-center">
        <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-[var(--brand-light)]" />
        <Eyebrow center onDark>
          Our warranty
        </Eyebrow>
        <h2 className="text-3xl font-extrabold tracking-tight">
          {extras.warrantyTitle || 'What the warranty covers'}
        </h2>
        <p className="mt-4 text-[var(--on-dark-2)] text-[15px] leading-relaxed whitespace-pre-line">
          {extras.warrantyText}
        </p>
      </div>
    </section>
  )
}

/** "Range of work" photo grid. Stripped entirely when no photos exist. */
export function GalleryGrid({ extras }: { extras: SiteExtras | null }) {
  if (!extras || extras.galleryPhotos.length === 0) return null
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="text-center max-w-xl mx-auto mb-9">
          <Eyebrow center>Recent jobs</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--tx)]">
            Real vehicles, real work
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {extras.galleryPhotos.slice(0, 6).map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.url}
              src={photo.url}
              alt={photo.alt}
              loading="lazy"
              className="w-full aspect-[4/3] object-cover rounded-[14px] border border-[var(--line-card)]"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

/** FAQ accordion. Stripped when the client has no FAQ content. */
export function FaqSection({ extras }: { extras: SiteExtras | null }) {
  if (!extras || extras.faq.length === 0) return null
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="text-center mb-8">
          <Eyebrow center>Good to know</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--tx)]">
            Frequently asked
          </h2>
        </div>
        <div className="space-y-3">
          {extras.faq.map((item) => (
            <details
              key={item.q}
              className="group rounded-[14px] border border-[var(--line-card)] bg-white px-5 py-4 shadow-sm"
            >
              <summary className="font-bold cursor-pointer list-none flex items-center justify-between gap-3 text-[var(--tx)]">
                {item.q}
                <span className="text-[var(--tx-muted)] group-open:rotate-45 transition-transform text-xl leading-none">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-[var(--tx2)] leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/** FAQPage JSON-LD — emitted only when FAQ content exists. */
export function faqJsonLd(extras: SiteExtras | null): object | null {
  if (!extras || extras.faq.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: extras.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

/** Closing dark CTA band. */
export function FinalCta({ client, quoteHref }: { client: SiteClient; quoteHref: string }) {
  return (
    <section
      className="text-white"
      style={{ background: 'linear-gradient(160deg, var(--dark-3), var(--dark-2))' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center">
        <Eyebrow center onDark>
          Free quote · No obligation
        </Eyebrow>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Ready to fix that glass?
        </h2>
        <p className="mt-3 text-[var(--on-dark-2)]">
          Get a free quote in minutes — or call and talk to a real person now.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CtaButton href={quoteHref}>Get my free quote</CtaButton>
          <CallButton client={client} onDark />
        </div>
      </div>
    </section>
  )
}

export function SiteFooter({ client, extras }: { client: SiteClient; extras?: SiteExtras | null }) {
  return (
    <footer className="bg-[var(--dark-2)] text-[var(--on-dark-2)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-4 text-sm">
        {extras?.footerBlurb && <p className="max-w-3xl m-0">{extras.footerBlurb}</p>}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--line-on-dark)] pt-4">
          <div>
            <span className="font-bold text-white">{client.businessName}</span>
            {client.hasShopLocation && (
              <>
                {' '}
                · {client.streetAddress}, {client.city}, {client.state} {client.postalCode}
              </>
            )}
          </div>
          {/* Kept as a plain, un-swapped text instance so call-asset verification
              can always read the real number, per the landing-template rule. */}
          <a href={telHrefFor(client.phone)} className="font-bold no-underline text-[var(--gold-on-dark)]">
            {client.phone}
          </a>
        </div>
        {/* Regulator line — rendered only when a registration number is set.
            Some licensed trades must show this in internet advertising
            (California auto glass: 16 CCR § 3371.2). */}
        {extras?.registrationNumber && (
          <p className="text-xs opacity-70 m-0">
            {extras.registrationName || client.businessName} · Registration No.{' '}
            {extras.registrationNumber}
          </p>
        )}
      </div>
    </footer>
  )
}

export function MobileCallBar({ client, quoteHref }: { client: SiteClient; quoteHref: string }) {
  return (
    <div className="sm:hidden sticky bottom-0 z-40 p-3 bg-white/95 backdrop-blur border-t border-[var(--line-card)] flex gap-2">
      <a
        href={telHrefFor(client.phone)}
        className="flex-1 py-3 rounded-[14px] font-bold text-white text-center flex items-center justify-center gap-2 no-underline"
        style={{ background: 'linear-gradient(180deg, var(--cta), var(--cta-b))' }}
      >
        <Phone className="h-4 w-4" /> Call Now
      </a>
      <a
        href={quoteHref}
        className="flex-1 py-3 rounded-[14px] font-bold text-center no-underline text-[var(--cta)] bg-white border-[1.5px] border-[var(--cta)] flex items-center justify-center"
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
