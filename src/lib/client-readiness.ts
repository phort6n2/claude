import { prisma } from '@/lib/db'
import { getSiteExtras } from '@/lib/site-content'
import { getClientLocations } from '@/lib/client-locations'
import { mergeServiceAreas, LOCATION_PAGE_LIMIT } from '@/lib/site-locations'
import { getCityContent, cityIsIndexable, type CityContent } from '@/lib/city-content'

/**
 * Is this client actually finished?
 *
 * Onboarding a shop is a dozen small steps across six tabs, and the ones that
 * get missed are never the loud ones — nobody forgets the business name. They
 * forget the thing whose absence looks identical to "working": a site with no
 * conversion tag still serves, a lead with no alert still saves, a location
 * page with forty words still returns 200. The whole point of this file is to
 * name those, in one place, so the header can say so on every tab.
 *
 * Two severities, and the distinction is load-bearing:
 *   required    — the client is not getting what they pay for until it's done
 *   recommended — the site works, but it is measurably worse without it
 *
 * A check that is merely optional for this client is not reported at all.
 * Padding the list with things nobody intends to do teaches the operator to
 * ignore the badge, which is worse than not having one.
 */

export type CheckSeverity = 'required' | 'recommended'

export interface ReadinessCheck {
  id: string
  label: string
  ok: boolean
  /** Shown only when not ok — what is wrong, in the operator's language. */
  detail: string
  severity: CheckSeverity
  /** Tab that fixes it. */
  href: string
}

export interface ReadinessReport {
  checks: ReadinessCheck[]
  requiredOpen: number
  recommendedOpen: number
  /** Everything required is done. */
  ready: boolean
}

