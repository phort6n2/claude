import { formatPhoneDisplay } from '@/lib/lead-display'
import { headlineArea, areaWithState, servingLine } from '@/lib/site-area'
import { canViewSite, isPreview, siteIsLive } from '@/lib/site-preview'
import PreviewBanner from '@/components/sites/PreviewBanner'
import { headers } from 'next/headers'
import { servicePath, readPathOverrides } from '@/lib/site-paths'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { SiteAnalytics } from '@/components/sites/analytics'
import { withSitePhone } from '@/lib/site-phone'
import {
  getServicePage,
  servicesForClient,
  servicePageFor,
  serviceHeading,
  sectionsFor,
  type PageFlags,
} from '@/lib/site-services'
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
  withNetworkNav,
} from '@/components/sites/site-body'
import { getSiteExtras, getInsuranceProgram } from '@/lib/site-content'
import { networkHighlight } from '@/lib/insurance-programs'
import { heroCostLineFor, publicInsurerFor } from '@/lib/insurance-rules'
import { sitePaletteVars } from '@/lib/site-theme'
import { getClientLocations } from '@/lib/client-locations'
import { cityIsIndexable, getCityContent } from '@/lib/city-content'
import { hostStanceFor, siteOriginFor, sitePathPrefixFor } from '@/lib/site-origin'
import { getAdsTracking } from '@/lib/ads-tracking'
import { MetaVariant } from '@/components/sites/meta-variant'
import { isMetaVariant } from '@/lib/meta-variant'
import { GoogleTag } from '@/components/sites/GoogleTag'
import { CustomScripts } from '@/components/sites/CustomScripts'
import { mergeServiceAreas } from '@/lib/site-locations'
import { keptPagesFor } from '@/lib/site-pages'
import { serviceJsonLd } from '@/lib/site-schema'

