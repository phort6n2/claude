// ============================================
// AUTO GLASS DIRECTORY — DATA TYPES
// ============================================
// The public directory is intentionally decoupled from the Prisma/Postgres
// command-center database. It reads from a static JSON seed file so it can be
// built, previewed, and deployed with zero database setup. When you're ready
// to accept live claims/submissions, migrate `directory-shops.json` into a DB
// table and swap the loader in `data.ts` — nothing else needs to change.

export type ServiceKey =
  | 'windshield-replacement'
  | 'windshield-repair'
  | 'chip-repair'
  | 'adas-calibration'
  | 'mobile-service'
  | 'side-window'
  | 'rear-window'
  | 'power-window-repair'
  | 'commercial-fleet'
  | 'rv-heavy-equipment'

export interface ServiceMeta {
  key: ServiceKey
  label: string
  /** Short blurb used on shop pages and for SEO copy. */
  blurb: string
}

export interface BusinessHours {
  /** 0 = Sunday ... 6 = Saturday */
  day: number
  /** 24h "HH:MM", or null when closed that day. */
  open: string | null
  close: string | null
}

export interface Shop {
  /** URL slug, unique across the directory. */
  slug: string
  name: string
  phone: string
  email?: string
  website?: string

  // Location
  street: string
  city: string
  /** Two-letter state code, lowercase in URLs (e.g. "tx"). */
  state: string
  /** Full state name for display, e.g. "Texas". */
  stateFull: string
  zip: string
  lat?: number
  lng?: number

  // Offering
  services: ServiceKey[]
  mobileService: boolean
  insurance: string[]
  hours: BusinessHours[]

  // Marketing / trust signals
  description: string
  rating?: number
  reviewCount?: number
  yearsInBusiness?: number

  // Directory state
  /** A claimed listing means the owner has verified/edited it. */
  claimed: boolean
  /** Featured listings surface first — this is a natural paid upsell slot. */
  featured: boolean
}

export interface CitySummary {
  city: string
  state: string
  stateFull: string
  citySlug: string
  count: number
}

export interface StateSummary {
  state: string
  stateFull: string
  count: number
  cities: CitySummary[]
}
