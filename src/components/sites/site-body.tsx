import {
  ArrowRight,
  Car,
  Wrench,
  CircleDot,
  DoorOpen,
  CarFront,
  Sun,
  ScanLine,
  CheckCircle2,
  Truck,
  ShieldCheck,
  BadgeCheck,
  Clock,
  type LucideIcon,
} from 'lucide-react'
import {
  SectionHead,
  ReviewsBand,
  StatBand,
  ProcessSection,
  InsuranceBand,
  MapSection,
  AreasBand,
  WarrantyBand,
  GalleryGrid,
  FaqSection,
  ChapterSections,
  FinalCta,
  SiteFooter,
  MobileCallBar,
  type SiteClient,
  type ReviewsData,
  type TrustItem,
} from '@/components/sites/shared'
import type { SiteExtras } from '@/lib/site-content'
import { withDefaultFaq } from '@/lib/site-faq'
import type { SiteLocation } from '@/lib/client-locations'

/**
 * The shared body of every hosted-site page — everything between the hero
 * area and the end of the document. Home, service, and location pages all
 * render this same stack so each page IS the homepage with a different hero
 * and lead-in content, exactly like the reference build's per-page template.
 */

export interface SiteFlags {
  offersMobileService: boolean
  offersAdasCalibration: boolean
  /**
   * Whether this shop actually files the claim for the customer. Some do;
   * some hand over a phone number. The template used to assert it for all of
   * them, which put a promise in a shop's mouth that they never made.
   */
  filesInsuranceClaims?: boolean
  /** Whether the shop's published line can receive SMS. */
  smsCapable?: boolean
}

interface WidgetClient extends SiteClient {
  slug: string
  secondaryColor?: string | null
  offersWindshieldReplacement?: boolean
  offersWindshieldRepair?: boolean
  offersRockChipRepair?: boolean
  offersSideWindowRepair?: boolean
  offersBackWindowRepair?: boolean
  offersSunroofRepair?: boolean
  offersAdasCalibration?: boolean
  offersMobileService?: boolean
  smsCapable?: boolean
}

/**
 * The exact payload /api/widget/config serves, built server-side so the
 * hosted pages can inline it — the form renders without hydration-gating or
 * a config round trip. Third-party embeds still fetch.
 */
export function buildWidgetConfig(client: WidgetClient, privacyUrl?: string) {
  const services: string[] = []
  if (client.offersWindshieldReplacement) services.push('Windshield Replacement')
  if (client.offersWindshieldRepair) services.push('Windshield Repair')
  if (client.offersRockChipRepair) services.push('Rock Chip Repair')
  if (client.offersSideWindowRepair) services.push('Side Window Repair')
  if (client.offersBackWindowRepair) services.push('Back Window Repair')
  if (client.offersSunroofRepair) services.push('Sunroof Repair')
  if (client.offersAdasCalibration) services.push('ADAS Calibration')
  return {
    businessName: client.businessName,
    phone: client.phone,
    primaryColor: client.primaryColor || '#1e40af',
    secondaryColor: client.secondaryColor || '#3b82f6',
    services,
    offersMobileService: !!client.offersMobileService,
    // Gates every "text us a photo" path. An sms: link pointed at a landline
    // is a dead end, so the copy only appears once a shop confirms the line
    // receives texts.
    smsCapable: !!client.smsCapable,
    ...(privacyUrl ? { privacyUrl } : {}),
  }
}

/**
 * The hero quote-form container: server-rendered skeleton reserves the card's
 * space (no CLS, no pop-in) and carries a call path until — or in case — the
 * widget mounts and replaces it. `service` preselects the form on service
 * pages so the ad → page → form scent stays unbroken.
 */