/**
 * Per-service page: the full homepage shell with a service-specific hero and
 * the service's own copy as its lead-in chapters — the reference build's
 * per-page model (same template, per-page hero and body).
 */

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string; service: string }>
  /**
   * True when the catch-all is rendering this page at the shop's own address
   * for it (see Client.pathOverrides). Without it the redirect below would
   * fire on the very address it redirects TO, which is a loop.
   */
  atOverride?: boolean
  /** ?v=meta renders the Meta landing variant — see lib/meta-variant.ts. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>
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
      logoSurface: true,
      logoSurfaceUrl: true,
      headerTheme: true,
      headScripts: true,
      bodyEndScripts: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      offersMobileService: true,
      offersWindshieldRepair: true,
      repairSearchPage: true,
      offersWindshieldReplacement: true,
      offersSideWindowRepair: true,
      offersBackWindowRepair: true,
      offersSunroofRepair: true,
      offersRockChipRepair: true,
      offersAdasCalibration: true,
      filesInsuranceClaims: true,
      smsCapable: true,
      serviceAreas: true,
      // Headlines only — see lib/site-area.ts. Required by AreaNaming, so a
      // page that forgets it cannot compile.
      marketArea: true,
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

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug, service } = await params
  const metaVariant = isMetaVariant(await searchParams)
  const template = getServicePage(service)
  const client = await getClient(slug)
  if (!template || !client || !(await canViewSite(client.status))) return { title: 'Not Found' }
  // The search-only repair page has its own copy — see REPAIR_SEARCH_PAGE.
  const page = servicePageFor(template, client) || template
  const own = (await getSiteExtras(client.id)).servicePageCopy[page.slug]
  // Tracked number in the description — see the note on the home page.
  const sitePhone = (await withSitePhone(client)).phone

  // Which host is this request on? Only the canonical one may be indexed;
  // every other host self-canonicalises and asks to stay out of the index.
  // The two are kept apart deliberately — see src/lib/site-origin.ts.
  const stance = hostStanceFor(client, (await headers()).get('host'))
  const siteRoot = stance.canonicalOrigin
  // The Meta variant is never indexed; the canonical still names this page.
  const robots = stance.isCanonicalHost && !metaVariant ? undefined : { index: false, follow: true }
  // The words of THIS address, which is what an ad promised and what the
  // visitor searched — see SERVICE_ALIASES.
  const heading = serviceHeading(service)
  const title = `${heading} in ${areaWithState(client)} | ${client.businessName}`
  // A shop's own description, typed by an operator from the shop's claims,
  // replaces the template's whole sentence rather than leading it.
  const description =
    own?.metaDescription ||
    `${page.short} Free quotes from ${client.businessName} in ${headlineArea(client)}. Call ${formatPhoneDisplay(sitePhone) || sitePhone}.`
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
    alternates: {
      canonical: `${stance.canonicalOrigin}${servicePath(page.slug, readPathOverrides(client.pathOverrides))}`,
    },
  }
}

export default async function ServicePage({ params, atOverride, searchParams }: PageProps) {
  const { slug, service } = await params
  const metaVariant = isMetaVariant(await searchParams)
  const template = getServicePage(service)
  if (!template) notFound()

  const client = await getClient(slug)
  if (!client) notFound()

  // This page has been moved onto an address the shop's old site used, so the
  // template address is no longer where it lives. ONE address per page: two
  // that both answer 200 split the ranking between them, which is the whole
  // thing an override exists to avoid.
  const overrides = readPathOverrides(client.pathOverrides)
  const moved = overrides[`/${template.slug}`]
  if (moved && !atOverride) {
    permanentRedirect(`${sitePathPrefixFor(client, (await headers()).get('host'))}${moved}`)
  }
  const preview = await isPreview(client.status)
  if (!siteIsLive(client.status) && !preview) return <SiteUnavailable />
  // Visitors see the tracking number when one is set; see lib/site-phone.ts.
  // Object.assign, not `client.phone = …`: the swap now also carries the
  // shop's own line for the callback and SMS copy, and taking only `.phone`
  // would drop it. See site-phone.ts.
  Object.assign(client, await withSitePhone(client))
  // The page THIS shop serves here: the template's, the search-only stand-in
  // for a repair page (REPAIR_SEARCH_PAGE), or none.
  const offered = servicePageFor(template, client)
  if (!offered) {
    /* A service the shop has stopped offering 404s — unless the shop kept a
       redirect for its old address. Middleware rewrites a service slug
       straight to this route, so the catch-all that normally honours
       ClientRedirect never sees the request, and a redirect row for
       `/rock-chip-repair` would sit in the table doing nothing while the ad
       or the Google result pointing at it hit a 404. Asked for AGS, who
       stopped offering chip repair; with no row (every other shop) this is the
       404 it always was. */
    const asked = `/${service}`.toLowerCase()
    const redirect = await prisma.clientRedirect
      .findFirst({
        where: { clientId: client.id, fromPath: { in: Array.from(new Set([asked, `/${template.slug}`])) } },
        select: { toPath: true },
      })
      .catch(() => null)
    if (redirect) permanentRedirect(`${sitePathPrefixFor(client, (await headers()).get('host'))}${redirect.toPath}`)
    notFound()
  }
  const page = offered

  const [reviews, extras, locations, adsTracking, cityContent, keptPages, insuranceProgram] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
    getClientLocations(client.id, client),
    getAdsTracking(client.id),
    getCityContent(client.id),
    keptPagesFor(client.id, client.businessName),
    getInsuranceProgram(client.id),
  ])
  const services = servicesForClient(client as PageFlags)
  // Shop cities are part of the coverage list and lead the location pages —
  // a city we have an address in outranks one we only drive to.
  const areas = mergeServiceAreas(client.serviceAreas || [], locations.map((l) => l.city))
  const basePath = sitePathPrefixFor(client, (await headers()).get('host'))
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const flags = {
    offersMobileService: client.offersMobileService,
    offersWindshieldRepair: client.offersWindshieldRepair,
    offersAdasCalibration: client.offersAdasCalibration,
    filesInsuranceClaims: client.filesInsuranceClaims,
    smsCapable: client.smsCapable,
  }
  // The repair-network mark, for the top bar and the nav. SiteBody and
  // SiteChrome derive their own from the same record, so nothing here can
  // claim a network another band on the page does not.
  const network = networkHighlight(insuranceProgram.program, insuranceProgram.record, {
    businessName: client.businessName,
    filesClaims: client.filesInsuranceClaims,
  })
  // What this page calls itself at the address it was asked for. The JSON-LD
  // and the widget below keep the service's canonical name: one is a machine
  // record cross-checked against the canonical URL, and the other is the
  // value written onto the lead, which has to read the same for every shop.
  const heading = serviceHeading(service)
  const nav = withNetworkNav(
    network,
    basePath,
    prioritizeServices(services)
      .filter((s) => s.slug !== page.slug)
      .map((s) => ({ href: `${basePath}${servicePath(s.slug, overrides)}`, label: s.name }))
  )

  const siteOrigin = siteOriginFor(client)
  const jsonLd = serviceJsonLd({
    origin: siteOrigin,
    client,
    service: { slug: page.slug, name: page.name },
  })

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
  const heroBullets = wroteOwnBullets ? extras.heroBullets : defaultHeroBullets(flags, client.state)
  // The strip is told what the bullets above it already say, so the two
  // cannot repeat each other — see TRUST_TOPICS.
  const trustItems = wroteOwnBullets ? buildTrustItems(client, flags, extras, heroBullets) : []

  if (metaVariant) {
    // The service itself is the point of this page, so nothing is excluded
    // and the form arrives with it chosen (unless it is a delivery method,
    // not a glass type — see ServicePage.preselect).
    return (
      <MetaVariant
        client={client}
        preview={preview}
        previewStatus={client.status}
        clarityProjectId={client.clarityProjectId}
        headScripts={client.headScripts}
        bodyEndScripts={client.bodyEndScripts}
        flags={flags}
        reviews={reviews}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        adsTracking={adsTracking}
        heroTitle={`${heading} in ${headlineArea(client)}`}
        eyebrow={areaWithState(client)}
        service={page.preselect === false ? undefined : page.preselectAs || page.name}
      />
    )
  }

  // The service's own copy leads the page, chapter-style, with body photos.
  // The service's own copy leads, then the client's real story follows: the
  // highest-intent page should carry MORE proof than the home page, not less.
  // Split deliberately: the SERVICE's own copy ("when replacement is the
  // right call", "what the job involves") is objection handling and keeps the
  // high slot. The shop's general story is about the business, so it moves
  // below the proof like it does on the home page.
  // A shop's own sections for this page, when an operator wrote them, take
  // the template's place whole — see SiteExtras.servicePageCopy.
  const ownSections = extras.servicePageCopy[page.slug]?.sections
  const serviceChapters = (
    ownSections?.length ? ownSections : sectionsFor(page, client, { publicInsurer: !!publicInsurerFor(client.state) })
  ).map((s) => ({
    heading: s.heading,
    body: s.body,
    photoUrl: '',
  }))

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
        pageType="service"
      />
      <GoogleTag tracking={adsTracking} />
      <CustomScripts head={client.headScripts} bodyEnd={client.bodyEndScripts} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SkipLink />
      <UtilBar
        network={network}
        client={client}
        note={servingLine(client, {
          mobile: client.offersMobileService,
          hasShopLocation: client.hasShopLocation,
        })}
      />
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={nav} />

      <main id="main">
      {/* Hero — identical composition to the homepage, service-specific copy */}
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
            {/* The area, not the shop's own city — the same name the H1
                uses, so the two lines do not disagree about who this page
                is for. */}
            <Eyebrow>{areaWithState(client)}</Eyebrow>
            {/* The area, not the address — same reason as the homepage H1.
                The eyebrow directly above still names the city. */}
            <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
              {heading} in {headlineArea(client)}
            </h1>
            <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-[48ch]">
              {extras.serviceHeroLines[page.slug] || page.heroLine}
            </p>
          </div>

          <div id="quote" className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end">
            <WidgetMount client={client} service={page.preselect === false ? undefined : page.preselectAs || page.name} />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            {/* MOVED BELOW THE FORM ON A PHONE, by sitting in the hero's second
                row: on mobile the grid is one column, so this lands after the
                form instead of pushing it off the screen. Measured at 390px,
                505px of headline, lead, cost line and rating sat above the
                form and the first input was below the fold. Desktop is
                unchanged — both rows are the same column, so the order a
                visitor reads is identical. */}
            {/* The cost line and the rating were on the home page only — and
                these are the pages the ads actually land on. Both are
                already-reviewed, data-driven and self-stripping: the cost line
                is state-aware copy from insurance-rules.ts, the chip renders
                nothing without a live Google feed. */}
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

      {/* The service's own copy, chapter-style with body photos */}
      <ChapterSections
        client={client}
        chapters={serviceChapters}
        fallbackPhotos={extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)}
      />

      <SiteBody
        client={client}
        flags={flags}
        storyChapters={extras.chapters}
        storyFallbackPhotos={extras.bodyPhotos.length ? extras.bodyPhotos : extras.galleryPhotos.slice(1)}
        reviews={reviews}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        currentServiceSlug={page.slug}
        locations={locations}
        linkableCities={linkableCities}
        insuranceProgram={insuranceProgram}
        />
      </main>

      <SiteChrome
        privacyChoices={!!adsTracking?.privacyChoices}
        insuranceProgram={insuranceProgram}
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
