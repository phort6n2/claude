// ============================================
// AUTO GLASS DIRECTORY — SEO / STRUCTURED DATA
// ============================================
// Reusable, pure builders that return plain schema.org JSON-LD objects
// (Record<string, unknown>). Nothing here touches React or the DOM — pages
// serialize the result with `jsonLdScript()` (or JSON.stringify) into a
// <script type="application/ld+json"> tag.

import type { Shop } from './types'
import { serviceMeta, shopHref } from './data'

const SITE_NAME = 'AutoGlass Directory'

/** Full weekday names indexed by BusinessHours.day (0 = Sunday). */
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

// ---- URL helpers ---------------------------------------------------------

/**
 * Build an absolute URL from NEXT_PUBLIC_SITE_URL (fallback placeholder),
 * trimming any trailing slash from the base. Internal paths keep their
 * `/directory` prefix — pass them exactly as they appear in the app
 * (e.g. `/directory/shop/acme`).
 */
export function absoluteUrl(path: string): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://autoglassdirectory.example'
  ).replace(/\/$/, '')
  if (!path) return base
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
}

// ---- Serialization -------------------------------------------------------

/**
 * Serialize a JSON-LD object for embedding in a <script> tag. Escapes `<`
 * so a stray "</script>" inside data can't break out of the tag.
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

// ---- Site-level builders -------------------------------------------------

/** schema.org WebSite with a SearchAction wired to the directory search page. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl('/directory'),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/directory/search?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** schema.org Organization for the directory brand. */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl('/directory'),
    description:
      'Free directory of local auto glass and windshield repair shops — ' +
      'windshield replacement, chip repair, ADAS calibration, and mobile service.',
  }
}

// ---- Breadcrumbs ---------------------------------------------------------

/** schema.org BreadcrumbList. Each item is a display name + an internal path. */
export function breadcrumbJsonLd(
  items: { name: string; path: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

// ---- Shop (AutoRepair LocalBusiness) -------------------------------------

/**
 * Rich AutoRepair LocalBusiness for a single shop. Optional fields (email,
 * url, image, geo, aggregateRating) are omitted cleanly when absent.
 */
export function autoRepairJsonLd(shop: Shop): Record<string, unknown> {
  const openingHours = shop.hours
    .filter((h) => h.open && h.close)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_NAMES[h.day],
      opens: h.open,
      closes: h.close,
    }))

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    '@id': absoluteUrl(shopHref(shop)),
    name: shop.name,
    description: shop.description,
    telephone: shop.phone,
    url: shop.website ?? absoluteUrl(shopHref(shop)),
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: shop.street,
      addressLocality: shop.city,
      addressRegion: shop.state.toUpperCase(),
      postalCode: shop.zip,
      addressCountry: 'US',
    },
    areaServed: {
      '@type': 'City',
      name: shop.city,
    },
    makesOffer: shop.services.map((key) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: serviceMeta(key).label,
      },
    })),
  }

  if (shop.email) data.email = shop.email

  // image: only emit when the shop actually has one. The current Shop model
  // has no image field, so nothing is added today. If the schema later gains
  // e.g. `shop.image`, add: `if (shop.image) data.image = shop.image`.

  if (typeof shop.lat === 'number' && typeof shop.lng === 'number') {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: shop.lat,
      longitude: shop.lng,
    }
  }

  if (typeof shop.rating === 'number' && typeof shop.reviewCount === 'number') {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: shop.rating,
      reviewCount: shop.reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  if (openingHours.length > 0) {
    data.openingHoursSpecification = openingHours
  }

  return data
}

// ---- Lists ---------------------------------------------------------------

/** schema.org ItemList of shops — used on city and state landing pages. */
export function itemListJsonLd(shops: Shop[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: shops.length,
    itemListElement: shops.map((shop, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(shopHref(shop)),
      name: shop.name,
    })),
  }
}

// ---- FAQ -----------------------------------------------------------------

/** schema.org FAQPage from a list of question/answer pairs. */
export function faqPageJsonLd(
  faqs: { q: string; a: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  }
}