/** Minimal HTML escape for the values interpolated into the placeholder. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function WidgetMount({ client, service }: { client: SiteClient; service?: string }) {
  const tel = client.phone.replace(/[^+\d]/g, '')
  // Written as a string, not JSX, on purpose — see the comment below.
  const placeholder = `
    <div class="bg-white rounded-[20px] border-t-4 border-t-[var(--cta)] border border-[var(--line-card)] shadow-lg p-6">
      <p class="m-0 text-xl font-extrabold tracking-tight text-[var(--tx)]">Get your free quote</p>
      <p class="mt-1.5 mb-0 text-sm text-[var(--tx-muted)]">Four quick questions and you&rsquo;ll have a real number.</p>
      <a href="tel:${esc(tel)}" class="mt-5 flex items-center justify-center min-h-[52px] rounded-[14px] font-bold text-white no-underline" style="background:linear-gradient(180deg, var(--cta), var(--cta-b))">Or call ${esc(client.phone)}</a>
    </div>`

  return (
    <div
      data-glassleads-widget
      // Excluded from session recording EXPLICITLY, not by trusting Clarity's
      // default masking or a project setting somebody could flip in a
      // dashboard we do not control. This subtree carries a real person's
      // name, phone number and a photo of their car.
      data-clarity-mask="true"
      {...(service ? { 'data-service': service } : {})}
      // Reserved for what it actually renders. 540px was the desktop card; on a
      // phone the mounted form is ~944px, so the page below grew 400px under
      // anyone who had started scrolling.
      className="min-h-[940px] sm:min-h-[540px] lg:min-h-[600px]"
      // THE CHILDREN OF THIS DIV ARE NOT REACT'S.
      //
      // widget.js clears this container and mounts the form into it. While the
      // placeholder was ordinary JSX, doing that before hydration made React
      // reconcile the subtree and wipe the mounted form — the incident the old
      // comment on WidgetScript recorded, and the reason the script was held
      // until afterInteractive.
      //
      // Rendered through dangerouslySetInnerHTML, React compares only the
      // __html string and never walks the children, so the script is free to
      // mount whenever it likes. That is what lets it load without waiting for
      // a ~146KB bundle to hydrate: the form was measured downloaded at 1.45s
      // and usable at 4.2s, and the gap was all hydration.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: placeholder }}
    />
  )
}

/**
 * The widget script, with the config inlined so no config round trip is
 * needed.
 *
 * A plain deferred <script>, not next/script. `afterInteractive` exists to
 * hold a script until React has hydrated, which is precisely the delay being
 * removed here — and it is only safe to remove because WidgetMount above puts
 * its subtree beyond React's reach. Deferred, so it still runs after the
 * document is parsed and the container exists.
 */
export function WidgetScript({ client, basePath }: { client: WidgetClient; basePath?: string }) {
  return (
    <script
      src="/widget.js"
      defer
      data-client={client.slug}
      data-phone={client.phone}
      data-config={JSON.stringify(buildWidgetConfig(client, `${basePath || ''}/privacy`))}
    />
  )
}

const SERVICE_ICONS: Record<string, LucideIcon> = {
  'windshield-replacement': Car,
  'windshield-repair': Wrench,
  'rock-chip-repair': CircleDot,
  'side-window-replacement': DoorOpen,
  'back-glass-replacement': CarFront,
  'sunroof-repair': Sun,
  'adas-calibration': ScanLine,
}

// The services GRID caps at 6 cards so the last row is always full, like the
// reference. Highest-value services first; the mobile-service card takes one
// slot when offered. The footer still lists every service.
const GRID_PRIORITY = [
  'windshield-replacement',
  'windshield-repair',
  'adas-calibration',
  'side-window-replacement',
  'back-glass-replacement',
  'rock-chip-repair',
  'sunroof-repair',
]

export function prioritizeServices(services: Array<{ slug: string; name: string; short: string }>) {
  return [...services].sort(
    (a, b) => GRID_PRIORITY.indexOf(a.slug) - GRID_PRIORITY.indexOf(b.slug)
  )
}

/** Four-item trust strip content — only claims the client's data can back. */
export function buildTrustItems(
  client: SiteClient,
  flags: SiteFlags,
  extras: SiteExtras
): TrustItem[] {
  return [
    ...(flags.offersMobileService
      ? [{ icon: <Truck className="h-5 w-5" />, title: 'Mobile service', text: 'We come to your home or work' }]
      : []),
    ...(flags.offersAdasCalibration
      ? [{ icon: <ScanLine className="h-5 w-5" />, title: 'ADAS calibration included', text: 'No second trip to the dealer' }]
      : []),
    flags.filesInsuranceClaims
      ? { icon: <ShieldCheck className="h-5 w-5" />, title: 'Insurance claims handled', text: 'We work with your carrier directly' }
      : { icon: <ShieldCheck className="h-5 w-5" />, title: 'Insurance or cash', text: 'We quote it both ways so you can choose' },
    ...(extras.warrantyText
      ? [{ icon: <BadgeCheck className="h-5 w-5" />, title: extras.warrantyTitle || 'Workmanship warranty', text: 'Full terms further down this page' }]
      : []),
    // Replaces a hardcoded "most jobs done same or next day" — a scheduling
    // promise the platform cannot make on behalf of fifteen different shops.
    // The price promise is true of all of them and answers a bigger question.
    { icon: <Clock className="h-5 w-5" />, title: 'Free quote first', text: 'A real price before anything is booked' },
  ].slice(0, 4)
}

