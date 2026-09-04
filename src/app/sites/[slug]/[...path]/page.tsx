import { formatPhoneDisplay } from '@/lib/lead-display'
import { isPreview, siteIsLive } from '@/lib/site-preview'
import PreviewBanner from '@/components/sites/PreviewBanner'
import { headers } from 'next/headers'
import { servicePath } from '@/lib/site-paths'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { SiteAnalytics } from '@/components/sites/analytics'
import { withSitePhone } from '@/lib/site-phone'
import { servicesForClient, type ServiceFlag } from '@/lib/site-services'
import { mergeServiceAreas } from '@/lib/site-locations'
import { keptPagesFor, stripSeoTail } from '@/lib/site-pages'
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
  ChapterSections,
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
import { heroCostLineFor } from '@/lib/insurance-rules'
import { sitePaletteVars } from '@/lib/site-theme'
import { getClientLocations } from '@/lib/client-locations'
import { cityIsIndexable, getCityContent } from '@/lib/city-content'
import { hostStanceFor, siteOriginFor, sitePathPrefixFor } from '@/lib/site-origin'
import { getAdsTracking } from '@/lib/ads-tracking'
import { GoogleTag } from '@/components/sites/GoogleTag'
import { CustomScripts } from '@/components/sites/CustomScripts'
import { legalJsonLd } from '@/lib/site-schema'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { retargetKeptHtml, keptChapters } from '@/lib/kept-content'
import { hostedPathsFor } from '@/lib/url-parity'
import { normalisePath } from '@/lib/url-parity'
import LocationPage, { generateMetadata as locationMetadata } from '@/app/sites/[slug]/locations/[city]/page'
import ServicePage, { generateMetadata as serviceMetadata } from '@/app/sites/[slug]/services/[service]/page'
import { getServicePage } from '@/lib/site-services'
import { cityFromPath, canonicalForCustom, readPathOverrides } from '@/lib/site-paths'


export const dynamic = 'force-dynamic'

/**
 * Anything on a client host that is not one of the built-in page types.
 *
 * Three outcomes, in this order:
 *
 * 1. A page this shop kept from their old site → render it.
 * 2. A redirect they set up → permanent redirect to where it went.
 * 3. Neither → 404, exactly as before this route existed.
 *
 * Pages BEFORE redirects on purpose. If somebody has kept a page at an
 * address, that beats a stale redirect rule pointing the same address
 * somewhere else — the page is the more specific, more recent decision.
 *
 * The redirect is a 308, not a 301 — that is what `permanentRedirect` emits.
 * Google treats the two the same for passing ranking; the difference is that
 * 308 also forbids a client turning a POST into a GET, which is stricter and
 * harmless here. Worth writing down because "301" is what everyone says and
 * the log will not agree with them.
 *
 * A KEPT PAGE IS A FULL SITE PAGE, NOT A DOCUMENT. It renders the same shell
 * as the home, service and location pages: header, hero, QUOTE FORM, trust
 * row, then the kept copy, then the standard proof sections, footer and
 * mobile call bar. That is not tidiness. These are exactly the addresses a
 * live ad already points at — keeping the page instead of redirecting it is
 * what makes them worth keeping — so a paid click lands here. The first cut
 * of this rendered in the legal shell, which has no form, no nav and no call
 * button: an ad landing page a visitor can read and then leave, which is the
 * most expensive page a shop can own.
 */

interface PageProps {
  params: Promise<{ slug: string; path: string[] }>
}

