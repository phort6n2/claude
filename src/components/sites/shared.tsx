import { Phone, MapPin, ShieldCheck, Check, MessageSquare } from 'lucide-react'
import { servicePath, locationPath } from '@/lib/site-paths'
import { ReviewsGrid } from '@/components/sites/reviews-grid'
import { wordmarkParts } from '@/lib/wordmark'
import { smsHref } from '@/lib/contact-links'
import { mostMentionedName } from '@/lib/review-names'
import type { SiteExtras, FaqItem } from '@/lib/site-content'
import { locationPages } from '@/lib/site-locations'
import { orderLocationsForCity, mapQuery, type SiteLocation } from '@/lib/client-locations'
import {
  CHIP_DEDUCTIBLE_NOTE,
  CHIP_REPAIRABLE_NOTE,
  insuranceForState,
  insuranceHeadingFor,
  stateNameFor,
} from '@/lib/insurance-rules'

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
  /** Only for the dark footer band; falls back to logoUrl. */
  footerLogoUrl: string | null
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
/* Skip link: visually hidden until keyboard focus. */
.gl-skip{position:absolute;left:-9999px;top:0;z-index:100;background:var(--cta);color:#fff;font-weight:700;padding:12px 18px;border-radius:0 0 10px 0;text-decoration:none}
.gl-skip:focus{left:0}
/* Header scroll shadow paints on a compositable ::after opacity layer, and
   all scroll-driven motion respects prefers-reduced-motion. */
.gl-site .site-hdr::after{content:"";position:absolute;inset:0;z-index:-1;background:#fff;box-shadow:0 2px 4px -1px rgba(11,27,43,.06),0 6px 14px -3px rgba(11,27,43,.09);opacity:0;pointer-events:none}
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: scroll()) {
    .gl-site .site-hdr::after{animation:gl-hdr-shadow linear both;animation-timeline:scroll();animation-range:0 60px}
    @keyframes gl-hdr-shadow{to{opacity:1}}
  }
}
/* How-it-works connector: a line from disc to disc — vertical when the steps
   stack, horizontal when they sit three-up. The drawn state is the DEFAULT;
   the scroll animation only adds motion, so a decoration failure can never
   remove the thing it decorates (the template's rule). */
.gl-step{position:relative}
.gl-step-n{position:relative;z-index:1}
.gl-step::after{content:"";position:absolute;background:var(--line-strong);pointer-events:none;left:23px;top:56px;width:2px;bottom:-22px;transform-origin:top left}
.gl-step:last-child::after{content:none}
@media (min-width:768px){
  .gl-step::after{left:58px;top:23px;height:2px;width:auto;right:-38px;bottom:auto}
}
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .gl-step::after{animation:gl-step-draw ease both;animation-timeline:view();animation-range:entry 30% entry 90%}
    @keyframes gl-step-draw{from{transform:scale(0)}to{transform:scale(1)}}
  }
}
`

/** Keyboard users jump straight to the quote form. */
export function SkipLink() {
  return (
    <a href="#quote" className="gl-skip">
      Skip to quote form
    </a>
  )
}

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
      role="img"
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

/**
 * Brand-gradient primary action button with the brand-tinted CTA shadow.
 *
 * `onDark` is not decoration. On the closing band the gradient paints
 * --cta on --dark-2, and for a shop whose brand is already dark that measured
 * 1.44:1 — while the SECONDARY call button, which inverts to white, read at
 * about 17:1. The page's last and most important ask was the less visible of
 * the two. On a dark band it inverts as well.
 */
export function CtaButton({
  href,
  children,
  block,
  onDark,
}: {
  href: string
  children: React.ReactNode
  block?: boolean
  onDark?: boolean
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-[14px] font-bold text-[17px] no-underline hover:-translate-y-px transition-transform ${
        onDark ? 'text-[var(--dark-2,#111)] bg-white' : 'text-white'
      } ${block ? 'flex w-full' : ''}`}
      style={
        onDark
          ? { boxShadow: '0 8px 24px rgba(0,0,0,.28)' }
          : {
              background: 'linear-gradient(180deg, var(--cta), var(--cta-b))',
              boxShadow: 'var(--sh-cta), inset 0 1px 0 rgba(255,255,255,.2)',
            }
      }
    >
      {children}
    </a>
  )
}

/**
 * Call button — solid brand on light surfaces, outlined on dark bands.
 *
 * `onDark` is used in exactly one place, the closing band, and it used to
 * paint solid white there. Once the primary quote button also inverted to
 * white (it measured 1.44:1 against that band otherwise) the two were
 * identical and the hierarchy vanished, so the secondary became an outline:
 * still ~17:1 legible, visibly the lesser of the two.
 */
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
          ? 'bg-transparent text-white border-[1.5px] border-white/70 hover:bg-white/10'
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
 * Thin dark strip above the header. The note is cut down twice, because
 * dropping only the tail after " — " was not enough: the head alone still
 * overflowed at every phone width tested, so the very first rendered line on
 * the page ended in an ellipsis mid-word ("Mobile service across Gaithersb…").
 * Phones get the clause before the first " & " too, which is a complete short
 * sentence; the call block never reflows.
 */
