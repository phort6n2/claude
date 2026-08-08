import { Phone, MapPin, ShieldCheck, Check } from 'lucide-react'
import type { SiteExtras } from '@/lib/site-content'

/**
 * Shared building blocks for hosted client sites (home + service pages),
 * styled after the landing-template reference build (collisionglass.co):
 * light theme on brand-tinted surfaces, brand-gradient CTAs, gold stroked
 * stars, dark bands for stats/areas/final, tinted warranty band. All colors
 * come from the CSS variables emitted by sitePaletteVars() on the page root.
 * Server components only — no client JS beyond the quote widget.
 */

export interface SiteClient {
  slug: string
  businessName: string
  phone: string
  email?: string | null
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

export interface SiteNavLink {
  href: string
  label: string
}

export function telHrefFor(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

/**
 * Page-level base rules the reference sets on bare elements: visible focus
 * ring, link underline metrics, balanced headings, and a scroll-driven header
 * shadow (progressive enhancement — browsers without scroll timelines simply
 * keep the flat header).
 */
const SITE_BASE_CSS = `
.gl-site :focus-visible{outline:3px solid var(--ring);outline-offset:2px;border-radius:6px}
.gl-site .on-dark :focus-visible{outline-color:#fff}
.gl-site a{text-decoration-thickness:1.5px;text-underline-offset:3px}
.gl-site h1,.gl-site h2,.gl-site h3{text-wrap:balance}
@supports (animation-timeline: scroll()) {
  .gl-site .site-hdr{animation:gl-hdr-shadow linear both;animation-timeline:scroll();animation-range:0 60px}
  @keyframes gl-hdr-shadow{to{background:#fff;box-shadow:0 2px 4px -1px rgba(11,27,43,.06),0 6px 14px -3px rgba(11,27,43,.09)}}
}
`

export function SiteBaseStyles() {
  return <style dangerouslySetInnerHTML={{ __html: SITE_BASE_CSS }} />
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

/** Left-aligned section head: eyebrow + h2 + optional lead, per .sec-head. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  center,
  onDark,
}: {
  eyebrow: string
  title: string
  lead?: string
  center?: boolean
  onDark?: boolean
}) {
  return (
    <div className={`max-w-[60ch] mb-8 ${center ? 'mx-auto text-center' : ''}`}>
      <Eyebrow center={center} onDark={onDark}>
        {eyebrow}
      </Eyebrow>
      <h2
        className={`text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight ${
          onDark ? 'text-white' : 'text-[var(--tx)]'
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p className={`mt-3 text-[17px] leading-[1.55] ${onDark ? 'text-[var(--on-dark-2)]' : 'text-[var(--tx2)]'}`}>
          {lead}
        </p>
      )}
    </div>
  )
}

/** Gold stars with a size-scaled dark stroke so the rating is never color-only. */
export function StarRow({ rating, size = 16, className }: { rating: number; size?: number; className?: string }) {
  const stroke = (size * 0.056).toFixed(2)
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
            WebkitTextStroke: `${stroke}px var(--gold-stroke)`,
            paintOrder: 'stroke fill',
            opacity: i <= Math.round(rating) ? 1 : 0.55,
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.2 3.5 2.7h.2c2.2-2 3.5-5 3.5-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.7 2.8v.2C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4c-.3-.7-.4-1.5-.4-2.4 0-.8.2-1.6.4-2.4V9.4L1.5 6.6l-.1.1C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l3.9-3z" />
      <path fill="#EB4335" d="M12 4.6c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.9 3c.9-2.9 3.6-5 6.7-5z" />
    </svg>
  )
}

/** Brand-gradient primary action button with the brand-tinted CTA shadow. */
export function CtaButton({ href, children, block }: { href: string; children: React.ReactNode; block?: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-[14px] font-bold text-[17px] text-white no-underline hover:-translate-y-px transition-transform ${
        block ? 'flex w-full' : ''
      }`}
      style={{
        background: 'linear-gradient(180deg, var(--cta), var(--cta-b))',
        boxShadow: 'var(--sh-cta), inset 0 1px 0 rgba(255,255,255,.2)',
      }}
    >
      {children}
    </a>
  )
}

/** Call button — solid brand on light surfaces, inverted white on dark bands. */
export function CallButton({
  client,
  onDark,
  block,
  withLabel,
}: {
  client: SiteClient
  onDark?: boolean
  block?: boolean
  withLabel?: boolean
}) {
  return (
    <a
      href={telHrefFor(client.phone)}
      className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-[14px] font-bold text-[17px] no-underline shadow-[0_1px_2px_rgba(11,27,43,.16)] transition-colors ${
        onDark
          ? 'bg-white text-[var(--cta)] border-[1.5px] border-white'
          : 'text-white bg-[var(--cta)] border-[1.5px] border-[var(--cta)] hover:bg-[var(--cta-b)] hover:border-[var(--cta-b)]'
      } ${block ? 'flex w-full' : ''}`}
    >
      <Phone className="h-[18px] w-[18px]" />
      {withLabel ? `Call ${client.phone}` : client.phone}
    </a>
  )
}

/* -------------------------------------------------------------- top bars */

/**
 * Thin dark strip above the header. The note's tail (after " — ") drops on
 * phones so small screens get a complete short sentence instead of an
 * ellipsis mid-thought; the call block never reflows.
 */
export function UtilBar({ client, note }: { client: SiteClient; note: string }) {
  const [noteHead, ...noteRest] = note.split(' — ')
  const noteTail = noteRest.length ? ` — ${noteRest.join(' — ')}` : ''
  return (
    <div className="max-[359px]:hidden bg-[var(--dark)] text-[var(--on-dark-2)] text-[13px] on-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[34px] py-1.5 flex items-center justify-between gap-4">
        <span className="flex-1 min-w-0 truncate">
          {noteHead}
          {noteTail && <span className="hidden sm:inline">{noteTail}</span>}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <span>Call</span>
          <a
            href={telHrefFor(client.phone)}
            className="font-bold no-underline hover:underline text-[var(--gold-on-dark)]"
          >
            {client.phone}
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * Sticky header: logo (natural aspect, name text only when there is no
 * wordmark), desktop nav from the client's live service pages, live rating on
 * mobile (only when cached GBP data exists — never fabricated), solid brand
 * call button. Scroll shadow comes from SiteBaseStyles.
 */
export function SiteHeader({
  client,
  basePath,
  reviews,
  nav,
}: {
  client: SiteClient
  basePath: string
  reviews?: ReviewsData | null
  nav?: SiteNavLink[]
}) {
  return (
    <header className="site-hdr sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[64px] lg:min-h-[72px] flex items-center gap-4">
        <a href={basePath || '/'} className="flex items-center gap-3 min-w-0 no-underline shrink-0">
          {client.logoUrl ? (
            // Natural aspect, like the template's .brand img — wordmark logos
            // must never be cropped into a circle, and they already carry the
            // name, so no text beside them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt={client.businessName}
              className="h-[52px] w-auto max-w-[240px] object-contain"
            />
          ) : (
            <>
              <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold shrink-0 bg-[var(--brand)]">
                {client.businessName[0]}
              </div>
              <span className="font-bold truncate text-[var(--tx)]">{client.businessName}</span>
            </>
          )}
        </a>
        {nav && nav.length > 0 && (
          <nav className="hidden lg:flex gap-[22px] ml-auto" aria-label="Services">
            {nav.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[15px] font-semibold text-[var(--tx2)] no-underline whitespace-nowrap py-1.5 hover:text-[var(--tx)] hover:shadow-[inset_0_-2px_0_var(--cta)]"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}
        {reviews && (
          <div className="mx-auto lg:hidden hidden min-[340px]:flex flex-col items-center leading-none gap-0.5">
            <span className="flex items-center gap-1.5">
              <GoogleG size={14} />
              <span className="text-[15px] font-extrabold text-[var(--tx)] tabular-nums">
                {reviews.rating.toFixed(1)}
              </span>
              <StarRow rating={reviews.rating} size={11} />
            </span>
            <span className="hidden min-[390px]:inline text-[10px] font-semibold text-[var(--tx-muted)] whitespace-nowrap">
              {reviews.reviewCount} Google reviews
            </span>
          </div>
        )}
        <a
          href={telHrefFor(client.phone)}
          className={`${nav && nav.length > 0 ? 'lg:ml-4 ' : ''}${reviews ? '' : 'ml-auto '}inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[14px] font-extrabold text-[15px] text-white shrink-0 no-underline bg-[var(--cta)] border-[1.5px] border-[var(--cta)] shadow-[0_1px_2px_rgba(11,27,43,.16)] hover:bg-[var(--cta-b)] hover:border-[var(--cta-b)] transition-colors`}
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
        <StarRow rating={reviews.rating} size={16} />
        <span className="text-[13px] text-[var(--tx-muted)]">
          {reviews.reviewCount} Google reviews
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

const AVATAR_COLORS = ['#0B57D0', '#B3261E', '#146C2E', '#7B4397', '#B26A00']

/** "What customers say" band on the s2 tint. Stripped without live data. */
export function ReviewsBand({ reviews }: { reviews: ReviewsData | null }) {
  if (!reviews) return null
  return (
    <section className="bg-[var(--s2)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="Reviews"
          title="What customers say"
          lead="Pulled straight from our Google listing — real customers, real jobs."
        />
        {reviews.quotes.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {reviews.quotes.slice(0, 3).map((q, i) => (
              <figure
                key={i}
                className="p-5 rounded-[20px] border border-[var(--line-card)] shadow-sm bg-white flex flex-col m-0"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                  >
                    {(q.author || 'G')[0].toUpperCase()}
                  </span>
                  <span className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="text-sm font-bold text-[var(--tx)] truncate">{q.author}</span>
                    {q.relativeTime && (
                      <span className="text-xs text-[var(--tx-muted)]">{q.relativeTime}</span>
                    )}
                  </span>
                  <GoogleG size={16} />
                </div>
                <StarRow rating={q.rating} size={13} className="mb-2" />
                <blockquote className="m-0 text-sm text-[var(--tx2)] flex-1 leading-relaxed">
                  “{q.text.length > 220 ? q.text.slice(0, 220).trimEnd() + '…' : q.text}”
                </blockquote>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Dark stat band, template-style. Every figure is data-derived; stats without
 * data strip, and the whole band strips below two stats.
 */
export function StatBand({
  reviews,
  areasCount,
  servicesCount,
}: {
  reviews: ReviewsData | null
  areasCount: number
  servicesCount: number
}) {
  const stats: Array<{ big: React.ReactNode; label: string }> = []
  if (reviews) {
    stats.push({
      big: (
        <span className="inline-flex items-center gap-2">
          {reviews.rating.toFixed(1)}
          <StarRow rating={reviews.rating} size={16} />
        </span>
      ),
      label: 'Google rating',
    })
    stats.push({ big: String(reviews.reviewCount), label: 'Google reviews' })
  }
  if (areasCount > 1) stats.push({ big: String(areasCount), label: 'cities covered' })
  if (servicesCount > 1) stats.push({ big: String(servicesCount), label: 'glass services' })
  if (stats.length < 2) return null

  return (
    <section
      className="text-white on-dark"
      style={{ background: 'radial-gradient(120% 120% at 50% 0%, var(--dark-3), var(--dark))' }}
    >
      <div
        className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 gap-6 lg:[grid-template-columns:var(--stat-cols)]"
        style={{ '--stat-cols': `repeat(${stats.length}, minmax(0,1fr))` } as React.CSSProperties}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="text-center rounded-[14px] border border-[var(--line-on-dark)] bg-white/[.04] py-6 px-3"
          >
            <div className="text-3xl font-extrabold tabular-nums">{s.big}</div>
            <div className="mt-1.5 text-[13px] font-semibold text-[var(--on-dark-2)] uppercase tracking-wider">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Numbered three-step process on the s2 tint, generic to the trade. */
export function ProcessSection({ client, offersMobileService }: { client: SiteClient; offersMobileService: boolean }) {
  const steps = [
    {
      title: 'Tell us what broke',
      body: 'Fill out the quote form or call — year, make, model, and which glass. Photos help but aren’t required.',
    },
    {
      title: 'We confirm glass and price',
      body: 'We match the exact glass for your vehicle and confirm your price — and your insurance coverage if you’re filing a claim — before anything is scheduled.',
    },
    offersMobileService
      ? {
          title: 'We come to you',
          body: `Home, office, or roadside anywhere we serve — or visit the shop if you prefer. Most jobs are done the same or next day.`,
        }
      : {
          title: 'Drop in and drive off',
          body: 'Bring the vehicle to the shop — most windshields are replaced the same or next day, ready to drive when the adhesive sets.',
        },
  ]
  return (
    <section className="bg-[var(--s2)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="How it works"
          title={offersMobileService ? 'Three steps, no shop visit' : 'Three simple steps'}
        />
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={step.title}>
              <div
                className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-xl font-extrabold mb-4 ${
                  i === steps.length - 1 ? 'bg-[var(--cta)]' : 'bg-[var(--dark-3)]'
                }`}
              >
                {i + 1}
              </div>
              <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold m-0">
                {step.title}
              </h3>
              <p className="mt-2 mb-0 text-sm text-[var(--tx-muted)] leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Insurance band on the warm tint: left head, two claim cards, disclaimer. */
export function InsuranceBand() {
  return (
    <section className="bg-[var(--tint-warm)] border-y border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="Insurance"
          title="We handle the claim with your carrier"
          lead="Glass coverage is usually part of the comprehensive portion of your policy — and we do the paperwork."
        />
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-[20px] border border-[var(--line-card)] shadow-sm p-6">
            <h3 className="font-bold text-lg m-0">Filing through insurance</h3>
            <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">
              We work with your insurance company directly and help you navigate the claim — many
              repairs cost you nothing out of pocket, and you don’t spend your afternoon on hold.
            </p>
          </div>
          <div className="bg-white rounded-[20px] border border-[var(--line-card)] shadow-sm p-6">
            <h3 className="font-bold text-lg m-0">Paying cash</h3>
            <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">
              Not going through insurance? You get a straight price up front, before any work
              starts — no surprises when the job is done.
            </p>
          </div>
        </div>
        <p className="mt-5 mb-0 text-xs text-[var(--tx-muted)]">
          We are an independent glass shop and are not affiliated with or endorsed by any insurance
          company. Your choice of repair shop is yours to make.
        </p>
      </div>
    </section>
  )
}

/**
 * Warranty band on the accent tint with the terms in a card. Rendered only
 * when warranty text exists, and always shows the definition in full beside
 * the claim — a warranty headline without its terms is the compliance failure
 * the landing-template rules exist to prevent.
 */
export function WarrantyBand({ extras }: { extras: SiteExtras | null }) {
  if (!extras?.warrantyText) return null
  return (
    <section className="bg-[var(--tint)] border-y border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12 lg:items-center">
        <div>
          <Eyebrow>Our warranty</Eyebrow>
          <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight text-[var(--tx)] m-0">
            {extras.warrantyTitle || 'What the warranty covers'}
          </h2>
          <p className="mt-3 mb-0 text-[17px] leading-[1.55] text-[var(--tx2)]">
            In writing, in full, right here — not a claim with the terms hidden somewhere else.
          </p>
        </div>
        <div className="bg-white rounded-[20px] border border-[var(--line-card)] shadow-sm p-6 md:p-8">
          <ShieldCheck className="h-8 w-8 mb-3 text-[var(--brand)]" />
          <p className="m-0 text-[15px] text-[var(--tx2)] leading-relaxed whitespace-pre-line">
            {extras.warrantyText}
          </p>
        </div>
      </div>
    </section>
  )
}

/** "Range of work" photo grid as captioned figures. Stripped when empty. */
export function GalleryGrid({ extras }: { extras: SiteExtras | null }) {
  if (!extras || extras.galleryPhotos.length === 0) return null
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead eyebrow="Recent jobs" title="Real vehicles, real work" />
        {/* Even photo counts that don't fill three columns read better 2-up —
            no orphan card on the last row. */}
        <div
          className={`grid grid-cols-2 gap-4 ${
            extras.galleryPhotos.slice(0, 6).length % 3 === 1 ? 'md:grid-cols-2' : 'md:grid-cols-3'
          }`}
        >
          {extras.galleryPhotos.slice(0, 6).map((photo) => (
            <figure
              key={photo.url}
              className="m-0 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.alt}
                loading="lazy"
                className="w-full aspect-[4/3] object-cover"
              />
              {photo.alt && (
                <figcaption className="px-4 py-3 text-[13px] text-[var(--tx-muted)] leading-snug">
                  {photo.alt}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Map + Google listing section, reference composition: a "Verified on
 * Google" head carrying the live review claim, the map beside a fully
 * furnished listing card (rating block, labeled shop address and service
 * area, listing button). Rendered only for clients with a real shop
 * location; every number comes from live cached review data or the DB.
 */
export function MapSection({
  client,
  reviews,
  areas,
  offersMobileService,
}: {
  client: SiteClient
  reviews: ReviewsData | null
  areas?: string[]
  offersMobileService?: boolean
}) {
  if (!client.hasShopLocation) return null
  const query = encodeURIComponent(
    `${client.businessName}, ${client.streetAddress}, ${client.city}, ${client.state} ${client.postalCode}`
  )
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="max-w-[60ch] mx-auto text-center mb-9">
          <p className="text-[13px] font-bold uppercase tracking-[.09em] mb-2.5 text-[var(--brand)]">
            <span className="block w-[26px] h-[3px] rounded-sm mb-3 bg-[var(--cta)] mx-auto" />
            {reviews ? (
              <>
                <span className="inline-block align-[-3px] mr-1.5">
                  <GoogleG size={15} />
                </span>
                Verified on Google
              </>
            ) : (
              'Find us'
            )}
          </p>
          <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight text-[var(--tx)]">
            {reviews
              ? `${reviews.rating.toFixed(1)} stars from ${reviews.reviewCount} Google reviews`
              : `Visit the shop in ${client.city}`}
          </h2>
          {reviews && (
            <div className="mt-2.5 flex justify-center">
              <StarRow rating={reviews.rating} size={22} />
            </div>
          )}
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-stretch">
          <iframe
            title={`Map to ${client.businessName}`}
            src={`https://maps.google.com/maps?q=${query}&output=embed`}
            className="w-full min-h-[360px] h-full rounded-[20px] border border-[var(--line-card)]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="bg-white rounded-[20px] border border-[var(--line-card)] shadow-sm p-6 flex flex-col gap-4">
            {reviews && (
              <>
                <div className="flex items-center gap-2 text-[13px] font-bold tracking-[.02em] text-[var(--tx2)]">
                  <GoogleG size={18} />
                  Google Reviews
                </div>
                <div className="flex items-center gap-3.5">
                  <span className="text-4xl font-extrabold tabular-nums leading-none">
                    {reviews.rating.toFixed(1)}
                  </span>
                  <span className="flex flex-col gap-0.5 leading-tight">
                    <StarRow rating={reviews.rating} size={15} />
                    <span className="text-[13px] text-[var(--tx-muted)]">
                      {reviews.reviewCount} reviews
                    </span>
                  </span>
                </div>
              </>
            )}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.09em] text-[var(--tx-muted)] mb-1">
                {client.city} shop
              </div>
              <div className="text-sm text-[var(--tx2)] leading-relaxed">
                {client.streetAddress}
                <br />
                {client.city}, {client.state} {client.postalCode}
              </div>
            </div>
            {areas && areas.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[.09em] text-[var(--tx-muted)] mb-1">
                  Service area
                </div>
                <div className="text-sm text-[var(--tx2)] leading-relaxed">
                  {areas.join(', ')}
                  {offersMobileService ? ' — shop and mobile' : ''}
                </div>
              </div>
            )}
            {client.googleMapsUrl && (
              <a
                href={client.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center justify-center min-h-[48px] px-5 rounded-[14px] font-bold text-[15px] no-underline text-[var(--tx)] bg-white border-[1.5px] border-[var(--line-strong)] hover:bg-[var(--s1)]"
              >
                View our Google listing
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Service areas as a dark coverage band with city lists in columns. */
export function AreasBand({ client, areas }: { client: SiteClient; areas: string[] }) {
  if (areas.length === 0) return null
  return (
    <section className="bg-[var(--dark)] text-white on-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          onDark
          eyebrow="Where we go"
          title="Areas we serve"
          lead={`${client.city} and the surrounding communities — if you’re close but don’t see your city, call and ask.`}
        />
        {/* Flowing list, not spread columns — a short city list must read as
            a compact group instead of floating across the full band width. */}
        <ul className="flex flex-wrap gap-x-10 gap-y-3 list-none m-0 p-0 max-w-4xl">
          {areas.map((area) => (
            <li key={area}>
              <span className="inline-flex items-center gap-2 text-[15px] text-[var(--on-dark-2)]">
                <MapPin className="h-3.5 w-3.5 text-[var(--brand-light)] shrink-0" />
                {area}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** FAQ as hairline-divided rows in a reading column. Stripped when empty. */
export function FaqSection({ extras }: { extras: SiteExtras | null }) {
  if (!extras || extras.faq.length === 0) return null
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-[80ch] mx-auto px-4 sm:px-6 py-14">
        <SectionHead center eyebrow="Questions" title="Frequently asked" />
        <div>
          {extras.faq.map((item) => (
            <details key={item.q} className="group border-t border-[var(--line)] py-4 last:border-b">
              <summary className="font-bold cursor-pointer list-none flex items-center justify-between gap-3 text-[var(--tx)]">
                {item.q}
                <svg
                  className="h-5 w-5 shrink-0 text-[var(--tx-muted)] group-open:rotate-180 transition-transform"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <p className="mt-3 mb-0 text-sm text-[var(--tx2)] leading-relaxed max-w-[68ch]">{item.a}</p>
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

/** Closing dark CTA band with the reference's top-centered radial wash. */
export function FinalCta({ client, quoteHref }: { client: SiteClient; quoteHref: string }) {
  return (
    <section
      className="text-white on-dark"
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, var(--dark-3), var(--dark-2))' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 text-center">
        <Eyebrow center onDark>
          Ready when you are
        </Eyebrow>
        <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight">
          Ready to fix that glass?
        </h2>
        <p className="mt-3 text-[var(--on-dark-2)]">
          Get a free quote in minutes — or call and talk to a real person now.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CtaButton href={quoteHref}>Get my free quote</CtaButton>
          <CallButton client={client} onDark withLabel />
        </div>
      </div>
    </section>
  )
}

/**
 * Footer, template-style: brand column (logo, blurb, contact), services
 * links, service-area columns, then registration + legal line. Columns render
 * only when their data exists.
 */
export function SiteFooter({
  client,
  extras,
  services,
  areas,
  basePath,
  reviews,
  offersMobileService,
  offersAdasCalibration,
}: {
  client: SiteClient
  extras?: SiteExtras | null
  services?: Array<{ slug: string; name: string }>
  areas?: string[]
  basePath?: string
  reviews?: ReviewsData | null
  offersMobileService?: boolean
  offersAdasCalibration?: boolean
}) {
  const year = new Date().getFullYear()
  const areaSplit: string[][] = []
  if (areas && areas.length > 0) {
    const half = Math.ceil(areas.length / 2)
    areaSplit.push(areas.slice(0, half))
    if (areas.length > half) areaSplit.push(areas.slice(half))
  }
  // Identity-bar trust items: restate claims made further up the page —
  // every one data-backed, never a third-party mark.
  const barTrust = [
    ...(reviews
      ? [{
          icon: <GoogleG size={18} />,
          b: `${reviews.rating.toFixed(1)} out of 5 on Google`,
          s: `${reviews.reviewCount} reviews`,
        }]
      : []),
    ...(extras?.warrantyText
      ? [{
          icon: <ShieldCheck className="h-[18px] w-[18px] text-[var(--brand-light)]" />,
          b: extras.warrantyTitle || 'Workmanship warranty',
          s: 'Full terms on this page',
        }]
      : []),
    ...(offersMobileService
      ? [{
          icon: <MapPin className="h-[18px] w-[18px] text-[var(--brand-light)]" />,
          b: 'Mobile service',
          s: 'Across our service area',
        }]
      : []),
    ...(offersAdasCalibration
      ? [{
          icon: <Check className="h-[18px] w-[18px] text-[var(--brand-light)]" />,
          b: 'ADAS calibration',
          s: 'After windshield replacement',
        }]
      : []),
  ].slice(0, 4)

  return (
    <footer className="bg-[var(--dark-2)] text-[var(--on-dark-2)] on-dark pt-11 pb-6 text-[15px]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[1.9fr_1fr_1fr_1.2fr] lg:gap-9">
          <div>
            {client.logoUrl ? (
              // Plain on the dark band, like the reference — no white chip.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logoUrl}
                alt={client.businessName}
                className="h-10 w-auto max-w-[220px] object-contain mb-3.5"
              />
            ) : (
              <div className="font-bold text-white text-lg mb-3">{client.businessName}</div>
            )}
            {extras?.footerBlurb && (
              <p className="text-sm leading-[1.6] m-0 mb-3">{extras.footerBlurb}</p>
            )}
            <p className="m-0 text-sm leading-[1.6]">
              <a
                href={telHrefFor(client.phone)}
                className="font-bold no-underline text-[var(--gold-on-dark)] text-[17px] inline-block py-1"
              >
                {client.phone}
              </a>
              {client.email && (
                <>
                  <br />
                  <a
                    href={`mailto:${client.email}`}
                    className="no-underline text-[var(--on-dark-2)] hover:text-white hover:underline inline-block py-1"
                  >
                    {client.email}
                  </a>
                </>
              )}
            </p>
          </div>
          {services && services.length > 0 && (
            <div>
              <h2 className="text-white font-bold text-[13px] uppercase tracking-[.09em] m-0 mb-3.5">Services</h2>
              <ul className="list-none m-0 p-0 text-sm">
                {services.map((s) => (
                  <li key={s.slug} className="mb-0.5">
                    <a
                      href={`${basePath || ''}/services/${s.slug}`}
                      className="no-underline text-[var(--on-dark-2)] hover:text-white hover:underline inline-block py-[5px]"
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {areaSplit.map((chunk, i) => (
            <div key={i}>
              <h2 className="text-white font-bold text-[13px] uppercase tracking-[.09em] m-0 mb-3.5">
                {i === 0 ? 'Areas we serve' : ' '}
              </h2>
              <ul className="list-none m-0 p-0 text-sm">
                {chunk.map((area) => (
                  <li key={area} className="py-[5px]">{area}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Identity bar — who the business is and how to reach it, with a
            data-backed trust grid beside it. The phone here is a plain,
            un-swapped instance so call-asset verification can always read
            the real number, and the regulator registration line lives here
            (16 CCR § 3371.2-style requirements), rendered only when set. */}
        <div className="mt-6 p-5 rounded-[10px] bg-[var(--dark-3)] border border-[var(--line-on-dark)] text-[13px] leading-[1.6] grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,1.5fr)] lg:items-center lg:gap-8 lg:px-6">
          <div>
            <b className="text-white">{client.businessName}</b>
            <br />
            Serving {client.city}, {client.state} and nearby:{' '}
            <a
              href={telHrefFor(client.phone)}
              className="font-bold no-underline text-[var(--gold-on-dark)]"
            >
              {client.phone}
            </a>
            {client.hasShopLocation && (
              <>
                <br />
                {client.streetAddress}, {client.city}, {client.state} {client.postalCode}
              </>
            )}
            {extras?.registrationNumber && (
              <>
                <br />
                <span className="opacity-80">
                  {extras.registrationName || client.businessName} · Registration No.{' '}
                  {extras.registrationNumber}
                </span>
              </>
            )}
          </div>
          {barTrust.length > 0 && (
            <div className="grid gap-3 pt-4 border-t border-white/15 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4 lg:pt-0 lg:pl-8 lg:border-t-0 lg:border-l lg:border-white/15">
              {barTrust.map((item) => (
                <div key={item.b} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 items-center">
                  <span className="shrink-0">{item.icon}</span>
                  <span>
                    <b className="block text-white leading-[1.35]">{item.b}</b>
                    <span className="block text-xs leading-[1.4]">{item.s}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-[var(--line-on-dark)] text-[12.5px] leading-[1.6] grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>© {year} {client.businessName}. All rights reserved.</div>
          <div className="flex flex-wrap gap-4">
            <a href={basePath || '/'} className="underline text-[var(--on-dark-2)] hover:text-white">
              Home
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

/** Sticky mobile action bar: loud call button, quiet ghost quote button. */
export function MobileCallBar({ client, quoteHref }: { client: SiteClient; quoteHref: string }) {
  return (
    <div className="lg:hidden sticky bottom-0 z-40 grid grid-cols-[1.15fr_1fr] gap-2.5 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-[var(--line)]">
      <a
        href={telHrefFor(client.phone)}
        className="min-h-[50px] rounded-[14px] font-bold text-base text-white text-center flex items-center justify-center gap-2 no-underline bg-[var(--cta)] hover:bg-[var(--cta-b)]"
      >
        <Phone className="h-4 w-4" /> Call Now
      </a>
      <a
        href={quoteHref}
        className="min-h-[50px] rounded-[14px] font-bold text-base text-center no-underline text-[var(--tx)] bg-white border-[1.5px] border-[var(--line-strong)] shadow-sm flex items-center justify-center"
      >
        Get quote
      </a>
    </div>
  )
}

/** Hero bullet checkmark — plain stroke check per the reference, not circled. */
export function BulletCheck() {
  return <Check className="h-[19px] w-[19px] mt-[3px] shrink-0 text-[var(--success)]" strokeWidth={2.6} />
}

export interface TrustItem {
  icon: React.ReactNode
  title: string
  text: string
}

/**
 * The reference's .tb strip under the hero: a hairline-divided grid of four
 * short, factual claims. Items come from the client's flags — never claims
 * the data can't back.
 */
export function TrustRow({ items }: { items: TrustItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 mt-[26px]">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--line-card)] border border-[var(--line-card)] rounded-[14px] overflow-hidden">
        {items.slice(0, 4).map((item) => (
          <div key={item.title} className="bg-white px-4 py-3.5 flex items-start gap-2.5 min-w-0">
            <span className="shrink-0 mt-0.5 text-[var(--brand)]">{item.icon}</span>
            <span className="min-w-0">
              <b className="block text-sm text-[var(--tx)]">{item.title}</b>
              <span className="text-[13px] text-[var(--tx-muted)]">{item.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Editorial chapters between the hero and the services grid — the reference
 * build's long-form middle. Content is per-business (admin-written or drafted
 * by the importer from the client's own site); photos alternate sides.
 * Stripped entirely when no chapters exist.
 */
export function ChapterSections({
  chapters,
  fallbackPhotos,
}: {
  chapters: Array<{ heading: string; body: string; photoUrl: string }>
  fallbackPhotos: Array<{ url: string; alt: string }>
}) {
  if (chapters.length === 0) return null
  return (
    <section className="bg-[var(--s1)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 space-y-14">
        {chapters.map((chapter, i) => {
          const photo = chapter.photoUrl
            ? { url: chapter.photoUrl, alt: chapter.heading }
            : fallbackPhotos[i] || null
          const paragraphs = chapter.body.split(/\n\s*\n/).filter((p) => p.trim())
          return (
            <div
              key={chapter.heading}
              className={`grid gap-8 items-start ${photo ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : ''}`}
            >
              <div className={photo && i % 2 === 1 ? 'lg:order-2' : ''}>
                <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight m-0">
                  {chapter.heading}
                </h2>
                {paragraphs.map((p, j) => (
                  <p key={j} className="mt-4 mb-0 text-[15px] text-[var(--tx2)] leading-relaxed max-w-[62ch]">
                    {p.trim()}
                  </p>
                ))}
              </div>
              {photo && (
                <figure className={`m-0 ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.alt}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover rounded-[20px] border border-[var(--line-card)] shadow-sm"
                  />
                  {photo.alt && photo.alt !== chapter.heading && (
                    <figcaption className="mt-2 text-[13px] text-[var(--tx-muted)]">{photo.alt}</figcaption>
                  )}
                </figure>
              )}
            </div>
          )
        })}
      </div>
    </section>
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
