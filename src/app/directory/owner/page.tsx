import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import {
  Phone,
  Mail,
  Car,
  Inbox,
  TrendingUp,
  Sparkles,
  ExternalLink,
  BadgeCheck,
  Wrench,
} from 'lucide-react'
import { getShopBySlug, shopHref, getCityRank } from '@/lib/directory/data'
import { OWNER_COOKIE, verifyOwnerKey } from '@/lib/directory/owner-auth'
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/directory/admin-auth'
import { hydratePaidFeatured, isPaidFeatured } from '@/lib/directory/featured'
import { featuredCheckoutUrl, AGMP_AUDIT_URL, FEATURED_PRICE_DISPLAY } from '@/lib/directory/agmp'
import { listQuotesForShop, quotesEnabled } from '@/lib/directory/quotes'
import { OwnerLogin } from '@/components/directory/OwnerLogin'
import { OwnerSession } from '@/components/directory/OwnerSession'
import { ReviewWidgetCode } from '@/components/directory/ReviewWidgetCode'
import { OwnerProfileEditor } from '@/components/directory/OwnerProfileEditor'
import { getOwnerProfile } from '@/lib/directory/profiles'
import { enrichShop } from '@/lib/directory/photos'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://windshieldrepairhq.com').replace(
  /\/$/,
  ''
)

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Owner dashboard',
  robots: { index: false, follow: false },
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default async function OwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key: linkKey } = await searchParams
  const cookieStore = await cookies()
  const cookieKey = cookieStore.get(OWNER_COOKIE)?.value
  const adminEmail = verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value)

  // Cookie session first, then a key from an access link.
  const slug = verifyOwnerKey(cookieKey) ?? verifyOwnerKey(linkKey)
  const shop = slug ? getShopBySlug(slug) : null

  if (!shop) {
    return <OwnerLogin initialKey={linkKey ?? ''} />
  }

  // If we authenticated from the link (not the cookie), persist it client-side.
  const persistKey = verifyOwnerKey(cookieKey) ? undefined : linkKey

  const quotes = await listQuotesForShop(shop.slug)
  const storageOn = quotesEnabled()

  // Live city rank + paid-Featured status (the recurring upsell hook).
  await hydratePaidFeatured()
  const { rank, total } = getCityRank(shop)
  const isFeatured = shop.featured || (await isPaidFeatured(shop.slug))

  // Current effective values for the profile editor: owner overrides win,
  // otherwise fall back to seed + auto-detected socials.
  const profile = await getOwnerProfile(shop.slug)
  const enriched = await enrichShop(shop)
  const profileInitial = {
    description: profile?.description ?? shop.description,
    phone: profile?.phone ?? shop.phone,
    website: profile?.website ?? shop.website ?? '',
    email: profile?.email ?? shop.email ?? '',
    socials: profile?.socials ?? enriched.socials ?? [],
  }
  const featuredCheckout = featuredCheckoutUrl(shop.slug, profileInitial.email || undefined)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {adminEmail && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="inline-flex items-center gap-1.5">
            <Wrench width={15} height={15} /> Admin view — you&apos;re editing this listing on the
            owner&apos;s behalf.
          </span>
          <Link href="/directory/manage" className="font-semibold text-amber-900 underline">
            Back to console
          </Link>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-600">Owner dashboard</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold text-gray-900">
            {shop.name}
            {shop.claimed && <BadgeCheck width={20} height={20} className="text-green-600" />}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {shop.city}, {shop.state.toUpperCase()} ·{' '}
            <Link href={shopHref(shop)} className="text-blue-600 hover:text-blue-700">
              View public listing
            </Link>
          </p>
        </div>
        <OwnerSession persistKey={persistKey} />
      </div>

      {/* Live city rank — the recurring hook */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-blue-600">
              <TrendingUp width={16} height={16} /> Your rank in {shop.city}
            </p>
            <p className="mt-1 text-3xl font-extrabold text-gray-900">
              #{rank}{' '}
              <span className="text-base font-semibold text-gray-500">
                of {total} auto glass shops
              </span>
            </p>
            {isFeatured ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                <Sparkles width={12} height={12} /> Featured in {shop.city}
              </p>
            ) : (
              <p className="mt-2 max-w-md text-sm text-gray-600">
                The top listings capture most of the driver clicks. Jump to the top of {shop.city}.
              </p>
            )}
          </div>
          {!isFeatured && (
            <div className="flex flex-col items-stretch gap-2">
              <a
                href={featuredCheckout ?? AGMP_AUDIT_URL}
                {...(featuredCheckout ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Sparkles width={16} height={16} /> Get Featured — {FEATURED_PRICE_DISPLAY}
              </a>
              <a
                href={AGMP_AUDIT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                Or run a free audit
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Marketing / upsell — the whole point of getting owners logged in */}
      <section className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-sm sm:p-8">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-100">
          <Sparkles width={16} height={16} /> From Windshield Repair HQ
        </div>
        <h2 className="mt-2 text-xl font-bold sm:text-2xl">
          {quotes.length > 0
            ? `You've received ${quotes.length} lead${quotes.length === 1 ? '' : 's'} — let's get you more.`
            : 'Ready to turn your listing into a steady stream of jobs?'}
        </h2>
        <p className="mt-2 max-w-2xl text-blue-100">
          Your free listing puts you on the map. Our managed SEO &amp; Google Ads get you to the
          top of local search — where {shop.city} drivers are searching for glass repair right
          now. Most shops we work with see more calls within 60 days.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={`mailto:hello@windshieldrepairhq.com?subject=${encodeURIComponent(
              `Grow ${shop.name} with SEO & Ads`
            )}`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <TrendingUp width={16} height={16} /> Book a free growth call
          </a>
          <Link
            href="/directory/for-shops"
            className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            See how it works <ExternalLink width={15} height={15} />
          </Link>
        </div>
      </section>

      {/* Owner self-service profile editing */}
      <OwnerProfileEditor initial={profileInitial} />

      {/* Free embeddable review widget for the shop's own website */}
      <ReviewWidgetCode
        code={`<script src="${SITE_URL}/widget/reviews.js" data-shop="${shop.slug}" async></script>`}
      />

      {/* Leads */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Inbox width={20} height={20} className="text-blue-600" /> Your quote requests
        </h2>

        {!storageOn && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Lead storage isn&apos;t configured yet. New quote requests will appear here once it&apos;s
            connected.
          </p>
        )}

        {storageOn && quotes.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-gray-300 px-4 py-12 text-center">
            <p className="text-gray-500">No quote requests yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              When a customer requests a quote on your listing, it&apos;ll show up here instantly.
            </p>
          </div>
        )}

        {quotes.length > 0 && (
          <div className="mt-4 space-y-3">
            {quotes.map((q) => (
              <div key={q.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{q.name}</span>
                  <span className="text-xs text-gray-400">{timeAgo(q.createdAt)}</span>
                </div>
                {q.service && (
                  <p className="mt-0.5 text-sm text-gray-500">Needs: {q.service}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  <a
                    href={`tel:${q.phone}`}
                    className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Phone width={14} height={14} /> {q.phone}
                  </a>
                  {q.email && (
                    <a
                      href={`mailto:${q.email}`}
                      className="inline-flex items-center gap-1.5 text-gray-600 hover:text-blue-600"
                    >
                      <Mail width={14} height={14} /> {q.email}
                    </a>
                  )}
                  {q.vehicle && (
                    <span className="inline-flex items-center gap-1.5 text-gray-600">
                      <Car width={14} height={14} /> {q.vehicle}
                    </span>
                  )}
                </div>
                {q.message && <p className="mt-3 text-sm text-gray-700">{q.message}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