export function UtilBar({ client, note }: { client: SiteClient; note: string }) {
  const [noteHead, ...noteRest] = note.split(' — ')
  const noteTail = noteRest.length ? ` — ${noteRest.join(' — ')}` : ''
  const [noteShort, ...noteMid] = noteHead.split(' & ')
  const noteHeadTail = noteMid.length ? ` & ${noteMid.join(' & ')}` : ''
  return (
    <div className="max-[359px]:hidden bg-[var(--dark)] text-[var(--on-dark-2)] text-[13px] on-dark">
      {/* max-w-7xl to stay flush with the header brand below it, not the body bands. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[34px] py-1.5 flex items-center justify-between gap-4">
        {/* Below 390 even the shortest clause loses to the call block by a
            few pixels, and a truncated note is worth less than no note — the
            number is the half of this bar anyone uses. */}
        <span className="flex-1 min-w-0 truncate hidden min-[390px]:block">
          {noteShort}
          {noteHeadTail && <span className="hidden min-[430px]:inline">{noteHeadTail}</span>}
          {noteTail && <span className="hidden sm:inline">{noteTail}</span>}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <span>Call</span>
          {/* 44px hit area without growing the visual bar */}
          <a
            href={telHrefFor(client.phone)}
            className="font-bold no-underline hover:underline text-[var(--gold-on-dark)] inline-flex items-center min-h-[44px] -my-2 px-1"
          >
            {client.phone}
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * The mark for a shop with no logo of their own: their initials in a brand
 * badge beside their name, set in the site's display face.
 *
 * Drawn as live text rather than an image on purpose — it stays crisp at
 * every density, costs no request, and inherits the page's own typography, so
 * it reads as part of the design instead of a stand-in for something missing.
 * `wordmarkParts` picks the initials from the distinctive part of the name;
 * see that file for why "Collision Auto Glass" is C and not CA.
 */
export function Wordmark({
  businessName,
  size = 'md',
  onDark = false,
}: {
  businessName: string
  size?: 'sm' | 'md' | 'lg'
  onDark?: boolean
}) {
  const { initials, name, length } = wordmarkParts(businessName)
  const badge = size === 'sm' ? 'h-9 w-9 text-[13px]' : size === 'lg' ? 'h-12 w-12 text-lg' : 'h-11 w-11 text-base'
  // Long names step down so a three-word shop doesn't crowd the nav beside it.
  const nameCls =
    length === 'long'
      ? size === 'lg' ? 'text-lg' : 'text-[15px]'
      : size === 'lg' ? 'text-xl' : 'text-[17px]'
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span
        className={`${badge} rounded-full shrink-0 grid place-items-center font-extrabold text-white tracking-tight`}
        style={{
          background: 'linear-gradient(180deg, var(--cta), var(--cta-b))',
          boxShadow: 'var(--sh-cta), inset 0 1px 0 rgba(255,255,255,.25)',
        }}
        aria-hidden="true"
      >
        {initials}
      </span>
      {/* Wraps to a second line on phones instead of truncating. A shop with
          no logo saw its own name as "ABC Auto Gl…" at 360 and 390 — the
          loudest "generic template" signal available, in the first 200ms of a
          paid click. It still truncates from sm up, where the nav needs the
          brand to hold one line. */}
      <span
        className={`${nameCls} font-extrabold tracking-[-.02em] leading-[1.15] sm:truncate ${
          onDark ? 'text-white' : 'text-[var(--tx)]'
        }`}
      >
        {name}
      </span>
    </span>
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
  // Four service links plus both buttons genuinely do not fit a lg-width
  // row — the flex items are all fixed-width, so the excess used to shove the
  // phone button through the container's right padding and off the edge.
  // Everything here is width-budgeted: the header gets a wider stage than the
  // body bands (max-w-7xl vs 6xl), a 4-link nav waits for xl, and the brand
  // is the one element allowed to truncate under pressure.
  const navBreakpoint = (nav?.length ?? 0) >= 4 ? 'hidden xl:flex' : 'hidden lg:flex'
  return (
    <header className="site-hdr sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--line)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[64px] lg:min-h-[72px] flex items-center gap-4">
        <a href={basePath || '/'} className="flex items-center gap-3 min-w-0 no-underline">
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
            <Wordmark businessName={client.businessName} />
          )}
        </a>
        {nav && nav.length > 0 && (
          <nav className={`${navBreakpoint} gap-4 ml-auto`} aria-label="Services">
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
        {/* The stars are what get dropped on a narrow phone, not the count.
            It was the other way round, so a 360px screen showed "4.9 ★★★★★"
            with no volume — and volume is the half that makes 4.9 mean
            anything. Dropping the glyphs also gives the brand back ~60px,
            which is why the shop's own name rendered as "ABC Auto Gl…" at both
            360 and 390. */}
        {reviews && (
          <div className="ml-auto lg:hidden flex shrink-0 flex-col items-end leading-none gap-0.5">
            <span className="flex items-center gap-1.5">
              <GoogleG size={14} />
              <span className="text-[15px] font-extrabold text-[var(--tx)] tabular-nums">
                {reviews.rating.toFixed(1)}
              </span>
              <span className="hidden min-[430px]:inline">
                <StarRow rating={reviews.rating} size={11} />
              </span>
            </span>
            <span className="text-[11px] font-semibold text-[var(--tx-muted)] whitespace-nowrap">
              {/* "Google" is redundant beside the G logo, and on a phone it is
                  ~55px taken from the shop's own name. */}
              {reviews.reviewCount}
              <span className="hidden min-[430px]:inline"> Google</span> reviews
            </span>
          </div>
        )}
        {/* Desktop keeps a quote CTA reachable at every scroll depth — the
            sticky mobile bar covers phones. */}
        <a
          href="#quote"
          className={`${nav && nav.length > 0 ? 'lg:ml-2 ' : ''}${reviews ? '' : 'lg:ml-auto '}hidden lg:inline-flex items-center min-h-[44px] px-4 rounded-[14px] font-extrabold text-[15px] text-white shrink-0 no-underline`}
          style={{ background: 'linear-gradient(180deg, var(--cta), var(--cta-b))', boxShadow: 'var(--sh-cta), inset 0 1px 0 rgba(255,255,255,.2)' }}
        >
          Get my free quote
        </a>
        <a
          href={telHrefFor(client.phone)}
          className={`${reviews ? '' : 'ml-auto lg:ml-0 '}inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-[14px] font-extrabold text-[15px] shrink-0 no-underline bg-white text-[var(--cta)] border-[1.5px] border-[var(--cta)] shadow-[0_1px_2px_rgba(11,27,43,.16)] hover:bg-[var(--s1)] transition-colors max-lg:bg-[var(--cta)] max-lg:text-white`}
        >
          <Phone className="h-4 w-4" />
          {/* "Call", not a bare glyph. The number itself only fits from sm
              (640px), which no phone reaches — so the one element that follows
              a visitor everywhere was an unlabelled icon, on the action that
              matters most for this trade. */}
          <span className="sm:hidden">Call</span>
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


/** "What customers say" band on the s2 tint. Stripped without live data. */
export function ReviewsBand({ reviews }: { reviews: ReviewsData | null }) {
  // A named human is the one proof asset a national chain structurally
  // cannot have. Derived from the review text the shop already has — it
  // asserts nothing, and stays quiet unless a name genuinely recurs.
  const mostNamed = mostMentionedName(reviews?.quotes ?? [])
  if (!reviews) return null

  // FULL ROWS ONLY: three, or six. The grid is three across on a wide screen,
  // so four or five quotes leave a second row with a gap in it — which reads
  // as a card that failed to load rather than as the wall being that size.
  // Quantised down to the nearest three and capped at two rows.
  //
  // Fewer than three is not padded to three. Google's Places API returns at
  // most five reviews for a place and the filter keeps the five-star ones of
  // even length, so a shop can genuinely have two — and inventing a third, or
  // dropping the standard to reach three, would be choosing what a real
  // business appears to say about itself to fill a row. One or two centre
  // instead.
  const quotes = reviews.quotes
  // ONE ROW OF THREE. Two rows were only ever reachable at six, and six is
  // not reachable at all: the Places API returns at most five reviews for a
  // place however many the business has, so a second row could never be full
  // and a four- or five-card wall leaves a hole in it.
  //
  // Which three no longer needs deciding — the cards clamp to the same height
  // whatever the length, so this is the top of the stored list, which is
  // longest-first and therefore the most substantial three.
  const shownQuotes = quotes.slice(0, 3)
  return (
    <section className="bg-[var(--s2)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="Reviews"
          title="What customers say"
          lead={
            mostNamed
              ? `Pulled straight from our Google listing — and customers keep mentioning ${mostNamed}.`
              : 'Pulled straight from our Google listing — real customers, real jobs.'
          }
        />
        <ReviewsGrid quotes={shownQuotes} />
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
  // Only outward-facing numbers. Menu size dilutes the review proof — and so
  // does coverage breadth: service-area count is a logistics fact, not proof
  // of quality, and sitting beside a review count it reads as padding.
  void areasCount
  void servicesCount
  if (stats.length < 2) return null

  return (
    <section
      className="text-white on-dark"
      style={{ background: 'radial-gradient(120% 120% at 50% 0%, var(--dark-3), var(--dark))' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        {/* ONE card, not two boxes. Split across "4.9 / Google rating" and
            "366 / Google reviews" the two halves each read as a statistic,
            and the thing a visitor is actually being told — this shop is
            rated 4.9 by 366 people on Google — had to be reassembled from
            them. Together, with the mark that makes it verifiable at a
            glance, it is one claim with its source attached.

            Still rendered only from the live cached feed: no feed, no band,
            and every number here is Google's. */}
        <div className="mx-auto max-w-2xl rounded-[18px] border border-[var(--line-on-dark)] bg-white/[.05] px-6 py-8 text-center">
          <span className="inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-wider text-[var(--on-dark-2)]">
            <GoogleG size={20} />
            Google reviews
          </span>

          <div className="mt-4 flex items-center justify-center gap-4">
            <span className="text-[clamp(2.75rem,2rem+3vw,4.25rem)] font-extrabold leading-none tabular-nums">
              {reviews!.rating.toFixed(1)}
            </span>
            <span className="flex flex-col items-start gap-1.5">
              <StarRow rating={reviews!.rating} size={22} />
              <span className="text-sm text-[var(--on-dark-2)]">
                out of 5, from{' '}
                <strong className="text-white tabular-nums">{reviews!.reviewCount}</strong> reviews
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Numbered three-step process on the s2 tint, .co composition: discs on top
 * with the connector running between them at disc height, text below. Copy is
 * generic to the trade, conditioned only on flags the client actually has.
 */
export function ProcessSection({
  client,
  offersMobileService,
  offersAdasCalibration,
}: {
  client: SiteClient
  offersMobileService: boolean
  offersAdasCalibration?: boolean
}) {
  const fitLine = `We fit the glass${offersAdasCalibration ? ', recalibrate the camera if there is one,' : ''} and tell you when it's safe to drive.`
  const steps = [
    {
      title: 'Tell us what broke',
      body: 'Send the form or call. Your VIN or plate gets us the exact glass for your vehicle, including whether it carries a camera, rain sensor or heating element.',
    },
    {
      title: 'We check your coverage first',
      body: 'Before anything is scheduled we confirm what your policy covers — or give you a straight cash price — so the price you hear is the price you pay. No claim is filed until you say go.',
    },
    offersMobileService
      ? {
          title: 'We come to you',
          body: `Your driveway, your office lot, your job site — wherever the vehicle is. ${fitLine}`,
        }
      : {
          title: 'Drop in and drive off',
          body: `Bring the vehicle to the shop. ${fitLine}`,
        },
  ]
  return (
    <section className="bg-[var(--s2)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="How it works"
          title={offersMobileService ? 'Three steps, no shop visit' : 'Three simple steps'}
        />
        <div className="grid md:grid-cols-3 gap-8 md:gap-x-12">
          {steps.map((step, i) => (
            // Mobile: disc beside the text so the vertical connector stays in
            // its own gutter. Desktop: disc on top, text below — the .co look.
            <div
              key={step.title}
              className="gl-step grid grid-cols-[48px_minmax(0,1fr)] gap-4 items-start md:block"
            >
              <div
                className={`gl-step-n h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-extrabold tabular-nums ${
                  i === steps.length - 1 ? 'bg-[var(--cta)]' : 'bg-[var(--dark)]'
                }`}
              >
                {i + 1}
              </div>
              <div className="md:mt-7">
                <h3 className="m-0 text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold">
                  {step.title}
                </h3>
                <p className="mt-1.5 mb-0 text-sm text-[var(--tx2)] leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Insurance band on the warm tint: left head, two claim cards, disclaimer. */
/**
 * Insurance band, now answering the state-specific version of the question.
 *
 * "Do you take insurance" is not what the caller means. They mean "what is
 * this going to cost me", and the answer turns on their state's deductible
 * rule and on whether the damage is repairable. Answering it here is the
 * cheapest conversion work available: it is the question shops spend the most
 * phone time on, and the one competitors leave unanswered.
 *
 * The copy is deliberately conditional — see src/lib/insurance-rules.ts for
 * why every line says "if you carry comprehensive" and none of them say
 * "free".
 */
export function InsuranceBand({
  state,
  filesClaims = false,
}: {
  state?: string | null
  /** Only shops that confirmed it get to say they file the claim for you. */
  filesClaims?: boolean
}) {
  const rule = insuranceForState(state)
  const stateName = stateNameFor(state)

  return (
    <section className="bg-[var(--tint-warm)] border-b border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="Insurance"
          title={
            rule.rule === 'automatic' && stateName
              ? `${stateName} law is on your side here`
              : filesClaims
                ? 'We handle the claim with your carrier'
                : 'Going through insurance'
          }
          lead="Glass coverage sits in the comprehensive part of your policy — and we do the paperwork."
        />
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-[20px] border border-[var(--line-card)] shadow-sm p-6">
            <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold m-0">
              {insuranceHeadingFor(state)}
            </h3>
            <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">{rule.summary}</p>
            {rule.note && (
              <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">{rule.note}</p>
            )}
            <p className="mt-3 mb-0 text-sm text-[var(--tx2)] leading-relaxed">
              {filesClaims
                ? 'We file the claim with your carrier and deal with them directly, so you are not on hold for an afternoon. Call us with your policy number and we will check your coverage with you before you commit to anything.'
                : 'Call us with your policy number and we will check your coverage with you before you commit to anything — and give your carrier everything they need: the exact glass, the part numbers and a written quote.'}
            </p>
          </div>
          <div className="bg-white rounded-[20px] border border-[var(--line-card)] shadow-sm p-6">
            <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold m-0">Paying cash</h3>
            <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">
              Not going through insurance? You get a straight price up front, before any work
              starts — no surprises when the job is done.
            </p>
            {/* The chip-repair point is the one that changes behaviour: it is
                cheap and it expires when the chip spreads. The deductible half
                is dropped in statutory-waiver states, where it only restates
                what the card opposite already said. */}
            {rule.rule !== 'automatic' && (
              <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">
                {CHIP_DEDUCTIBLE_NOTE}
              </p>
            )}
            <p className="mt-2 mb-0 text-sm text-[var(--tx2)] leading-relaxed">
              {CHIP_REPAIRABLE_NOTE}
            </p>
          </div>
        </div>
        <p className="mt-5 mb-0 text-xs text-[var(--tx-muted)]">
          General information only, not advice about your policy — coverage depends on the policy
          you hold, so check with your carrier. We are an independent glass shop and are not
          affiliated with or endorsed by any insurance company. Your choice of repair shop is
          yours to make.
        </p>
      </div>
    </section>
  )
}

/**
 * Does this warranty text actually define the warranty it names?
 *
 * Deliberately crude, and deliberately biased towards the weaker lead: the
 * cost of judging a complete warranty incomplete is one softer sentence,
 * while the cost of the reverse is the platform vouching for terms that are
 * not there. Length alone is not enough — two long sentences of praise are
 * still not terms — so it also wants a word that only appears when scope or
 * limits are being described.
 */
function warrantyStatesTerms(text: string | null | undefined): boolean {
  const body = (text || '').trim()
  if (body.length < 240) return false
  return /\b(cover|covers|covered|exclude|excludes|excluding|not included|transfer|transferable|void|does not|doesn't|applies|limited to)\b/i.test(
    body
  )
}


/**
 * Warranty band on the accent tint with the terms in a card. Rendered only
 * when warranty text exists, and always shows the definition in full beside
 * the claim — a warranty headline without its terms is the compliance failure
 * the landing-template rules exist to prevent.
 */
/**
 * The warranty badge — an ORIGINAL shield drawn in SVG, in the spirit of the
 * gold-shield badges auto glass sites love, and deliberately not any
 * particular one of them: those are other businesses' artwork, and the
 * popular ones hardcode "LIFETIME", which would pin a lifetime claim on
 * every shop including the ones whose warranty says nothing of the sort.
 * This one renders the shop's OWN warranty title, so the badge can never
 * out-claim the text beside it. No stars — five gold stars on a badge read
 * as a rating, and ratings here come only from the live Google feed.
 */
function WarrantyBadge({ title }: { title: string }) {
  // "Lifetime Workmanship Warranty" → shield says "LIFETIME WORKMANSHIP",
  // ribbon says "WARRANTY". A title that IS just "Warranty" keeps a generic
  // shield line.
  const withoutWord = title.replace(/\bwarranty\b/gi, '').replace(/\s+/g, ' ').trim()
  const shieldWords = (withoutWord || 'Our').toUpperCase().split(' ').slice(0, 3)
  return (
    <svg viewBox="0 0 240 230" role="img" aria-label={title} className="w-40 md:w-48 h-auto shrink-0 mx-auto">
      {/* Gold rim */}
      <path
        d="M120 6 L214 34 V118 C214 168 174 204 120 222 C66 204 26 168 26 118 V34 Z"
        fill="#d4a437"
      />
      <path
        d="M120 16 L204 41 V117 C204 162 168 195 120 211 C72 195 36 162 36 117 V41 Z"
        fill="#f3cd6b"
      />
      {/* Dark face */}
      <path
        d="M120 24 L196 47 V116 C196 157 163 187 120 202 C77 187 44 157 44 116 V47 Z"
        fill="#1c2431"
      />
      {/* Check mark where the reference put stars — a mark of assurance,
          not a rating */}
      <path
        d="M104 62 l10 10 l22 -22"
        stroke="#f3cd6b"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {shieldWords.map((word, i) => (
        <text
          key={word + i}
          x="120"
          y={104 + i * 24}
          textAnchor="middle"
          fill="#ffffff"
          fontFamily="inherit"
          fontWeight="800"
          fontSize={word.length >= 10 ? 17 : 22}
          letterSpacing="0.5"
          // Long words squeeze to the shield's face instead of escaping it —
          // "WORKMANSHIP" was clipping the rim.
          {...(word.length >= 10 ? { textLength: 140, lengthAdjust: 'spacingAndGlyphs' } : {})}
        >
          {word}
        </text>
      ))}
      {/* Ribbon */}
      <path d="M14 158 L54 150 V186 L14 194 L28 176 Z" fill="var(--cta-b, #991b1b)" />
      <path d="M226 158 L186 150 V186 L226 194 L212 176 Z" fill="var(--cta-b, #991b1b)" />
      <rect x="40" y="148" width="160" height="40" rx="4" fill="var(--cta, #b91c1c)" />
      <text
        x="120"
        y="175"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="inherit"
        fontWeight="800"
        fontSize="24"
        letterSpacing="1.5"
      >
        WARRANTY
      </text>
    </svg>
  )
}

export function WarrantyBand({ extras }: { extras: SiteExtras | null }) {
  if (!extras?.warrantyText) return null
  return (
    <section className="bg-[var(--tint)] border-b border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12 lg:items-center">
        <div>
          <div className="mb-6">
            <WarrantyBadge title={extras.warrantyTitle || 'Warranty'} />
          </div>
          <Eyebrow>Our warranty</Eyebrow>
          <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight text-[var(--tx)] m-0">
            {extras.warrantyTitle || 'What the warranty covers'}
          </h2>
          {/* "In full, right here" is a claim the PLATFORM makes about the
              shop's text, and it is only true if that text actually defines
              something. On a live client it headlined "Lifetime Warranty" over
              two sentences naming no scope, no exclusions and no
              transferability — a named warranty without its terms, which §2
              calls out by name, under a line promising the opposite.

              The terms themselves can never be written here: inventing
              "covers leaks and workmanship, non-transferable" for a shop is
              the fabricated-fact failure the rules exist to prevent. So the
              lead adapts instead — the strong version only when the shop has
              genuinely spelled it out, and otherwise a line that is true for
              everyone. */}
          <p className="mt-3 mb-0 text-[17px] leading-[1.55] text-[var(--tx2)]">
            {warrantyStatesTerms(extras.warrantyText)
              ? 'In writing, in full, right here — not a claim with the terms hidden somewhere else.'
              : 'The cover this shop offers, in their own words.'}
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
  // The two pools are a PREFERENCE, not a filter. Photos that look like this
  // specific shop lead the grid; generic or stock imagery fills the rest of
  // it rather than disappearing — body photos otherwise only render beside
  // story sections, so a shop with more photos than sections would silently
  // lose the surplus. The heading claims nothing about who took them.
  // Deduped on the FILENAME, not the full URL. One live client's gallery
  // rendered the same photograph twice — byte-identical, but uploaded to their
  // CDN twice under different asset ids, so the URLs differed and the URL
  // check waved both through. They landed in positions 2 and 4, which is one
  // scroll apart at 2-up on a phone, and a visitor who spots a repeat in a
  // six-photo portfolio concludes it was padded.
  const seen = new Set<string>()
  const photoKey = (url: string) => {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop() || url).toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  }
  const photos = [...(extras?.galleryPhotos ?? []), ...(extras?.bodyPhotos ?? [])]
    .filter((p) => {
      const key = photoKey(p.url)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
  if (photos.length === 0) return null
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead eyebrow="Our work" title="The kind of work we do" />
        {/* Even photo counts that don't fill three columns read better 2-up —
            no orphan card on the last row. */}
        <div
          className={`grid grid-cols-2 gap-5 ${
            photos.length % 3 === 1 ? 'md:grid-cols-2' : 'md:grid-cols-3'
          }`}
        >
          {photos.map((photo) => (
            <figure
              key={photo.url}
              className="m-0 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm overflow-hidden"
            >
              {/* The description belongs in alt, not under the photo. Printed
                  as a caption it just narrates what the reader can already
                  see, and reads like stock-photo metadata — which costs more
                  credibility than the caption ever added. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.alt || 'Job photo'}
                loading="lazy"
                decoding="async"
                className="w-full aspect-[4/3] object-cover"
              />
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
  locations = [],
  activeCity,
}: {
  client: SiteClient
  reviews: ReviewsData | null
  areas?: string[]
  offersMobileService?: boolean
  /** Every shop the client runs. One shop renders the reference composition. */
  locations?: SiteLocation[]
  /** City this page is about, so the shop in it leads. */
  activeCity?: string | null
}) {
  // A stored shop is proof of a shop, whatever the legacy flag says.
  if (!client.hasShopLocation && locations.length === 0) return null
  const ordered = orderLocationsForCity(locations, activeCity)
  // Multi-shop clients get their own composition; a client with one shop
  // keeps the reference layout exactly, which was tuned against it.
  if (ordered.length > 1) {
    return (
      <MultiLocationSection
        client={client}
        reviews={reviews}
        locations={ordered}
        areas={areas}
        offersMobileService={offersMobileService}
        activeCity={activeCity}
      />
    )
  }
  const lead = ordered[0]
  // A name-based map query only lands on THIS shop when Google actually
  // knows this shop — searching the name of a business with no Business
  // Profile snaps the pin to whichever similar-sounding shop Google does
  // know, which put a competitor's listing on a client's own page. With no
  // profile signal (no Maps URL, no reviews), the embed shows the service
  // area instead: their city, zoomed out — true, useful, nobody else's pin.
  const hasProfile = !!client.googleMapsUrl || !!reviews
  const areaQuery = `${encodeURIComponent(`${lead?.city || client.city}, ${lead?.state || client.state}`)}&z=10`
  const query = hasProfile
    ? lead
      ? mapQuery(client.businessName, lead)
      : encodeURIComponent(
          `${client.businessName}, ${client.streetAddress}, ${client.city}, ${client.state} ${client.postalCode}`
        )
    : areaQuery
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="max-w-[60ch] mx-auto text-center mb-8">
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
              : `Visit the shop in ${lead?.city || client.city}`}
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
                  <span className="text-3xl font-extrabold tabular-nums leading-none">
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
                {lead?.label || client.city} shop
              </div>
              <div className="text-sm text-[var(--tx2)] leading-relaxed">
                {lead?.streetAddress || client.streetAddress}
                <br />
                {lead?.city || client.city}, {lead?.state || client.state}{' '}
                {lead?.postalCode || client.postalCode}
                {lead?.hours && (
                  <>
                    <br />
                    <span className="text-[var(--tx-muted)]">{lead.hours}</span>
                  </>
                )}
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
            {(lead?.googleMapsUrl || client.googleMapsUrl) && (
              <a
                href={lead?.googleMapsUrl || client.googleMapsUrl || '#'}
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

/**
 * Map section for a client with more than one shop.
 *
 * The single-shop layout puts one address in a card beside the map, which
 * stops working the moment there are two: a visitor on the Tualatin page
 * needs to see the Tualatin shop, and a visitor anywhere needs to see that
 * the choice exists. So the map shows the shop for this page and the column
 * beside it lists every shop, the relevant one first and marked — one list,
 * no second row of orphaned cards, and the whole choice visible at once.
 *
 * Ratings shown per shop come from that shop's own Business Profile. They are
 * never averaged: a blended number is a number no profile actually shows.
 */
function MultiLocationSection({
  client,
  reviews,
  locations,
  areas,
  offersMobileService,
  activeCity,
}: {
  client: SiteClient
  reviews: ReviewsData | null
  locations: SiteLocation[]
  areas?: string[]
  offersMobileService?: boolean
  activeCity?: string | null
}) {
  const lead = locations[0]
  const others = locations.slice(1)
  // On a city page where we actually have a shop, say so plainly; that is the
  // single most useful sentence on the page.
  const leadIsInActiveCity =
    !!activeCity && lead.city.trim().toLowerCase() === activeCity.trim().toLowerCase()
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="max-w-[60ch] mx-auto text-center mb-8">
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
            {leadIsInActiveCity
              ? `Our shop is right here in ${activeCity}`
              : `${locations.length} shops: ${listSentence(locations.map((l) => l.label))}`}
          </h2>
          {reviews && (
            <div className="mt-2.5 flex justify-center">
              <StarRow rating={reviews.rating} size={22} />
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-stretch">
          <iframe
            title={`Map to ${client.businessName}, ${lead.label}`}
            src={`https://maps.google.com/maps?q=${mapQuery(client.businessName, lead)}&output=embed`}
            className="w-full min-h-[360px] h-full rounded-[20px] border border-[var(--line-card)]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {/* Past three shops the column would outgrow the map, so it scrolls
              rather than stretching the section to an awkward height. */}
          <div
            className={`flex flex-col gap-4 ${
              locations.length > 3 ? 'lg:max-h-[520px] lg:overflow-y-auto lg:pr-1' : ''
            }`}
          >
            <LocationCard client={client} location={lead} highlight />
            {others.map((location) => (
              <LocationCard key={location.id} client={client} location={location} />
            ))}
          </div>
        </div>

        {areas && areas.length > 0 && (
          <p className="mt-6 text-sm text-[var(--tx-muted)] text-center max-w-[70ch] mx-auto">
            Between them these shops serve {areas.join(', ')}
            {offersMobileService ? ' — in the shop or mobile to you' : ''}.
          </p>
        )}
      </div>
    </section>
  )
}

/** One shop: name, address, hours, its own rating, its own directions link. */
function LocationCard({
  client,
  location,
  highlight = false,
}: {
  client: SiteClient
  location: SiteLocation
  highlight?: boolean
}) {
  return (
    <div
      className={`bg-white rounded-[20px] border shadow-sm p-6 flex flex-col gap-3 ${
        highlight ? 'border-[var(--cta)]' : 'border-[var(--line-card)]'
      }`}
    >
      <div className="text-[11px] font-bold uppercase tracking-[.09em] text-[var(--tx-muted)]">
        {location.label} shop
      </div>
      {location.rating !== null && location.reviewCount !== null && (
        <div className="flex items-center gap-2.5">
          <GoogleG size={16} />
          <span className="text-lg font-extrabold tabular-nums leading-none">
            {location.rating.toFixed(1)}
          </span>
          <StarRow rating={location.rating} size={13} />
          <span className="text-[13px] text-[var(--tx-muted)]">
            ({location.reviewCount})
          </span>
        </div>
      )}
      <address className="not-italic text-sm text-[var(--tx2)] leading-relaxed">
        {location.streetAddress}
        <br />
        {location.city}, {location.state} {location.postalCode}
        {location.hours && (
          <>
            <br />
            <span className="text-[var(--tx-muted)]">{location.hours}</span>
          </>
        )}
      </address>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={telHrefFor(location.phone)}
          className="inline-flex items-center min-h-[44px] -my-2 inline-flex items-center gap-1.5 text-sm font-bold no-underline text-[var(--brand)] hover:underline"
        >
          <Phone className="h-3.5 w-3.5" />
          {location.phone}
        </a>
        <a
          href={
            location.googleMapsUrl ||
            `https://maps.google.com/maps?q=${mapQuery(client.businessName, location)}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-bold no-underline text-[var(--brand)] hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />
          Directions
        </a>
      </div>
    </div>
  )
}

/** "A and B" / "A, B, and C" — for naming shops in a sentence. */
function listSentence(items: string[]): string {
  if (items.length <= 1) return items[0] || ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/**
 * Service areas as a dark coverage band: head on the left, city list filling
 * the right column — no dead space beside a short list. Cities come from the
 * client's serviceAreas field; add more there and this section grows.
 */
export function AreasBand({
  client,
  areas,
  basePath,
  linkableCities,
}: {
  client: SiteClient
  areas: string[]
  basePath?: string
  /**
   * Cities whose page is worth linking. A city we cover but have nothing
   * specific to say about is still listed — the coverage is true — it just
   * isn't a link, because linking a noindexed page advertises it.
   */
  linkableCities?: Set<string>
}) {
  if (areas.length === 0) return null
  const pages = new Map(
    locationPages(areas)
      .filter((l) => !linkableCities || linkableCities.has(l.area.trim().toLowerCase()))
      .map((l) => [l.area, l.slug])
  )
  return (
    <section className="bg-[var(--dark)] text-white on-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14 lg:items-center">
        <div>
          <Eyebrow onDark>Where we go</Eyebrow>
          <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight m-0">
            Areas we serve
          </h2>
          <p className="mt-3 mb-0 text-[17px] leading-[1.55] text-[var(--on-dark-2)]">
            {client.city} and the surrounding communities — if you’re close but don’t see your
            city, call and ask.
          </p>
        </div>
        <ul
          className={`list-none m-0 p-0 grid gap-x-8 gap-y-3 content-center ${
            areas.length > 8 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {areas.map((area) => {
            const slug = pages.get(area)
            const inner = (
              <span className="inline-flex items-center gap-2.5 text-[15px] text-[var(--on-dark-2)]">
                <MapPin className="h-4 w-4 text-[var(--brand-light)] shrink-0" />
                {area}
              </span>
            )
            return (
              <li key={area}>
                {slug && basePath !== undefined ? (
                  <a
                    href={`${basePath}${locationPath(slug)}`}
                    className="underline decoration-[var(--line-on-dark)] underline-offset-[3px] hover:decoration-white"
                  >
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** FAQ as hairline-divided rows in a reading column. Stripped when empty. */
export function FaqSection({
  extras,
  extraFaq = [],
}: {
  extras: SiteExtras | null
  /** Platform defaults, appended behind the shop's own questions. */
  extraFaq?: FaqItem[]
}) {
  const faq = [...(extras?.faq ?? []), ...extraFaq]
  if (faq.length === 0) return null
  return (
    <section className="border-t border-[var(--line)]">
      <div className="max-w-[80ch] mx-auto px-4 sm:px-6 py-14">
        <SectionHead center eyebrow="Questions" title="Frequently asked" />
        {/* py-4 sits on the SUMMARY below, not on the details. On the details
            it was 32px of padding outside the hit box, so a one-line question
            looked like a 58px row and answered taps in only the middle 26px of
            it — on the block whose whole job is answering objections. */}
        <div>
          {faq.map((item) => (
            <details key={item.q} className="group border-t border-[var(--line)] last:border-b">
              <summary className="font-bold cursor-pointer list-none flex items-center justify-between gap-3 py-4 text-[var(--tx)]">
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
export function FinalCta({ client }: { client: SiteClient; quoteHref?: string }) {
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
          Let&apos;s get you a real number
        </h2>
        <p className="mt-3 text-[var(--on-dark-2)]">
          Tell us what broke and what you drive — we&apos;ll confirm the glass, check your
          coverage, and book a time that works for you.
        </p>
        {/* Stacked full-width on phones, exactly as the hero pair already
            does. Left ragged they measured 196px and 249px, centred, at the
            page's final ask. */}
        <div className="mt-7 flex flex-wrap justify-center gap-3 max-[719px]:flex-col max-[719px]:[&>a]:w-full">
          <CtaButton href="#quote" onDark>
            Get my free quote
          </CtaButton>
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
  locations = [],
  linkableCities,
  pages = [],
}: {
  client: SiteClient
  extras?: SiteExtras | null
  services?: Array<{ slug: string; name: string }>
  areas?: string[]
  basePath?: string
  reviews?: ReviewsData | null
  offersMobileService?: boolean
  offersAdasCalibration?: boolean
  locations?: SiteLocation[]
  linkableCities?: Set<string>
  /** Pages kept from the shop's old site at their original addresses. */
  pages?: Array<{ path: string; title: string }>
}) {
  const year = new Date().getFullYear()
  // The footer band is dark, and most shop logos are dark ink on
  // transparency — the file that looks right in the header can be a black
  // rectangle's worth of nothing down here. A shop whose logo survives both
  // backgrounds sets no second file and this falls through to the header's.
  const footerLogo = client.footerLogoUrl || client.logoUrl
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
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] lg:gap-9">
          <div>
            {footerLogo ? (
              // Plain on the dark band, like the reference — no white chip.
              // The white version is GENERATED, not filtered: a CSS
              // brightness(0) invert(1) was tried and turned every opaque
              // logo into a blank rectangle, because a filter cannot know
              // which pixels are background. deriveFooterLogo() reads the
              // pixels instead — transparent logos get a white copy stored
              // as footerLogoUrl at save time; opaque ones render as-is.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={footerLogo}
                alt={client.businessName}
                className="h-10 w-auto max-w-[220px] object-contain mb-3.5"
              />
            ) : (
              <div className="mb-3">
                <Wordmark businessName={client.businessName} size="lg" onDark />
              </div>
            )}
            {extras?.footerBlurb && (
              <p className="text-sm leading-[1.6] m-0 mb-3">{extras.footerBlurb}</p>
            )}
            <p className="m-0 text-sm leading-[1.6]">
              <a
                href={telHrefFor(client.phone)}
                className="inline-flex items-center min-h-[44px] -my-2 font-bold no-underline text-[var(--gold-on-dark)] text-[17px] inline-block py-1"
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
              <h2 className="text-white font-bold text-[13px] uppercase tracking-[.09em] m-0 mb-3.5">
                Services
              </h2>
              <ul className="list-none m-0 p-0 text-sm">
                {services.map((s) => (
                  <li key={s.slug} className="mb-0.5">
                    <a
                      href={`${basePath || ''}${servicePath(s.slug)}`}
                      className="no-underline text-[var(--on-dark-2)] hover:text-white hover:underline inline-block py-[5px]"
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Kept pages take a column of their own now that the service areas
              have left the grid. Stacked under the services they made one very
              tall column beside empty space — and the towns they mostly name
              are in the identity card below anyway. */}
          {pages.length > 0 && (
            <div>
              <h2 className="text-white font-bold text-[13px] uppercase tracking-[.09em] m-0 mb-3.5">
                More
              </h2>
              <ul className="list-none m-0 p-0 text-sm">
                {pages.map((p) => (
                  <li key={p.path} className="mb-0.5">
                    <a
                      href={`${basePath || ''}${p.path}`}
                      className="no-underline text-[var(--on-dark-2)] hover:text-white hover:underline inline-block py-[5px]"
                    >
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* Identity bar — who the business is and how to reach it, with a
            data-backed trust grid beside it. The phone here is a plain,
            un-swapped instance so call-asset verification can always read
            the real number, and the regulator registration line lives here
            (16 CCR § 3371.2-style requirements), rendered only when set. */}
        <div
          className={`mt-6 p-5 rounded-[10px] bg-[var(--dark-3)] border border-[var(--line-on-dark)] text-[13px] leading-[1.6] grid gap-4 lg:gap-8 lg:px-6 ${
            // Two address blocks need room; at the single-shop column width
            // they wrap mid-street.
            locations.length > 1
              ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start'
              : 'lg:grid-cols-[minmax(240px,1fr)_minmax(0,1.5fr)] lg:items-center'
          }`}
        >
          <div>
            <b className="text-white">{client.businessName}</b>
            <br />
            Serving {client.city}, {client.state} and nearby:{' '}
            <a
              href={telHrefFor(client.phone)}
              className="inline-flex items-center min-h-[44px] -my-2 font-bold no-underline text-[var(--gold-on-dark)]"
            >
              {client.phone}
            </a>
            {/* Every shop, not just the head office — the footer is where a
                customer checks which one is closest to them. Several shops get
                separated blocks rather than one run-on paragraph: repeating
                the business name on each line and wrapping addresses mid-street
                made a two-shop footer genuinely hard to read. */}
            {client.hasShopLocation &&
              (locations.length > 1 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {locations.map((location) => (
                    <div
                      key={location.id}
                      className="pl-3 border-l-2 border-[var(--line-on-dark)]"
                    >
                      <div className="text-white font-semibold">{location.label}</div>
                      <address className="not-italic">
                        {location.streetAddress}
                        <br />
                        {location.city}, {location.state} {location.postalCode}
                      </address>
                      {location.hours && (
                        <div className="opacity-75">{location.hours}</div>
                      )}
                      {/* Only when this shop has its own line. Repeating the
                          main number under every address just reprints the
                          line directly above it. */}
                      {location.phone !== client.phone && (
                        <a
                          href={telHrefFor(location.phone)}
                          className="inline-flex items-center min-h-[44px] -my-2 no-underline text-[var(--gold-on-dark)]"
                        >
                          {location.phone}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : locations.length === 1 ? (
                <>
                  <br />
                  {locations[0].streetAddress}, {locations[0].city}, {locations[0].state}{' '}
                  {locations[0].postalCode}
                </>
              ) : (
                <>
                  <br />
                  {client.streetAddress}, {client.city}, {client.state} {client.postalCode}
                </>
              ))}
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

          {/* Where they go, as one line across the bottom of this card.
              It has been three shapes now. Two bare columns of city names read
              as filler and left half the footer empty; a box of its own in
              that space was worse, a panel with nothing in it under a short
              list. It belongs HERE, with the addresses and the phone — the
              card that answers "who are you and where are you" should also
              answer "and how far do you come", and as a sentence it takes one
              line instead of a column.

              Towns with a page of their own are links; the rest are plain.
              Same rule as every version before this: a name in a service area
              is not a promise of a page. */}
          {areas && areas.length > 0 && (
            <div className="lg:col-span-2 pt-4 border-t border-white/15 text-center">
              <span className="text-white font-bold">
                {offersMobileService ? 'We come to you in' : 'Serving'}
              </span>{' '}
              {areas.map((area, i) => {
                const slug = linkableCities
                  ? locationPages(areas || []).find(
                      (l) => l.area === area && linkableCities.has(l.area.trim().toLowerCase())
                    )?.slug
                  : locationPages(areas || []).find((l) => l.area === area)?.slug
                return (
                  <span key={area}>
                    {i > 0 && (
                      <span aria-hidden="true" className="px-1.5 opacity-50">
                        ·
                      </span>
                    )}
                    {slug ? (
                      <a
                        href={`${basePath || ''}${locationPath(slug)}`}
                        // Vertical padding so a run of inline links is still
                        // hittable with a thumb. The list used to put its
                        // padding on the <li>, leaving 20px targets, and that
                        // is easy to reintroduce the moment it becomes a
                        // sentence.
                        className="no-underline text-[var(--on-dark-2)] hover:text-white hover:underline inline-block py-1.5"
                      >
                        {area}
                      </a>
                    ) : (
                      <span className="inline-block py-1.5">{area}</span>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-8 pt-5 border-t border-[var(--line-on-dark)] text-[12.5px] leading-[1.6] grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            © {year} {client.businessName}. All rights reserved.{' '}
            <span className="whitespace-nowrap">
              ·{' '}
              {/* Deliberately a followed link: every client site vouching for
                  the platform is the point of the attribution. */}
              <a
                href="https://glassleads.app"
                target="_blank"
                rel="noopener"
                className="underline text-[var(--on-dark-2)] hover:text-white"
              >
                Powered by GlassLeads
              </a>
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <a
              href={`${basePath || ''}/privacy`}
              className="underline text-[var(--on-dark-2)] hover:text-white"
            >
              Privacy Policy
            </a>
            <a
              href={`${basePath || ''}/terms`}
              className="underline text-[var(--on-dark-2)] hover:text-white"
            >
              Terms
            </a>
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
export function MobileCallBar({
  client,
  quoteHref,
  smsCapable = false,
}: {
  client: SiteClient
  quoteHref: string
  /** Only shops whose line actually receives texts get the text button. */
  smsCapable?: boolean
}) {
  // Text-a-photo is the shortest path from "cracked windshield" to a
  // quotable lead on a phone: no form, no typing, and it hands the shop the
  // one artifact that settles the quote. The body is pre-filled because
  // "what do I even say" is the pause that loses the message.
  const textHref = smsCapable
    ? smsHref(client.phone, 'Hi, I need a windshield quote. Here is a photo of the damage:')
    : null
  return (
    <div
      data-gl-mobilebar
      className={`lg:hidden sticky bottom-0 z-40 grid ${
        textHref ? 'grid-cols-[1.1fr_1fr_1fr]' : 'grid-cols-[1.15fr_1fr]'
      } gap-2.5 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-[var(--line)]`}
    >
      <a
        href={telHrefFor(client.phone)}
        className="min-h-[50px] rounded-[14px] font-bold text-base text-white text-center flex items-center justify-center gap-2 no-underline bg-[var(--cta)] hover:bg-[var(--cta-b)]"
      >
        <Phone className="h-4 w-4" /> Call Now
      </a>
      {textHref && (
        <a
          href={textHref}
          className="min-h-[50px] rounded-[14px] font-bold text-[14px] whitespace-nowrap text-center no-underline text-[var(--tx)] bg-white border-[1.5px] border-[var(--line-strong)] shadow-sm flex items-center justify-center gap-1.5"
        >
          <MessageSquare className="h-4 w-4 shrink-0" /> Text photo
        </a>
      )}
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
  client,
}: {
  chapters: Array<{
    heading: string
    body: string
    photoUrl: string
    /**
     * Pre-sanitised markup, for copy that is not plain paragraphs.
     *
     * Only kept pages use it. Their copy came off another site as HTML with
     * lists and emphasis in it, and it has to appear in THIS block — same
     * grid, same photo alternation, same type — because the whole point is
     * that a page carried over is indistinguishable in layout from one the
     * template wrote. Flattening it to text to fit `body` would have dropped
     * the lists; forking the layout to render it would have been a second
     * chapter block to keep in step with this one.
     */
    bodyHtml?: string
  }>
  fallbackPhotos: Array<{ url: string; alt: string }>
  /** When provided, a CTA row closes the block so the story the reader just
      finished has somewhere to convert. */
  client?: SiteClient
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
          const isLast = i === chapters.length - 1
          return (
            <div
              key={`${i}-${chapter.heading}`}
              className={`grid gap-8 items-start ${photo ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : ''}`}
            >
              <div className={photo && i % 2 === 1 ? 'lg:order-2' : ''}>
                {/* A chapter without a heading is lead-in copy that came
                    before the source's first heading. Printing the page title
                    again above it would put the H1 on screen twice. */}
                {chapter.heading && (
                  <h2 className="text-[clamp(1.5rem,1.18rem+1.7vw,2.35rem)] leading-[1.16] font-extrabold tracking-tight m-0">
                    {chapter.heading}
                  </h2>
                )}
                {chapter.bodyHtml ? (
                  <div
                    className="mt-4 text-[15px] text-[var(--tx2)] leading-relaxed max-w-[62ch] [&>*+*]:mt-4 [&_h3]:font-bold [&_h3]:text-[var(--tx)] [&_h3]:mt-6 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_a]:text-[var(--brand)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--line)] [&_blockquote]:pl-4 [&_blockquote]:italic"
                    dangerouslySetInnerHTML={{ __html: chapter.bodyHtml }}
                  />
                ) : (
                  paragraphs.map((p, j) => (
                    <p key={j} className="mt-4 mb-0 text-[15px] text-[var(--tx2)] leading-relaxed max-w-[62ch]">
                      {p.trim()}
                    </p>
                  ))
                )}
                {/* On a wide screen the CTA belongs HERE, under the words that
                    just earned it. A photo is a fixed 4:3 and the prose beside
                    it is usually shorter, so a full-width row after the grid
                    hung the buttons under the taller column — orphaned beneath
                    the image, with dead space under the text. Below lg the
                    grid is one column and the row after the loop is right, so
                    only one of the two ever renders. */}
                {client && isLast && (
                  <div className="hidden lg:flex flex-wrap gap-3 mt-7">
                    <CtaButton href="#quote">Get my free quote</CtaButton>
                    <CallButton client={client} withLabel />
                  </div>
                )}
              </div>
              {photo && (
                <figure className={`m-0 ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
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
        {client && (
          <div className="flex lg:hidden flex-wrap gap-3 pt-2 max-[719px]:flex-col max-[719px]:[&>a]:w-full">
            <CtaButton href="#quote">Get my free quote</CtaButton>
            <CallButton client={client} withLabel />
          </div>
        )}
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