/** Hero bullets fallback when the client hasn't written their own. */
/**
 * Fallback hero bullets for a shop that wrote none.
 *
 * These are derived from the same flags as buildTrustItems, so a shop with an
 * untouched editor read "Mobile service / ADAS calibration included /
 * Insurance or cash / Free quote first" and then read it again in the strip
 * immediately below — about 600px of duplicated filler between the form and
 * the first real section. The caller drops the trust strip when it is falling
 * back to these.
 */
export function defaultHeroBullets(flags: SiteFlags): Array<{ lead: string; text: string }> {
  return [
    ...(flags.offersMobileService
      ? [{ lead: 'Mobile service available.', text: 'Home, office, or roadside.' }]
      : []),
    ...(flags.offersAdasCalibration
      ? [{ lead: 'ADAS calibration included.', text: 'No second trip to the dealer.' }]
      : []),
    flags.filesInsuranceClaims
      ? { lead: 'Insurance claims handled.', text: 'We work with your carrier directly.' }
      : { lead: 'Insurance or cash.', text: 'We quote it both ways so you can choose.' },
    { lead: 'Free quote first.', text: 'A real price before anything is booked.' },
  ]
}

export function SiteBody({
  client,
  flags,
  reviews,
  extras,
  services,
  areas,
  basePath,
  currentServiceSlug,
  locations = [],
  activeCity,
  linkableCities,
  storyChapters = [],
  storyFallbackPhotos = [],
}: {
  client: SiteClient
  flags: SiteFlags
  reviews: ReviewsData | null
  /**
   * The shop's own long-form story. Rendered AFTER the reviews rather than
   * before the services: it is the block that talks about the business
   * instead of the customer, and in the old position it stood between a paid
   * visitor and every section that answers "what will this cost me".
   */
  storyChapters?: Array<{ heading: string; body: string; photoUrl: string }>
  storyFallbackPhotos?: Array<{ url: string; alt: string }>
  extras: SiteExtras
  services: Array<{ slug: string; name: string; short: string }>
  areas: string[]
  basePath: string
  /** On a service page, that service's card links stay but the grid heading
      shifts to "everything else we handle". */
  currentServiceSlug?: string
  /** Every shop the client runs; one entry for a single-shop client. */
  locations?: SiteLocation[]
  /** City this page is about, so the shop in it leads the map section. */
  activeCity?: string | null
  /** Cities whose page is substantial enough to link to. */
  linkableCities?: Set<string>
}) {
  const prioritized = prioritizeServices(services)
  // Never the page you are standing on. On a service page the grid is headed
  // "Everything we handle" and included the current service — one of only six
  // cards, a full screen tall on a phone, linking to itself.
  const gridServices = prioritized
    .filter((s) => s.slug !== currentServiceSlug)
    .slice(0, flags.offersMobileService ? 5 : 6)

  return (
    <>
      {/* Services — capped at 6 cards so the grid never leaves an open gap */}
      {gridServices.length > 0 && (
        <section className="border-t border-[var(--line)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <SectionHead
              eyebrow="Services"
              title={currentServiceSlug ? 'Everything we handle' : 'What we handle'}
              lead="Not sure whether yours is a repair or a replacement? Send a photo with your quote and we'll tell you \u2014 a chip caught early is a great deal cheaper than the crack it turns into."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {gridServices.map((s) => {
                const Icon = SERVICE_ICONS[s.slug] || CheckCircle2
                return (
                  <a
                    key={s.slug}
                    href={`${basePath}/services/${s.slug}`}
                    className="group p-6 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm hover:shadow-md hover:border-[var(--line-strong)] hover:-translate-y-0.5 transition-all no-underline"
                  >
                    <div className="h-10 w-10 rounded-[14px] flex items-center justify-center mb-4 bg-[var(--tint)]">
                      <Icon className="h-5 w-5 text-[var(--brand)]" />
                    </div>
                    <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold text-[var(--tx)] m-0">
                      {s.name}
                    </h3>
                    <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">{s.short}</p>
                    {/* Not the name again. On desktop the repeated label reads
                        as a link affordance; on a phone the whole card is the
                        tap target, so it was the title printed twice about
                        100px apart, on five of six cards. */}
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]">
                      See details
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </a>
                )
              })}
              {flags.offersMobileService && (
                <a
                  href="#quote"
                  className="group p-6 rounded-[20px] border border-[var(--line-card)] bg-white shadow-sm hover:shadow-md hover:border-[var(--line-strong)] hover:-translate-y-0.5 transition-all no-underline"
                >
                  <div className="h-10 w-10 rounded-[14px] flex items-center justify-center mb-4 bg-[var(--tint)]">
                    <Truck className="h-5 w-5 text-[var(--brand)]" />
                  </div>
                  <h3 className="text-[clamp(1.1875rem,1.1rem+.4vw,1.375rem)] leading-[1.3] font-bold text-[var(--tx)] m-0">
                    Mobile Service
                  </h3>
                  <p className="text-[var(--tx-muted)] text-sm mt-1.5 mb-0">
                    Home, office, or roadside — the shop comes to you.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]">
                    Get a quote
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* How it works — numbered steps on the s2 tint */}
      <ProcessSection
        client={client}
        offersMobileService={flags.offersMobileService}
        offersAdasCalibration={flags.offersAdasCalibration}
      />

      {/* Stat band — dark, data-derived, strips without enough data */}
      <StatBand reviews={reviews} areasCount={areas.length} servicesCount={services.length} />

      {/* Insurance — the warm band; the warranty follows immediately so the
          price/risk question the insurance copy raises gets answered while
          it's fresh */}
      <InsuranceBand state={client.state} filesClaims={flags.filesInsuranceClaims} />
      <WarrantyBand extras={extras} />

      {/* Range-of-work gallery (stripped when no photos) */}
      <GalleryGrid extras={extras} />

      {/* Reviews (live GBP data only; stripped when absent) */}
      <ReviewsBand reviews={reviews} />

      {/* The shop's own story — after the proof, not before the services */}
      <ChapterSections
        client={client}
        chapters={storyChapters}
        fallbackPhotos={storyFallbackPhotos}
      />

      {/* Map + Google listing (shop locations only) */}
      <MapSection
        client={client}
        reviews={reviews}
        areas={areas}
        offersMobileService={flags.offersMobileService}
        locations={locations}
        activeCity={activeCity}
      />

      {/* FAQ (objection handling) ahead of the coverage band: the areas list
          is fourteen outbound links, and it used to sit between the map and
          the FAQ where it read as the end of the page. */}
      <FaqSection
        extras={null}
        extraFaq={withDefaultFaq(extras.faq, {
          state: client.state,
          offersAdasCalibration: flags.offersAdasCalibration,
        })}
      />

      {/* Service areas — dark coverage band */}
      <AreasBand client={client} areas={areas} basePath={basePath} linkableCities={linkableCities} />

      <FinalCta client={client} />
    </>
  )
}

/** Footer + sticky bar, rendered by pages AFTER the main landmark. */
export function SiteChrome({
  client,
  flags,
  reviews,
  extras,
  services,
  areas,
  basePath,
  locations = [],
  linkableCities,
}: {
  client: SiteClient
  flags: SiteFlags
  reviews: ReviewsData | null
  extras: SiteExtras
  services: Array<{ slug: string; name: string; short: string }>
  areas: string[]
  basePath: string
  locations?: SiteLocation[]
  linkableCities?: Set<string>
}) {
  return (
    <>
      <SiteFooter
        client={client}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        reviews={reviews}
        offersMobileService={flags.offersMobileService}
        offersAdasCalibration={flags.offersAdasCalibration}
        locations={locations}
        linkableCities={linkableCities}
      />
      <MobileCallBar client={client} quoteHref="#quote" smsCapable={flags.smsCapable} />
    </>
  )
}
