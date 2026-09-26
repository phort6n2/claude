import { formatPhoneDisplay } from '@/lib/lead-display'
import { headlineArea, areaWithState, servingLine } from '@/lib/site-area'
import { canViewSite, isPreview, siteIsLive } from '@/lib/site-preview'
import PreviewBanner from '@/components/sites/PreviewBanner'
import { headers } from 'next/headers'
import { servicePath, readPathOverrides } from '@/lib/site-paths'
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
  ChapterSections,
  SectionHead,
  NumberedSteps,
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
import { getSiteExtras } from '@/lib/site-content'
import { heroCostLineFor } from '@/lib/insurance-rules'
import { sitePaletteVars } from '@/lib/site-theme'
import { getClientLocations } from '@/lib/client-locations'
import { cityIsIndexable, getCityContent } from '@/lib/city-content'
import { hostStanceFor, siteOriginFor, sitePathPrefixFor } from '@/lib/site-origin'
import { getAdsTracking } from '@/lib/ads-tracking'
import { GoogleTag } from '@/components/sites/GoogleTag'
import { CustomScripts } from '@/components/sites/CustomScripts'
import { mergeServiceAreas } from '@/lib/site-locations'
import { keptPagesFor } from '@/lib/site-pages'
import { legalJsonLd } from '@/lib/site-schema'
import {
  programForPath,
  programFor,
  readProgramRecord,
  programIsPublished,
  programSections,
  programTitle,
  programHeroLine,
  programDescription,
  programPath,
  type InsuranceProgram,
  type ProgramCopyContext,
  type ProgramRecord,
  networkHighlight,
} from '@/lib/insurance-programs'

/**
 * The insurance-claim landing page — see lib/insurance-programs.ts.
 *
 * NOT A ROUTE FILE, and that is deliberate. Next makes a route out of every
 * `page.tsx`, so putting this under `app/sites/[slug]/insurance/[program]/`
 * would give the page a SECOND address that also answers 200 — which is the
 * one thing `site-paths.ts` exists to prevent, because a page served at two
 * addresses splits its own ranking between them. The services have that
 * legacy shape already; nothing new should.
 *
 * So it lives here and the catch-all imports it, exactly as the catch-all
 * already imports the city and service pages. One flat address, which is also
 * the address an ad can point at.
 */

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string; program: string }>
}

async function getClient(slug: string) {
  return prisma.client.findFirst({
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
      // Headlines only — see lib/site-area.ts. Required by AreaNaming, so a
      // page that forgets it cannot compile.
      marketArea: true,
      pathOverrides: true,
      googleMapsUrl: true,
      clarityProjectId: true,
    },
  })
}

/**
 * The client's programme record, or null.
 *
 * The table may not exist yet on a database that predates it — the same
 * defensive read every other bootstrap-added table gets here, so a missing
 * table costs this one page rather than every page on the site.
 */
export async function programRecordFor(clientId: string): Promise<ProgramRecord | null> {
  const row = await prisma.clientInsuranceProgram
    .findUnique({ where: { clientId } })
    .catch(() => null)
  return readProgramRecord(row)
}

/**
 * Resolve the address to this client's published page, or null.
 *
 * THE ADDRESS HAS TO MATCH THE CLIENT'S OWN PROGRAMME. Every programme's slug
 * is a real address on every site otherwise, so `/icbc-glass-claims` on a
 * Texas shop would render a page about British Columbia. Unpublished is a 404
 * for the same reason an empty page is worse than no page.
 */
async function resolve(slug: string, programSlug: string) {
  const program = programForPath(programSlug)
  if (!program) return null
  const client = await getClient(slug)
  if (!client) return null
  const record = await programRecordFor(client.id)
  if (!record || record.programKey !== program.key) return null
  return { client, program, record }
}

function contextFor(
  client: { businessName: string; city: string; state: string; marketArea: string | null; filesInsuranceClaims: boolean; offersMobileService: boolean },
): ProgramCopyContext {
  return {
    businessName: client.businessName,
    area: headlineArea(client),
    state: client.state,
    filesClaims: client.filesInsuranceClaims,
    mobile: client.offersMobileService,
  }
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
    return null
  }
}

export async function insuranceProgramMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, program: programSlug } = await params
  const found = await resolve(slug, programSlug)
  if (!found || !(await canViewSite(found.client.status))) return { title: 'Not Found' }
  const { client, program, record } = found

  // Tracked number in the description — see the note on the home page.
  const sitePhone = (await withSitePhone(client)).phone
  const ctx = contextFor(client)
  const stance = hostStanceFor(client, (await headers()).get('host'))
  const siteRoot = stance.canonicalOrigin
  // AN UNPUBLISHED PAGE ASKS TO STAY OUT OF THE INDEX even while an operator
  // is looking at it in preview. The page itself 404s for a visitor; this is
  // for the one who is previewing it on the /sites/ address.
  const robots =
    !stance.isCanonicalHost || !programIsPublished(record)
      ? { index: false, follow: true }
      : undefined

  const title = `${programTitle(program, ctx)} | ${client.businessName}`
  const description = `${programDescription(program, record, ctx)} Call ${formatPhoneDisplay(sitePhone) || sitePhone}.`
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
    alternates: { canonical: `${stance.canonicalOrigin}${programPath(program)}` },
  }
}

