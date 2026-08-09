import type { SiteExtras } from '@/lib/site-content'

/**
 * JSON-LD for hosted client sites.
 *
 * Two rules shape everything here:
 *
 * 1. NO aggregateRating / Review nodes for the client's own business. Google
 *    treats a business marking up ratings about itself as self-serving and
 *    ineligible for review snippets, and separately forbids aggregating
 *    ratings from another site — our numbers are the client's own Google
 *    Business Profile rating, so it fails both tests and risks a manual
 *    action. The rating still renders as visible page content (it converts);
 *    it just isn't claimed as structured data. Stars in search come from the
 *    Business Profile itself.
 *
 * 2. ONE canonical business entity, defined in full on the home page and
 *    referenced by @id everywhere else. Repeating a full entity per page
 *    splits the business signal; inventing a per-city entity would fabricate
 *    NAP data, since a service-area city is not a branch.
 *
 * Every property is omitted when its source field is empty — nothing here is
 * invented.
 */

export interface SchemaClient {
  businessName: string
  phone: string
  email?: string | null
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country?: string | null
  logoUrl: string | null
  googleMapsUrl: string | null
  serviceAreas?: string[]
  hasShopLocation?: boolean
}

export interface SchemaService {
  slug: string
  name: string
}

/** E.164-ish: Google asks for country code on telephone. */
export function schemaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  // Not a number we can confidently qualify — emit it as written rather than
  // prefixing "+" and asserting a country code that may be wrong.
  return phone
}

const businessId = (origin: string) => `${origin}/#business`
const websiteId = (origin: string) => `${origin}/#website`

/** The full business entity — emitted ONLY on the home page. */
function businessEntity(
  origin: string,
  client: SchemaClient,
  services: SchemaService[],
  photos: Array<{ url: string; alt: string }>
) {
  const entity: Record<string, unknown> = {
    '@type': 'AutoRepair',
    '@id': businessId(origin),
    name: client.businessName,
    url: `${origin}/`,
    telephone: schemaPhone(client.phone),
    address: {
      '@type': 'PostalAddress',
      streetAddress: client.streetAddress,
      addressLocality: client.city,
      addressRegion: client.state,
      postalCode: client.postalCode,
      addressCountry: client.country || 'US',
    },
  }
  if (client.email) entity.email = client.email
  if (client.serviceAreas?.length) {
    entity.areaServed = client.serviceAreas.map((a) => ({ '@type': 'City', name: a }))
  }
  if (client.googleMapsUrl) {
    // The Business Profile is a canonical profile of this entity, and (for a
    // walk-in shop) its map.
    entity.sameAs = [client.googleMapsUrl]
    if (client.hasShopLocation !== false) entity.hasMap = client.googleMapsUrl
  }
  if (client.logoUrl) {
    entity.logo = { '@type': 'ImageObject', url: client.logoUrl }
  }
  if (photos.length) {
    entity.image = photos.slice(0, 6).map((p) => ({
      '@type': 'ImageObject',
      contentUrl: p.url,
      ...(p.alt ? { caption: p.alt } : {}),
    }))
  }
  if (services.length) {
    entity.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Auto glass services',
      // No Offer/price nodes: we hold no pricing data and will not imply any.
      itemListElement: services.map((s) => ({
        '@type': 'Service',
        name: s.name,
        serviceType: s.name,
        url: `${origin}/services/${s.slug}`,
        provider: { '@id': businessId(origin) },
      })),
    }
  }
  return entity
}

export function homeJsonLd({
  origin,
  client,
  services,
  extras,
}: {
  origin: string
  client: SchemaClient
  services: SchemaService[]
  extras: SiteExtras
}) {
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite',
      '@id': websiteId(origin),
      url: `${origin}/`,
      name: client.businessName,
      publisher: { '@id': businessId(origin) },
    },
    businessEntity(origin, client, services, extras.galleryPhotos),
  ]
  if (extras.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${origin}/#faq`,
      mainEntityOfPage: { '@id': `${origin}/` },
      mainEntity: extras.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}

export function serviceJsonLd({
  origin,
  client,
  service,
}: {
  origin: string
  client: SchemaClient
  service: SchemaService
}) {
  const url = `${origin}/services/${service.slug}`
  const svc: Record<string, unknown> = {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: service.name,
    serviceType: service.name,
    url,
    provider: { '@id': businessId(origin) },
  }
  if (client.serviceAreas?.length) {
    svc.areaServed = client.serviceAreas.map((a) => ({ '@type': 'City', name: a }))
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      svc,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: client.businessName, item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: service.name, item: url },
        ],
      },
      // Reference only — the full entity lives on the home page.
      { '@type': 'AutoRepair', '@id': businessId(origin) },
    ],
  }
}

export function locationJsonLd({
  origin,
  client,
  area,
  slug,
}: {
  origin: string
  client: SchemaClient
  area: string
  slug: string
}) {
  const url = `${origin}/locations/${slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        name: `Auto Glass in ${area}`,
        isPartOf: { '@id': websiteId(origin) },
        about: { '@id': businessId(origin) },
      },
      // A service-area city is coverage, not a second location: reference the
      // one business and state the area it serves.
      {
        '@type': 'AutoRepair',
        '@id': businessId(origin),
        areaServed: { '@type': 'City', name: area },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: client.businessName, item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: `Auto Glass in ${area}`, item: url },
        ],
      },
    ],
  }
}

export function legalJsonLd({
  origin,
  title,
  path,
  businessName,
}: {
  origin: string
  title: string
  path: string
  businessName: string
}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${origin}${path}`,
        name: title,
        isPartOf: { '@id': websiteId(origin) },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: businessName, item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: title, item: `${origin}${path}` },
        ],
      },
    ],
  }
}
