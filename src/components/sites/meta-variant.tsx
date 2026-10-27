import { Phone, ShieldCheck } from 'lucide-react'
import { SiteAnalytics } from '@/components/sites/analytics'
import { GoogleTag } from '@/components/sites/GoogleTag'
import { CustomScripts } from '@/components/sites/CustomScripts'
import PreviewBanner from '@/components/sites/PreviewBanner'
import {
  AreasBand,
  Eyebrow,
  RatingChip,
  ReviewsBand,
  SiteBaseStyles,
  SiteHeader,
  SkipLink,
  telHrefFor,
  type ReviewsData,
} from '@/components/sites/shared'
import { SiteChrome, WidgetMount, WidgetScript, type SiteFlags } from '@/components/sites/site-body'
import { GLASS_SERVICE_PAGES, type ServicePage } from '@/lib/site-services'
import { insurerNoun } from '@/lib/insurance-rules'
import { sitePaletteVars } from '@/lib/site-theme'
import type { AdsTracking } from '@/lib/ads-tracking'
import type { SiteExtras } from '@/lib/site-content'

/**
 * THE META LANDING PAGE — the same site, shorter, for a paid social click.
 *
 * Somebody who taps an Instagram ad was not searching for a windshield. They
 * have a few seconds of attention and a thumb, so the page is the form, a
 * call button and three reasons to trust the shop — not the twelve sections a
 * searcher who asked Google a question scrolls through. Everything on it is
 * the ordinary site's own: the same client record, the same components, the
 * same widget posting to the same intake, so a lead from here is dedup'd,
 * attributed, alerted and forwarded exactly like any other. Nothing is a copy
 * that could drift.
 *
 * Reached with ?v=meta on the home page or a service page; the address stays
 * the page's own, so there is no second URL to maintain or to rank. It is
 * noindex (set by the page's metadata) because a thinner duplicate of a page
 * has nothing to offer a search engine and something to take from the real
 * one.
 *
 * §2 still applies, line by line:
 * - The offer line is only ever what an operator typed for this shop, and it
 *   is absent when empty. Nothing here invents one.
 * - The insurance line is the template's existing, flag-gated sentence —
 *   "handled" only for a shop with filesInsuranceClaims on.
 * - Reviews come from the live Google feed, three at most, none padded.
 * - Services the shop does not want from this channel (AGK: chip repair) come
 *   off the copy, the footer and the form on the variant's HOME page. A
 *   service page with ?v=meta is still that service — pointing an ad at it is
 *   a deliberate choice.
 */

type WidgetClient = Parameters<typeof WidgetScript>[0]['client']

export interface MetaVariantProps {
  client: WidgetClient
  preview: boolean
  previewStatus?: string
  clarityProjectId: string | null
  headScripts: string | null
  bodyEndScripts: string | null
  flags: SiteFlags
  reviews: ReviewsData | null
  extras: SiteExtras
  services: ServicePage[]
  areas: string[]
  basePath: string
  adsTracking: AdsTracking | null
  heroTitle: string
  eyebrow: string
  /** On a service page: that service, preselected in the form. */
  service?: string
}

/**
 * The flags with the operator's excluded services switched off, for the
 * variant's home page. A service page never passes through here.
 */
export function withoutExcluded<T extends Record<string, unknown>>(client: T, excluded: string[]): T {
  if (!excluded.length) return client
  const off: Record<string, boolean> = {}
  for (const page of GLASS_SERVICE_PAGES) if (excluded.includes(page.name)) off[page.flag] = false
  // The search-only repair page wears the same name, so excluding it excludes both.
  if (off.offersWindshieldRepair === false) off.repairSearchPage = false
  return { ...client, ...off }
}

