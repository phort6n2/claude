import { formatPhoneDisplay } from '@/lib/lead-display'
import { canViewSite, isPreview, siteIsLive } from '@/lib/site-preview'
import PreviewBanner from '@/components/sites/PreviewBanner'
import { headers } from 'next/headers'
import { servicePath } from '@/lib/site-paths'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { SiteAnalytics } from '@/components/sites/analytics'
import { withSitePhone } from '@/lib/site-phone'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import {
  UtilBar,
  SiteHeader,
  RatingChip,
  SiteUnavailable,
  Eyebrow,
  BulletCheck,
  CallButton,
  CtaButton,
  SiteBaseStyles,
  SkipLink,
  TrustRow,
  type ReviewsData,
  type ReviewQuote,
} from '@/components/sites/shared'
import {
  SiteBody,
  SiteChrome,
  WidgetMount,
  WidgetScript,
  buildTrustItems,
  defaultHeroBullets,
  prioritizeServices,
} from '@/components/sites/site-body'
import { getSiteExtras } from '@/lib/site-content'
import { sitePaletteVars } from '@/lib/site-theme'
import { getClientLocations } from '@/lib/client-locations'
import { cityIsIndexable, getCityContent } from '@/lib/city-content'
import { hostStanceFor, siteOriginFor, sitePathPrefixFor } from '@/lib/site-origin'
import { getAdsTracking } from '@/lib/ads-tracking'
import { GoogleTag } from '@/components/sites/GoogleTag'
import { CustomScripts } from '@/components/sites/CustomScripts'
import { mergeServiceAreas } from '@/lib/site-locations'
import { keptPagesFor } from '@/lib/site-pages'
import { homeJsonLd } from '@/lib/site-schema'
import { heroCostLineFor } from '@/lib/insurance-rules'

/**
 * Hosted client landing page, styled after the landing-template reference
 * build (collisionglass.co): light theme on brand-tinted surfaces, section
 * order and rhythm matching the reference. Service and location pages render
 * the same shell (SiteBody) with their own hero and lead-in content.
 *
 * Served at {slug}.glassleads.app (middleware rewrite) and directly at
 * /sites/{slug} for previewing before DNS is set up. Everything on the page —
 * name, phone, colors, services, service areas, reviews — renders from the
 * database, so improving this template improves every client's site on the
 * next deploy. Rating claims render only from live cached GBP data and are
 * stripped entirely when absent. Regenerated at most every 5 minutes (ISR),
 * never at build time.
 */

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getClient(slug: string) {
  // The label in the URL may be the full slug or the short siteSubdomain.
  return prisma.client.findFirst({
    // The label may be the full slug, the short subdomain, or — when the
    // client has pointed their own domain here — the hostname itself.
    where: { OR: [{ slug }, { siteSubdomain: slug }, { domains: { some: { domain: slug } } }] },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      domains: {
        where: { isPrimary: true },
        select: { domain: true, verified: true, misconfigured: true },
        take: 1,
      },
      status: true,
      businessName: true,
      phone: true,
      siteDisplayPhone: true,
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      logoUrl: true,
      footerLogoUrl: true,
      headScripts: true,
      bodyEndScripts: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      offersMobileService: true,
      offersWindshieldRepair: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
      filesInsuranceClaims: true,
      smsCapable: true,
      serviceAreas: true,
      googleMapsUrl: true,
      clarityProjectId: true,
    },
  })
}

async function getReviews(clientId: string): Promise<ReviewsData | null> {
  try {
    const row = await prisma.clientGbpReviews.findUnique({ where: { clientId } })
    if (!row) return null
    return {
      rating: row.rating,
      reviewCount: row.reviewCount,
      quotes: (row.reviews as unknown as ReviewQuote[]) || [],
    }
  } catch {
    // Table may not exist yet; the band is simply stripped.
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client || !(await canViewSite(client.status))) return { title: 'Not Found' }

  // Which host is this request on? Only the canonical one may be indexed;
  // every other host self-canonicalises and asks to stay out of the index.
  // The two are kept apart deliberately — see src/lib/site-origin.ts.
  const stance = hostStanceFor(client, (await headers()).get('host'))
  const siteRoot = stance.canonicalOrigin
  const robots = stance.isCanonicalHost ? undefined : { index: false, follow: true }
  const title = `${client.businessName} | Auto Glass Repair & Replacement in ${client.city}, ${client.state}`
  const description = `Fast, professional windshield repair and replacement in ${client.city}, ${client.state}. Free quotes, insurance assistance${client.offersMobileService ? ', mobile service to your home or office' : ''}. Call ${formatPhoneDisplay(client.phone) || client.phone}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: client.businessName,
      images: [`${siteRoot}/api/site-og/${client.slug}`],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${siteRoot}/api/site-og/${client.slug}`] },
    ...(robots ? { robots } : {}),
    alternates: { canonical: `${stance.canonicalOrigin}/` },
  }
}