export async function getClientReadiness(clientId: string): Promise<ReadinessReport> {
  const base = `/admin/clients/${clientId}`

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) return { checks: [], requiredOpen: 0, recommendedOpen: 0, ready: false }

  const [extras, locations, reviews, destinations, notification, tracking, userCount, cityContent] =
    await Promise.all([
      getSiteExtras(clientId),
      getClientLocations(clientId, client),
      prisma.clientGbpReviews.findUnique({ where: { clientId } }).catch(() => null),
      prisma.webhookDestination
        .findMany({
          where: { clientId, enabled: true },
          select: {
            id: true,
            deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          },
        })
        .catch(() => []),
      prisma.clientNotification.findUnique({ where: { clientId } }).catch(() => null),
      prisma.clientAdsTracking.findUnique({ where: { clientId } }).catch(() => null),
      prisma.clientUser.count({ where: { clientId } }).catch(() => 0),
      getCityContent(clientId).catch(() => new Map<string, CityContent>()),
    ])

  const checks: ReadinessCheck[] = []
  const add = (
    id: string,
    label: string,
    ok: boolean,
    detail: string,
    severity: CheckSeverity,
    href: string
  ) => checks.push({ id, label, ok, detail, severity, href })

  // ---- Business basics ----
  const services = [
    client.offersWindshieldReplacement,
    client.offersWindshieldRepair,
    client.offersRockChipRepair,
    client.offersSideWindowRepair,
    client.offersBackWindowRepair,
    client.offersSunroofRepair,
    client.offersAdasCalibration,
  ].filter(Boolean).length

  add(
    'phone',
    'Phone number',
    !!client.phone?.trim(),
    'Every call button on the site is dead without it.',
    'required',
    `${base}/business`
  )
  add(
    'services',
    'Services selected',
    services > 0,
    'No services ticked, so the services grid and every service page are empty.',
    'required',
    `${base}/business`
  )
  add(
    'address',
    'Address',
    !!(client.streetAddress?.trim() && client.city?.trim() && client.state?.trim()),
    'The map, the schema markup and the footer all need a full street address.',
    'required',
    `${base}/business`
  )
  add(
    'areas',
    'Service areas',
    (client.serviceAreas || []).length > 0,
    'No cities listed, so there are no location pages and nothing to bid on locally.',
    'required',
    `${base}/business`
  )

  // Hours are per shop, and a shop with none shows a blank in the footer where
  // a customer looks to decide whether to drive over.
  const shopsWithoutHours = locations.filter((l) => !l.hours?.trim())
  add(
    'hours',
    'Opening hours',
    shopsWithoutHours.length === 0,
    shopsWithoutHours.length === locations.length
      ? 'No opening hours on file — pull them from Google on the Business tab.'
      : `${shopsWithoutHours.length} shop${shopsWithoutHours.length === 1 ? '' : 's'} missing hours: ${shopsWithoutHours.map((l) => l.label || l.city).join(', ')}.`,
    'recommended',
    `${base}/business`
  )

  // ---- Site ----
  add(
    'subdomain',
    'Site address',
    !!client.siteSubdomain,
    'No subdomain provisioned, so the site only answers on the long /sites/ URL.',
    'required',
    `${base}/site`
  )
  add(
    'logo',
    'Logo',
    !!client.logoUrl,
    'Without a logo the header shows text, the favicon is a monogram, and photos go out unwatermarked.',
    'required',
    `${base}/business`
  )
  add(
    'reviews',
    'Google reviews connected',
    !!reviews && !reviews.lastError,
    reviews?.lastError
      ? `Google returned: ${reviews.lastError}`
      : 'No Place ID matched, so the site shows no rating anywhere.',
    'required',
    `${base}/site`
  )
  add(
    'photos',
    'Photos',
    extras.galleryPhotos.length >= 3,
    extras.galleryPhotos.length === 0
      ? 'No photos, so the gallery is missing and the hero has no background.'
      : `Only ${extras.galleryPhotos.length}. Three is the point where the gallery stops looking sparse.`,
    'recommended',
    `${base}/site`
  )
  add(
    'warranty',
    'Warranty',
    !!extras.warrantyText,
    'The warranty band is one of the strongest trust signals on the page and it is currently absent.',
    'recommended',
    `${base}/site`
  )
  add(
    'faq',
    'FAQs',
    extras.faq.length >= 3,
    extras.faq.length === 0
      ? 'No FAQs, so the FAQ section and its schema markup are both missing.'
      : `Only ${extras.faq.length}. Three or more is where the section earns its space.`,
    'recommended',
    `${base}/site`
  )
  add(
    'chapters',
    'Story sections',
    extras.chapters.length > 0,
    'The page goes hero → services with nothing in between that reads like this specific business.',
    'recommended',
    `${base}/site`
  )

  // Location pages: thin ones still serve (a 404 on an ad destination gets the
  // ad disapproved) but they carry noindex, so they cost money and earn none.
  const shopCities = locations.map((l) => l.city).filter(Boolean)
  const cities = mergeServiceAreas(client.serviceAreas || [], shopCities).slice(
    0,
    LOCATION_PAGE_LIMIT
  )
  const thin = cities.filter((city) => !cityIsIndexable(city, cityContent, shopCities))
  add(
    'city-content',
    'Location page copy',
    cities.length > 0 && thin.length === 0,
    cities.length === 0
      ? 'No cities, so no location pages exist.'
      : `${thin.length} of ${cities.length} still too thin to index: ${thin.join(', ')}. They serve, but with noindex.`,
    'recommended',
    `${base}/site`
  )

  // ---- Lead flow ----
  const failing = destinations.filter((d) => d.deliveries[0]?.status === 'FAILED')
  const alertsOn =
    !!notification &&
    ((notification.emailEnabled && notification.emailTo.filter(Boolean).length > 0) ||
      (notification.smsEnabled && notification.smsTo.filter(Boolean).length > 0))

  add(
    'lead-reach',
    'Leads reach the shop',
    destinations.length > 0 || alertsOn,
    'Nothing forwards and nobody is alerted — a lead lands here and waits to be noticed.',
    'required',
    `${base}/leads-setup`
  )
  if (destinations.length > 0) {
    add(
      'delivery-health',
      'Lead delivery working',
      failing.length === 0,
      `${failing.length} of ${destinations.length} destinations failed their last delivery.`,
      'required',
      `${base}/leads-setup`
    )
  }
  add(
    'portal-user',
    'Portal login',
    userCount > 0,
    'Nobody at the shop can log in to see their own leads.',
    'recommended',
    `${base}/users`
  )

  // ---- Advertising ----
  // Only assessed once an Ads account is in play. A client not running ads
  // should not be told they are missing a conversion tag.
  const hasGoogle = !!tracking?.conversionId
  const hasBing = !!tracking?.bingUetTagId
  if (hasGoogle || hasBing) {
    if (hasGoogle) {
      add(
        'lead-conversion',
        'Form-lead conversion',
        !!tracking?.leadConversionLabel,
        'A Google tag is loading but no lead conversion is configured, so form submissions report nothing.',
        'required',
        `${base}/advertising`
      )
      add(
        'ads-account',
        'Ads account linked',
        !!tracking?.googleAdsCustomerId,
        'Pick the client’s Google Ads account so the checker can confirm conversions are recording.',
        'recommended',
        `${base}/advertising`
      )
    }
    if (hasBing) {
      add(
        'bing-action',
        'Microsoft event goal',
        !!tracking?.bingLeadEventAction,
        'The UET tag is installed but no event action is set, so no goal can match.',
        'required',
        `${base}/advertising`
      )
    }
  } else {
    add(
      'tracking',
      'Conversion tracking',
      false,
      'Neither Google nor Microsoft is configured, so ad spend cannot be tied to leads.',
      'recommended',
      `${base}/advertising`
    )
  }

  const requiredOpen = checks.filter((c) => !c.ok && c.severity === 'required').length
  const recommendedOpen = checks.filter((c) => !c.ok && c.severity === 'recommended').length

  return { checks, requiredOpen, recommendedOpen, ready: requiredOpen === 0 }
}