export default async function InsuranceProgramPage({ params }: PageProps) {
  const { slug, program: programSlug } = await params
  const found = await resolve(slug, programSlug)
  if (!found) notFound()
  const { client, program, record } = found

  const preview = await isPreview(client.status)
  if (!siteIsLive(client.status) && !preview) return <SiteUnavailable />
  // Unpublished is a 404 for a visitor and visible in preview, which is how
  // an operator reads the page before putting an ad's money behind it.
  if (!programIsPublished(record) && !preview) notFound()

  // Visitors see the tracking number when one is set; see lib/site-phone.ts.
  // Object.assign, not `client.phone = …`: the swap also carries the shop's
  // own line for the callback copy, and taking only `.phone` would drop it.
  Object.assign(client, await withSitePhone(client))

  const [reviews, extras, locations, adsTracking, cityContent, keptPages] = await Promise.all([
    getReviews(client.id),
    getSiteExtras(client.id),
    getClientLocations(client.id, client),
    getAdsTracking(client.id),
    getCityContent(client.id),
    keptPagesFor(client.id, client.businessName),
  ])

  const ctx = contextFor(client)
  const services = servicesForClient(client as Record<ServiceFlag, boolean>)
  const areas = mergeServiceAreas(client.serviceAreas || [], locations.map((l) => l.city))
  const basePath = sitePathPrefixFor(client, (await headers()).get('host'))
  const overrides = readPathOverrides(client.pathOverrides)
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
  const network = networkHighlight(program, record, {
    businessName: client.businessName,
    filesClaims: client.filesInsuranceClaims,
  })
  const nav = withNetworkNav(
    network,
    basePath,
    prioritizeServices(services).map((s) => ({
      href: `${basePath}${servicePath(s.slug, overrides)}`,
      label: s.name,
    }))
  )

  const linkableCities = new Set(
    areas
      .filter((area) => cityIsIndexable(area, cityContent, locations.map((l) => l.city)))
      .map((area) => area.trim().toLowerCase())
  )

  const wroteOwnBullets = extras.heroBullets.length > 0
  const heroBullets = wroteOwnBullets ? extras.heroBullets : defaultHeroBullets(flags, client.state)
  const trustItems = wroteOwnBullets ? buildTrustItems(client, flags, extras, heroBullets) : []

  const heading = programTitle(program, ctx)
  // The page's own copy, in the same chapter block every other page type uses.
  const chapters = programSections(program, record, ctx).map((s) => ({
    heading: s.heading,
    body: s.body,
    photoUrl: '',
  }))

  const siteOrigin = siteOriginFor(client)
  // A PLAIN WebPage, with no insurer entity in it. The schema on this page
  // could very easily imply a relationship with the insurer that § 2 forbids
  // claiming in words — machine-readable, indexed and invisible on screen is
  // the worst combination, which is the same reason the white-label rule
  // scrubs JSON-LD rather than trusting the visible copy.
  const jsonLd = legalJsonLd({
    origin: siteOrigin,
    title: heading,
    path: programPath(program),
    businessName: client.businessName,
  })

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
        pageType="insurance"
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
        {/* Hero — the same composition as every other page type, so a paid
            click lands on a form rather than on a document. */}
        <section
          className="relative overflow-hidden pt-5 pb-9 lg:pt-[52px] lg:pb-[68px]"
          style={{
            background: 'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)',
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
              <Eyebrow>{areaWithState(client)}</Eyebrow>
              <h1 className="text-[clamp(1.875rem,1.35rem+2.6vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-.02em] text-[var(--tx)]">
                {heading}
              </h1>
              <p className="mt-4 text-[17px] leading-[1.55] text-[var(--tx2)] max-w-[48ch]">
                {programHeroLine(program)}
              </p>
            </div>

            <div
              id="quote"
              className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end"
            >
              {/* THE COMMERCIAL INFORMATION THIS PAGE HAS TO CARRY. A claim
                  page with nothing to act on is an explainer, and an ad
                  pointed at an explainer is the most expensive page a shop
                  can own. Same widget, same intake, same attribution as every
                  other page. */}
              <WidgetMount client={client} />
            </div>

            <div className="lg:col-start-1 lg:row-start-2">
              {/* MOVED BELOW THE FORM ON A PHONE by sitting in the hero's
                  second row — see the service page for the measurement. */}
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
                <span className="hidden lg:contents">
                  <CtaButton href="#quote">Get my free quote</CtaButton>
                </span>
                <CallButton client={client} withLabel />
              </div>
            </div>
          </div>

          <TrustRow items={trustItems} />
        </section>

        {/* The claim, step by step. Rendered as its own band rather than as
            prose: the steps ARE what somebody came here to read, and a
            numbered list is the one shape that survives being skimmed. */}
        <ProgramSteps steps={record.claimSteps} short={program.short} />

        {/* Coverage, how we handle it, what to have ready — the same chapter
            block a service page uses, so this page is indistinguishable in
            layout from one the template wrote. */}
        <ChapterSections
          client={client}
          chapters={chapters}
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
          insuranceProgram={{ program, record }}
        />
      </main>

      <SiteChrome
        insuranceProgram={{ program, record }}
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

/**
 * The operator's claim steps. Strips itself when there are none.
 *
 * THE SAME BLOCK "how it works" USES, not a card grid of its own. The first
 * version was plain white boxes with small number chips, no eyebrow and no
 * connector — a band that looked like a different website from the one
 * directly above it, and with four steps in a fixed three-column grid the
 * fourth sat alone under a half-empty row, reading as a layout that had given
 * up rather than as a step. `NumberedSteps` owns both the look and the column
 * count now; see `stepColumns`.
 */
function ProgramSteps({ steps, short }: { steps: string[]; short: string }) {
  if (steps.length === 0) return null
  return (
    <section className="bg-[var(--s2)] border-t border-[var(--line)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <SectionHead
          eyebrow="The claim"
          title={`How the ${short === 'insurance' ? 'claim' : `${short} claim`} works`}
          lead="Start with the form or a call — we will tell you what it costs before anything is booked."
        />
        <NumberedSteps steps={steps.map((body) => ({ body }))} />
      </div>
    </section>
  )
}
