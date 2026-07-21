// ============================================
// AUTO-FILL A LISTING FROM A WEBSITE URL
// ============================================
// Fetches a business website and extracts a listing draft from its schema.org
// JSON-LD (LocalBusiness / AutoRepair / Organization) with og-tag fallbacks.
// Turns "paste a URL" into a mostly-complete listing. Best-effort: every field
// is optional, and the operator reviews before saving.

import type { BusinessHours, ServiceKey } from './types'

const FETCH_UA =
  'Mozilla/5.0 (compatible; WindshieldRepairHQ/1.0; +https://windshieldrepairhq.com)'

export interface ListingDraft {
  slug?: string
  name?: string
  phone?: string
  email?: string
  website: string
  street?: string
  city?: string
  state?: string
  stateFull?: string
  zip?: string
  country?: string
  lat?: number
  lng?: number
  hours?: BusinessHours[]
  services?: ServiceKey[]
  mobileService?: boolean
  description?: string
  photos?: string[]
  socials?: { platform: string; url: string }[]
  /** Fields we couldn't determine — surfaced so the operator knows to fill them. */
  missing: string[]
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
}
const CA_PROVINCES: Record<string, string> = {
  ON: 'Ontario', QC: 'Quebec', BC: 'British Columbia', AB: 'Alberta',
  MB: 'Manitoba', SK: 'Saskatchewan', NS: 'Nova Scotia', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island',
}
const NAME_TO_ABBR: Record<string, string> = Object.fromEntries(
  [...Object.entries(US_STATES), ...Object.entries(CA_PROVINCES)].map(([a, n]) => [
    n.toLowerCase(),
    a.toLowerCase(),
  ])
)

const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

const SERVICE_KEYWORDS: [ServiceKey, RegExp][] = [
  ['windshield-replacement', /windshield\s*(replacement|replace)/i],
  ['windshield-repair', /windshield\s*repair|crack\s*repair/i],
  ['chip-repair', /chip|rock\s*chip|stone\s*chip/i],
  ['adas-calibration', /adas|calibrat/i],
  ['mobile-service', /mobile/i],
  ['side-window', /side\s*(window|glass)|door\s*glass|quarter\s*glass/i],
  ['rear-window', /(rear|back)\s*(window|glass)/i],
  ['sunroof-repair', /sunroof|moonroof/i],
  ['window-tint', /tint/i],
  ['power-window-repair', /power\s*window|regulator/i],
]