async function getClient(slug: string) {
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
      pathOverrides: true,
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

async function resolve(slug: string, segments: string[]) {
  const path = normalisePath(`/${(segments || []).join('/')}`)
  const client = await getClient(slug)
  if (!client) return { client: null, path, page: null, redirect: null }

  const [page, redirect] = await Promise.all([
    prisma.clientPage
      .findFirst({ where: { clientId: client.id, path, publishedAt: { not: null } } })
      .catch(() => null),
    prisma.clientRedirect
      .findFirst({ where: { clientId: client.id, fromPath: path } })
      .catch(() => null),
  ])
  return { client, path, page, redirect }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, path } = await params
  const { client, page } = await resolve(slug, path)
  if (!client) return { title: 'Not Found' }

  // THE SAME FALLTHROUGH THE PAGE BELOW USES, and it has to be here too.
  //
  // Without it the two disagreed: the page rendered the city (or service)
  // perfectly while this returned the 404's metadata, so every flat city URL
  // on every site — the addresses the ads point at and the footer links to —
  // came back titled "Not Found", with no canonical, no description and no
  // OG image. A crawler reads the head; a visitor reads the tab. Both were
  // told the page did not exist while looking straight at it.
  //
  // Delegating rather than rebuilding: those routes already compute the city
  // and service metadata, including the canonical-host stance, and a second
  // copy here is what drifts.
  if (!page) {
    const flatPath = normalisePath(`/${(path || []).join('/')}`)
    // A template page MOVED to one of the old site's addresses. Resolved
    // ahead of the built-in shapes because it is the more specific rule, and
    // its metadata has to come from the page it actually is.
    const moved = canonicalForCustom(flatPath, readPathOverrides(client.pathOverrides))
    const flat = (moved || flatPath).slice(1)
    const city = cityFromPath(flat)
    if (city) return locationMetadata({ params: Promise.resolve({ slug, city }) })
    if (getServicePage(flat)) {
      return serviceMetadata({ params: Promise.resolve({ slug, service: flat }) })
    }
    return { title: 'Not Found' }
  }

  // Which host is this request on? Only the canonical one may be indexed;
  // every other host self-canonicalises and asks to stay out of the index.
  const stance = hostStanceFor(client, (await headers()).get('host'))
  const siteRoot = stance.canonicalOrigin
  const robots = stance.isCanonicalHost ? undefined : { index: false, follow: true }
  // Tracked number in the description — see the note on the home page.
  const sitePhone = (await withSitePhone(client)).phone
  const heading = stripSeoTail(page.title, client.businessName)
  const title = `${heading} | ${client.businessName}`
  const description =
    page.metaDescription ||
    `${heading} from ${client.businessName} in ${client.city}, ${client.state}. Free quotes. Call ${formatPhoneDisplay(sitePhone) || sitePhone}.`
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
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${siteRoot}/api/site-og/${client.slug}`],
    },
    ...(robots ? { robots } : {}),
    alternates: { canonical: `${stance.canonicalOrigin}${page.path}` },
  }
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug, path } = await params
  const { client, page, redirect } = await resolve(slug, path)
  if (!client) notFound()
  const preview = await isPreview(client.status)
  if (!siteIsLive(client.status) && !preview) return <SiteUnavailable />

  if (!page) {
    if (redirect) permanentRedirect(redirect.toPath)

    // A flat city URL the shop's ads point at. RENDERED, not redirected: a
    // redirect is a changed destination in Google's eyes, and the whole point
    // is that moving the domain costs no edits in the Ads account.
    const flatPath = normalisePath(`/${(path || []).join('/')}`)
    // A template page moved onto one of the old site's addresses. Same
    // reasoning as the flat city URL above, taken one step further: the page
    // IS this address now, so it renders here and the template address 308s
    // the other way.
    const moved = canonicalForCustom(flatPath, readPathOverrides(client.pathOverrides))
    const flat = (moved || flatPath).slice(1)
    const city = cityFromPath(flat)
    if (city) return <LocationPage params={Promise.resolve({ slug, city })} atOverride={!!moved} />
    // Services resolve here as well as in middleware. Middleware only runs on
    // a client host, so without this the flat links would 404 on the
    // /sites/{slug} preview — the one place an operator checks the site
    // before pointing a domain at it.
    if (getServicePage(flat)) {
      return <ServicePage params={Promise.resolve({ slug, service: flat })} atOverride={!!moved} />
    }

    notFound()
  }

  // Visitors see the tracking number when one is set; see lib/site-phone.ts.
  // The real number is kept because whether the swap HAPPENED decides whether
  // this app may overwrite a phone number sitting in the captured copy.
  const realPhone = client.phone
  client.phone = (await withSitePhone(client)).phone
  const siteOwnsTracking = client.phone !== realPhone

  const [reviews, extras, locations, adsTracking, cityContent, keptPages] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
    getClientLocations(client.id, client),
    getAdsTracking(client.id),
    getCityContent(client.id),
    keptPagesFor(client.id, client.businessName),
  ])

  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
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
    href: `${basePath}${servicePath(s.slug, readPathOverrides(client.pathOverrides))}`,
    label: s.name,
  }))
  const linkableCities = new Set(
    areas
      .filter((area) => cityIsIndexable(area, cityContent, locations.map((l) => l.city)))
      .map((area) => area.trim().toLowerCase())
  )

  // When the shop wrote its own bullets, the trust strip adds a second,
  // different set of reasons. When it did not, both come from the same flags
  // and say the same four things twice — so the strip stands down.
  const wroteOwnBullets = extras.heroBullets.length > 0
  const heroBullets = wroteOwnBullets ? extras.heroBullets : defaultHeroBullets(flags)
  // The strip is told what the bullets above it already say, so the two
  // cannot repeat each other — see TRUST_TOPICS.
  const trustItems = wroteOwnBullets ? buildTrustItems(client, flags, extras, heroBullets) : []

  const heading = stripSeoTail(page.title, client.businessName)
  // Sanitised at render, never trusted as stored: this HTML came off somebody
  // else's website and is served from the shop's own origin. Then retargeted —
  // its links and its phone number belong to the OLD site, and both are wrong
  // here in ways that do not look wrong. See lib/kept-content.ts.
  const publishedPaths = await prisma.clientPage
    .findMany({
      where: { clientId: client.id, publishedAt: { not: null } },
      select: { path: true },
    })
    .catch(() => [])
  const html = retargetKeptHtml(sanitizeHtml(page.bodyHtml), {
    phone: client.phone,
    siteOwnsTracking,
    servedPaths: [
      ...hostedPathsFor({
        serviceAreas: client.serviceAreas || [],
        shopCities: locations.map((l) => l.city),
        flags: client as unknown as Record<ServiceFlag, boolean>,
      }),
      ...publishedPaths.map((p) => p.path),
    ],
  })
  const siteOrigin = siteOriginFor(client)
  const jsonLd = legalJsonLd({
    origin: siteOrigin,
    title: heading,
    path: page.path,
    businessName: client.businessName,
  })

  return (
    <div
      className="gl-site min-h-screen bg-[var(--paper)] text-[var(--tx)] leading-[1.62]"
      style={palette as React.CSSProperties}
    >
      {preview && <PreviewBanner status={client.status} />}
      <SiteBaseStyles />
      <SiteAnalytics projectId={client.clarityProjectId} slug={client.slug} pageType="kept" />
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
        {/* Hero — the same composition as every other page type, so a paid
            click lands on a form rather than on a document. */}
        <section
          className="relative overflow-hidden pt-5 pb-9 lg:pt-[52px] lg:pb-[68px]"
          style={{
            background:
              'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)',
          }}
        >
          {extras.galleryPhotos[0] && (
            // Not on phones — see the same block on the service page for why a
            // 13%-opacity decoration became the LCP element.
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
              <Eyebrow>
                {client.city}, {client.state}
              </Eyebrow>
              <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
                {heading}
              </h1>
            </div>

            <div
              id="quote"
              className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end"
            >
              <WidgetMount client={client} />
            </div>

            <div className="lg:col-start-1 lg:row-start-2">
            {/* MOVED BELOW THE FORM ON A PHONE, by sitting in the hero's second
                row: on mobile the grid is one column, so this lands after the
                form instead of pushing it off the screen. Measured at 390px,
                505px of headline, lead, cost line and rating sat above the
                form and the first input was below the fold. Desktop is
                unchanged — both rows are the same column, so the order a
                visitor reads is identical. */}
              <p className="mt-3 text-[15px] leading-[1.5] text-[var(--tx2)] max-w-[46ch] border-l-2 border-[var(--cta)] pl-3">
                {heroCostLineFor(client.state)}
              </p>
              <div className="mt-5 mb-[18px]">
                <RatingChip reviews={reviews} client={client} />
              </div>
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
                {/* Desktop only. On a phone the form is ABOVE this, so tapping
                  "Get my free quote" scrolled the visitor back up to a form
                  they had already scrolled past — and its label repeated the
                  submit button they passed on the way. The call button stays:
                  it is the one action the form does not already offer. */}
              <span className="hidden lg:contents">
                <CtaButton href="#quote">Get my free quote</CtaButton>
              </span>
                <CallButton client={client} withLabel />
              </div>
            </div>
          </div>

          <TrustRow items={trustItems} />
        </section>

        {/* The page's own copy, in the SAME chapter block a service page
            uses — same grid, same alternating photos, same type. A kept page
            has to be indistinguishable in layout from one the template wrote;
            it previously had a prose column of its own, which is exactly what
            made it read as a wall bolted onto the page. */}
        <ChapterSections
          client={client}
          chapters={keptChapters(html)}
          fallbackPhotos={
            extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)
          }
        />

        <SiteBody
          client={client}
          flags={flags}
          storyChapters={extras.chapters}
          storyFallbackPhotos={
            extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)
          }
          reviews={reviews}
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