export default async function ClientSitePage({ params }: PageProps) {
  const { slug } = await params
  const client = await getClient(slug)

  if (!client) notFound()
  // Admins see the full render of a not-live site — building one requires
  // looking at it, and flipping ACTIVE "just to look" is how half-built
  // sites used to go live. Everyone else keeps getting the holding page.
  const preview = await isPreview(client.status)
  if (!siteIsLive(client.status) && !preview) return <SiteUnavailable />

  const [reviews, extras, locations, adsTracking, cityContent, keptPages] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
    getClientLocations(client.id, client),
    getAdsTracking(client.id),
    getCityContent(client.id),
    keptPagesFor(client.id, client.businessName),
  ])
  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
  // Shop cities are part of the coverage list and lead the location pages —
  // a city we have an address in outranks one we only drive to.
  const areas = mergeServiceAreas(client.serviceAreas || [], locations.map((l) => l.city))
  const basePath = sitePathPrefixFor(client, (await headers()).get('host'))
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const flags = {
    offersMobileService: client.offersMobileService,
    offersAdasCalibration: client.offersAdasCalibration,
    filesInsuranceClaims: client.filesInsuranceClaims,
    smsCapable: client.smsCapable,
  }
  const nav = prioritizeServices(services).slice(0, 4).map((s) => ({
    href: `${basePath}${servicePath(s.slug)}`,
    label: s.name,
  }))

  const siteOrigin = siteOriginFor(client)
  const jsonLd = homeJsonLd({
    origin: siteOrigin,
    client,
    services: services.map((s) => ({ slug: s.slug, name: s.name })),
    extras,
    locations,
  })

  // From here down the page is for humans, so the tracking number takes over
  // when one is set. The jsonLd above was built FIRST, from the real line —
  // search engines cross-check schema phone against the Business Profile, and
  // a tracking number there splits the local signal. Order is load-bearing.
  client.phone = (await withSitePhone(client)).phone

  // Headline names the location and the highest-value service the client
  // actually offers, like the reference — never a generic slogan.
  // Ordered by what the VISITOR searched, not by what the shop is proudest
  // of. "ADAS calibration" is trade jargon to someone with a cracked
  // windshield — it reads as an unknown surcharge — while mobile service is
  // the strongest thing a glass shop can say and answers "do I lose a day of
  // work". ADAS earns its place further down, as an objection it removes.
  const heroTitle = client.offersMobileService
    ? `Cracked windshield in ${client.city}? We come to you.`
    : `Windshield repair and replacement in ${client.city}`

  // Cities the site is willing to link to: a shop is there, or the client has
  // written something specific about it.
  const linkableCities = new Set(
    areas
      .filter((area) => cityIsIndexable(area, cityContent, locations.map((l) => l.city)))
      .map((area) => area.trim().toLowerCase())
  )

  // When the shop wrote its own bullets, the trust strip adds a second,
  // different set of reasons. When it did not, both are derived from the same
  // flags and say the same four things twice — so the strip stands down.
  const wroteOwnBullets = extras.heroBullets.length > 0
  const trustItems = wroteOwnBullets ? buildTrustItems(client, flags, extras) : []
  const heroBullets = wroteOwnBullets ? extras.heroBullets : defaultHeroBullets(flags)

  return (
    <div
      className="gl-site min-h-screen bg-[var(--paper)] text-[var(--tx)] leading-[1.62]"
      style={palette as React.CSSProperties}
    >
      {preview && <PreviewBanner status={client.status} />}
      <SiteBaseStyles />
      <SiteAnalytics
        projectId={client.clarityProjectId}
        slug={client.slug}
        pageType="home"
      />
      <GoogleTag tracking={adsTracking} />
      <CustomScripts head={client.headScripts} bodyEnd={client.bodyEndScripts} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SkipLink />
      <UtilBar
        client={client}
        note={
          client.offersMobileService
            ? `Mobile service across ${client.city} & nearby — we come to your home or workplace`
            : `Serving ${client.city}, ${client.state} and nearby`
        }
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={nav} />

      <main id="main">
      {/* Hero — light gradient over the brand tint. Mobile order is the
          conversion spec from the reference: headline, then the FORM, then
          the supporting bullets; on desktop the form spans both rows on the
          right. When the client has photos, the first gallery shot sits
          underneath at low opacity (the owner's request — keep it). */}
      <section
        className="relative overflow-hidden pt-5 pb-9 lg:pt-[52px] lg:pb-[68px]"
        style={{
          background: 'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)',
        }}
      >
        {extras.galleryPhotos[0] && (
          // Not on phones. This paints a texture at 13% opacity, and on one
          // live client it is a 2500px 188KB file — which made a DECORATION
          // the LCP element: blocking it dropped measured LCP from 5.5s to
          // 2.7s on slow 4G, with the H1 taking over. There is no image
          // optimiser on these remote hosts (see next.config.ts), so the
          // honest saving is not to send it to the device that cannot afford
          // it. The gradient underneath carries the hero on its own.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={extras.galleryPhotos[0].url}
            alt=""
            aria-hidden="true"
            fetchPriority="low"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-[0.13] pointer-events-none select-none hidden sm:block"
          />
        )}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_452px] lg:grid-rows-[auto_1fr] lg:gap-x-[52px] lg:gap-y-[18px]">
          <div className="lg:col-start-1 lg:row-start-1">
            {/* "Experts" is unsupported puffery the reader discounts on
                sight; the eyebrow's job is the keyword anchor. */}
            <Eyebrow>
              Windshield repair &amp; replacement · {client.city}, {client.state}
            </Eyebrow>
            <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
              {heroTitle}
            </h1>
            <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-[48ch]">
              Free quote before you commit to anything — we&apos;ll tell you what your insurance
              covers and what you&apos;d actually pay.
              {client.offersMobileService
                ? ` We come to your home, office or roadside in ${client.city}.`
                : ` Bring it to our ${client.city} shop and we'll take it from there.`}
            </p>
            {/* The money question, answered in the first screen instead of
                section eight. State-aware, no per-shop data, and already
                through compliance review in insurance-rules.ts. */}
            <p className="mt-3 text-[15px] leading-[1.5] text-[var(--tx2)] max-w-[46ch] border-l-2 border-[var(--cta)] pl-3">
              {heroCostLineFor(client.state)}
            </p>
            {/* Shown on phones too. A mobile visitor met a ~950px form having
                been given a headline and a price line and no evidence at all —
                the proof sat about 1,500px below the fold. It is built from
                the live Google feed and returns null when there is none, so a
                shop with no reviews still shows nothing. */}
            <div className="mt-5 mb-[18px]">
              <RatingChip reviews={reviews} client={client} />
            </div>
          </div>

          {/* Quote widget — above the fold on desktop, right under the
              headline on mobile */}
          <div id="quote" className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end">
            <WidgetMount client={client} />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <ul className="space-y-2.5 list-none p-0 m-0 max-w-xl">
              {heroBullets.map((b) => (
                <li key={b.lead} className="flex items-start gap-2.5 text-[var(--tx2)]">
                  <BulletCheck />
                  <span>
                    <strong className="text-[var(--tx)]">{b.lead}</strong>
                    {b.text ? ` ${b.text}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 max-[719px]:flex max-[719px]:flex-col max-[719px]:[&>a]:w-full flex flex-wrap gap-3">
              <CtaButton href="#quote">Get my free quote</CtaButton>
              <CallButton client={client} withLabel />
            </div>
          </div>
        </div>

        {/* Reference's .tb strip: four short factual claims under the hero */}
        <TrustRow items={trustItems} />
      </section>

      <SiteBody
        client={client}
        flags={flags}
        reviews={reviews}
        // Not truncated. The reason to cap was that the story stood between
        // a paid visitor and the sections that answer "what does this cost" —
        // moving it below the proof fixed that, and cutting sections the shop
        // actually wrote only loses their content and their photos.
        storyChapters={extras.chapters}
        storyFallbackPhotos={extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        locations={locations}
        linkableCities={linkableCities}
      />
      </main>

      <SiteChrome
        client={client}
        flags={flags}
        reviews={reviews}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        locations={locations}
        linkableCities={linkableCities}
        pages={keptPages}
      />

      <WidgetScript client={client} basePath={basePath} />
    </div>
  )
}
