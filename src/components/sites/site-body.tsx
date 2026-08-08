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
  FinalCta,
  SiteFooter,
  MobileCallBar,
  type SiteClient,
  type ReviewsData,
  type TrustItem,
} from '@/components/sites/shared'
import type { SiteExtras } from '@/lib/site-content'

/**
 * The shared body of every hosted-site page — everything between the hero
 * area and the end of the document. Home, service, and location pages all
 * render this same stack so each page IS the homepage with a different hero
 * and lead-in content, exactly like the reference build's per-page template.
 */

export interface SiteFlags {
  offersMobileService: boolean
  offersAdasCalibration: boolean
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
      ? [{ icon: <ScanLine className="h-5 w-5" />, title: 'ADAS calibration', text: 'Cameras recalibrated after replacement' }]
      : []),
    { icon: <ShieldCheck className="h-5 w-5" />, title: 'Insurance claims handled', text: 'We work with your carrier directly' },
    ...(extras.warrantyText
      ? [{ icon: <BadgeCheck className="h-5 w-5" />, title: extras.warrantyTitle || 'Workmanship warranty', text: 'Full terms further down this page' }]
      : []),
    { icon: <Clock className="h-5 w-5" />, title: 'Fast scheduling', text: 'Most jobs done same or next day' },
  ].slice(0, 4)
}

/** Hero bullets fallback when the client hasn't written their own. */
export function defaultHeroBullets(flags: SiteFlags): Array<{ lead: string; text: string }> {
  return [
    ...(flags.offersMobileService
      ? [{ lead: 'Mobile service available.', text: 'Home, office, or roadside.' }]
      : []),
    ...(flags.offersAdasCalibration
      ? [{ lead: 'ADAS calibration.', text: 'Cameras recalibrated after replacement.' }]
      : []),
    { lead: 'Insurance claims handled.', text: 'We work with your carrier directly.' },
    { lead: 'Fast scheduling.', text: 'Most jobs done same or next day.' },
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
}: {
  client: SiteClient
  flags: SiteFlags
  reviews: ReviewsData | null
  extras: SiteExtras
  services: Array<{ slug: string; name: string; short: string }>
  areas: string[]
  basePath: string
  /** On a service page, that service's card links stay but the grid heading
      shifts to "everything else we handle". */
  currentServiceSlug?: string
}) {
  const prioritized = prioritizeServices(services)
  const gridServices = prioritized.slice(0, flags.offersMobileService ? 5 : 6)

  return (
    <>
      {/* Services — capped at 6 cards so the grid never leaves an open gap */}
      {gridServices.length > 0 && (
        <section className="border-t border-[var(--line)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <SectionHead
              eyebrow="Services"
              title={currentServiceSlug ? 'Everything we handle' : 'What we handle'}
              lead="Every job backed by professional installation and quality glass."
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
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--brand)]">
                      {s.name}
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

      {/* Insurance — the warm band */}
      <InsuranceBand />

      {/* Range-of-work gallery (stripped when no photos) */}
      <GalleryGrid extras={extras} />

      {/* Reviews (live GBP data only; stripped when absent) */}
      <ReviewsBand reviews={reviews} />

      {/* Map + Google listing (shop locations only) */}
      <MapSection
        client={client}
        reviews={reviews}
        areas={areas}
        offersMobileService={flags.offersMobileService}
      />

      {/* Service areas — dark coverage band */}
      <AreasBand client={client} areas={areas} basePath={basePath} />

      {/* Warranty (rendered only when defined in full) */}
      <WarrantyBand extras={extras} />

      {/* FAQ (stripped when empty) */}
      <FaqSection extras={extras} />

      <FinalCta client={client} quoteHref="#quote" />

      <SiteFooter
        client={client}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        reviews={reviews}
        offersMobileService={flags.offersMobileService}
        offersAdasCalibration={flags.offersAdasCalibration}
      />
      <MobileCallBar client={client} quoteHref="#quote" />
    </>
  )
}