export function MetaVariant(props: MetaVariantProps) {
  const {
    client,
    flags,
    reviews,
    extras,
    services,
    areas,
    basePath,
    adsTracking,
    heroTitle,
    eyebrow,
    service,
  } = props
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const offer = adsTracking?.metaVariantOffer || null
  // The insurance sentence the hero bullets already use, gated the same way:
  // "handled" is a promise about the shop's process, so it needs the flag.
  const insuranceLine = flags.filesInsuranceClaims
    ? { lead: 'Insurance claims handled.', text: `We work with ${insurerNoun(client.state)} directly.` }
    : { lead: 'Insurance or cash.', text: 'We quote it both ways so you can choose.' }

  return (
    <div
      className="gl-site min-h-screen bg-[var(--paper)] text-[var(--tx)] leading-[1.62]"
      style={palette as React.CSSProperties}
    >
      {props.preview && props.previewStatus && <PreviewBanner status={props.previewStatus} />}
      <SiteBaseStyles />
      <SiteAnalytics projectId={props.clarityProjectId} slug={client.slug} pageType="meta" />
      <GoogleTag tracking={adsTracking} />
      <CustomScripts head={props.headScripts} bodyEnd={props.bodyEndScripts} />

      <SkipLink />
      {/* No nav: every link off this page is a visitor leaving the one thing
          the ad paid to show them. The logo and the call button stay. */}
      <SiteHeader client={client} basePath={basePath} reviews={reviews} nav={[]} />

      <main id="main">
        <section
          className="relative pt-5 pb-9 lg:pt-12 lg:pb-14"
          style={{ background: 'linear-gradient(168deg, var(--tint) 0%, var(--s1) 52%, var(--paper) 100%)' }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_452px] lg:grid-rows-[auto_1fr] lg:gap-x-[52px] lg:gap-y-[18px]">
            <div className="lg:col-start-1 lg:row-start-1">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h1 className="text-[clamp(1.75rem,1.3rem+2.4vw,3.1rem)] font-extrabold leading-[1.08] tracking-[-.02em]">
                {heroTitle}
              </h1>
              {offer && (
                <p className="mt-3 inline-block rounded-lg border-l-4 border-[var(--cta)] bg-white px-3 py-1.5 text-[16px] font-bold text-[var(--tx)]">
                  {offer}
                </p>
              )}
              <p className="mt-3 text-[17px] leading-[1.5] text-[var(--tx2)] max-w-[46ch]">
                Free quote first — a real price before anything is booked.
              </p>
            </div>

            {/* The form, directly under the headline on a phone. */}
            <div id="quote" className="w-full scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:justify-self-end">
              <WidgetMount client={client} service={service} />
            </div>

            <div className="lg:col-start-1 lg:row-start-2 space-y-4">
              {/* The big one. A paid social visitor is on a phone, and a tap to
                  call is the shortest route from the ad to a booked job. */}
              <a
                href={telHrefFor(client.phone)}
                className="flex w-full max-w-md items-center justify-center gap-3 min-h-[60px] rounded-[16px] px-6 text-[19px] font-extrabold text-[var(--on-cta)] no-underline"
                style={{
                  background: 'linear-gradient(180deg, var(--cta), var(--cta-b))',
                  boxShadow: 'var(--sh-cta), inset 0 1px 0 rgba(255,255,255,.2)',
                }}
              >
                <Phone className="h-5 w-5" /> Tap to call {client.phone}
              </a>
              <p className="flex items-start gap-2.5 text-[var(--tx2)] max-w-md">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
                <span>
                  <strong className="text-[var(--tx)]">{insuranceLine.lead}</strong> {insuranceLine.text}
                </span>
              </p>
              <RatingChip reviews={reviews} client={client} />
            </div>
          </div>
        </section>

        <ReviewsBand reviews={reviews} />
        {/* Coverage as text only — no city links off a landing page. */}
        <AreasBand client={client} areas={areas} basePath={basePath} linkableCities={new Set()} />
      </main>

      <SiteChrome
        privacyChoices={!!adsTracking?.privacyChoices}
        client={client}
        flags={flags}
        reviews={reviews}
        extras={extras}
        services={services}
        areas={areas}
        basePath={basePath}
        pages={[]}
      />
      <WidgetScript client={client} basePath={basePath} />
    </div>
  )
}