const SOCIAL_PATTERNS: { platform: string; test: RegExp }[] = [
  { platform: 'facebook', test: /facebook\.com\//i },
  { platform: 'instagram', test: /instagram\.com\//i },
  { platform: 'x', test: /(twitter|x)\.com\//i },
  { platform: 'youtube', test: /youtube\.com\//i },
  { platform: 'linkedin', test: /linkedin\.com\//i },
  { platform: 'tiktok', test: /tiktok\.com\//i },
  { platform: 'yelp', test: /yelp\.com\/biz\//i },
]

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function typeMatches(t: unknown, re: RegExp): boolean {
  return asArray(t as string | string[]).some((x) => typeof x === 'string' && re.test(x))
}

// Flatten JSON-LD (handles arrays and @graph) into a list of nodes.
function collectNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const push = (o: unknown) => {
        if (o && typeof o === 'object') nodes.push(o as Record<string, unknown>)
      }
      for (const item of asArray(parsed)) {
        push(item)
        const graph = (item as Record<string, unknown>)['@graph']
        if (graph) asArray(graph).forEach(push)
      }
    } catch {
      /* ignore malformed blocks */
    }
  }
  return nodes
}

function normalizeState(region?: string): { state?: string; stateFull?: string } {
  if (!region) return {}
  const r = region.trim()
  if (r.length === 2) {
    const abbr = r.toUpperCase()
    const full = US_STATES[abbr] ?? CA_PROVINCES[abbr]
    return { state: abbr.toLowerCase(), stateFull: full ?? r }
  }
  const abbr = NAME_TO_ABBR[r.toLowerCase()]
  return abbr ? { state: abbr, stateFull: r } : { stateFull: r }
}

function mapHours(specs: unknown): BusinessHours[] | undefined {
  const items = asArray(specs as unknown[])
  if (!items.length) return undefined
  const week: BusinessHours[] = Array.from({ length: 7 }, (_, day) => ({
    day, open: null, close: null,
  }))
  let touched = false
  for (const raw of items) {
    const s = raw as Record<string, unknown>
    const opens = typeof s.opens === 'string' ? s.opens.slice(0, 5) : null
    const closes = typeof s.closes === 'string' ? s.closes.slice(0, 5) : null
    for (const d of asArray(s.dayOfWeek as string | string[])) {
      const name = String(d).split('/').pop()?.toLowerCase() ?? ''
      const idx = DAY_INDEX[name]
      if (idx == null) continue
      week[idx] = { day: idx, open: opens, close: closes }
      touched = true
    }
  }
  return touched ? week : undefined
}

function mapServices(text: string): ServiceKey[] {
  const found: ServiceKey[] = []
  for (const [key, re] of SERVICE_KEYWORDS) {
    if (re.test(text) && !found.includes(key)) found.push(key)
  }
  return found
}

function extractSocials(nodes: Record<string, unknown>[], html: string): {
  platform: string
  url: string
}[] {
  const urls = new Set<string>()
  for (const n of nodes) asArray(n.sameAs as string | string[]).forEach((u) => urls.add(String(u)))
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) urls.add(m[1])
  const out: { platform: string; url: string }[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    for (const { platform, test } of SOCIAL_PATTERNS) {
      if (seen.has(platform)) continue
      if (test.test(url) && !/sharer|intent|\/share|plugins/i.test(url)) {
        out.push({ platform, url: url.split('?')[0] })
        seen.add(platform)
      }
    }
  }
  return out
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  if (v && typeof v === 'object') {
    const url = (v as Record<string, unknown>).url
    if (typeof url === 'string') return url
  }
  return undefined
}

// ---- SEO opportunity scoring (turns gaps into a sales signal) --------------

export interface SeoReport {
  reachable: boolean
  /** 0–100. Higher = weaker SEO = better prospect for your services. */
  opportunity: number
  /** The shop's own SEO health, inverse of opportunity. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  gaps: string[]
  signals: Record<string, boolean>
}

function analyzeSeo(
  html: string,
  nodes: Record<string, unknown>[],
  url: string
): SeoReport {
  const reachable = html.length > 0
  if (!reachable) {
    return {
      reachable: false,
      opportunity: 95,
      grade: 'F',
      gaps: ['No working website found — the biggest opportunity of all'],
      signals: { reachable: false },
    }
  }

  const signals = {
    reachable: true,
    structuredData: nodes.some((n) =>
      typeMatches(n['@type'], /LocalBusiness|AutoRepair|AutomotiveBusiness|Organization/i)
    ),
    hours: nodes.some((n) => !!n.openingHoursSpecification),
    ogImage: /<meta[^>]+property=["']og:image["']/i.test(html),
    metaDescription: /<meta[^>]+name=["']description["']/i.test(html),
    title: /<title>[^<]{3,}<\/title>/i.test(html),
    h1: /<h1[\s>]/i.test(html),
    https: url.toLowerCase().startsWith('https://'),
    mobileViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    socials: SOCIAL_PATTERNS.some((p) => p.test.test(html)),
  }

  const weights: [keyof typeof signals, number, string][] = [
    ['structuredData', 30, 'No LocalBusiness structured data (hurts Google local/Map ranking)'],
    ['https', 15, 'Not served over HTTPS'],
    ['metaDescription', 12, 'Missing meta description'],
    ['title', 12, 'Missing or empty page title'],
    ['mobileViewport', 10, 'No mobile viewport — likely not mobile-friendly'],
    ['ogImage', 10, 'No social share image'],
    ['h1', 8, 'No H1 heading'],
    ['socials', 8, 'No linked social profiles'],
    ['hours', 5, 'No business hours in structured data'],
  ]

  let opportunity = 0
  const gaps: string[] = []
  for (const [key, weight, label] of weights) {
    if (!signals[key]) {
      opportunity += weight
      gaps.push(label)
    }
  }
  opportunity = Math.min(100, opportunity)
  const grade =
    opportunity >= 60 ? 'F' : opportunity >= 40 ? 'D' : opportunity >= 25 ? 'C' : opportunity >= 12 ? 'B' : 'A'

  return { reachable: true, opportunity, grade, gaps, signals }
}

export async function analyzeWebsite(
  url: string
): Promise<{ draft: ListingDraft; seo: SeoReport }> {
  const website = url
  const draft: ListingDraft = { website, missing: [] }

  let html = ''
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': FETCH_UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) html = await res.text()
  } catch {
    /* handled below via missing fields */
  }

  const nodes = collectNodes(html)
  const biz =
    nodes.find((n) => typeMatches(n['@type'], /AutoRepair|AutomotiveBusiness/i)) ||
    nodes.find((n) => typeMatches(n['@type'], /LocalBusiness|Store/i)) ||
    nodes.find((n) => typeMatches(n['@type'], /Organization/i)) ||
    {}

  const b = biz as Record<string, unknown>

  // Name
  draft.name =
    (typeof b.name === 'string' ? b.name : undefined) ||
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()

  // Contact
  const contact = asArray(b.contactPoint as unknown[])[0] as Record<string, unknown> | undefined
  draft.phone =
    (typeof b.telephone === 'string' ? b.telephone : undefined) ||
    (contact && typeof contact.telephone === 'string' ? contact.telephone : undefined)
  draft.email = typeof b.email === 'string' ? b.email : undefined

  // Address
  const addr = (b.address ?? {}) as Record<string, unknown>
  draft.street = typeof addr.streetAddress === 'string' ? addr.streetAddress : undefined
  draft.city = typeof addr.addressLocality === 'string' ? addr.addressLocality : undefined
  draft.zip = typeof addr.postalCode === 'string' ? addr.postalCode : undefined
  const region =
    typeof addr.addressRegion === 'string' ? addr.addressRegion : undefined
  Object.assign(draft, normalizeState(region))
  const ctry = typeof addr.addressCountry === 'string' ? addr.addressCountry : undefined
  if (ctry && /canada|^ca$/i.test(ctry)) draft.country = 'CA'

  // Geo
  const geo = (b.geo ?? {}) as Record<string, unknown>
  const lat = Number(geo.latitude)
  const lng = Number(geo.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    draft.lat = lat
    draft.lng = lng
  }

  // Hours
  draft.hours = mapHours(b.openingHoursSpecification)

  // Description
  draft.description =
    (typeof b.description === 'string' ? b.description : undefined) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]

  // Image (og:image)
  const ogImg = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  )?.[1]
  const bizImg = firstString(b.image)
  const image = ogImg || bizImg
  if (image) draft.photos = [image]

  // Services — from offer catalogs + whole-page text
  const offerText = JSON.stringify(b.makesOffer ?? b.hasOfferCatalog ?? '')
  const services = mapServices(`${offerText} ${draft.description ?? ''} ${draft.name ?? ''}`)
  if (services.length) draft.services = services
  draft.mobileService = /mobile/i.test(offerText + ' ' + (draft.description ?? ''))

  // Socials
  const socials = extractSocials(nodes, html)
  if (socials.length) draft.socials = socials

  // Slug
  if (draft.name) draft.slug = slugify(draft.name)

  // Flag what's missing
  const required: (keyof ListingDraft)[] = ['name', 'phone', 'city', 'state']
  draft.missing = required.filter((k) => !draft[k])
  if (!draft.hours) draft.missing.push('hours')
  if (!draft.services?.length) draft.missing.push('services')

  const seo = analyzeSeo(html, nodes, url)
  return { draft, seo }
}
