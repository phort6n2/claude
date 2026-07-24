import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, TrendingUp, Phone, BarChart3, MapPin, Check, Star } from 'lucide-react'
import { FOR_SHOPS } from '@/lib/directory/content'
import { AgmpDisclosure } from '@/components/directory/AgmpDisclosure'
import { AGMP_AUDIT_URL, FEATURED_PRICE_DISPLAY } from '@/lib/directory/agmp'

const TIERS = [
  {
    name: 'Free Listing',
    price: 'Free',
    priceNote: 'forever',
    features: ['Directory listing', 'Show up in city & service searches', 'Get quote requests'],
    excluded: ['Priority “Featured” position', 'Google Map Pack + AI search', 'Google Ads', 'Conversion website'],
    cta: { label: 'Add my free listing', href: '/directory/claim' },
    highlight: false,
  },
  {
    name: 'Featured',
    price: FEATURED_PRICE_DISPLAY,
    priceNote: 'cancel anytime',
    features: ['Everything in Free', 'Priority “Featured” position in your city', '“Featured” badge on your listing'],
    excluded: ['Google Map Pack + AI search', 'Google Ads', 'Conversion website'],
    cta: { label: `Get Featured — ${FEATURED_PRICE_DISPLAY}`, href: '/directory/claim?intent=featured' },
    highlight: true,
  },
  {
    name: 'Managed Growth',
    price: 'Custom',
    priceNote: 'starts with a free audit',
    features: [
      'Everything in Featured',
      'Local SEO — Google Map Pack + AI search',
      'Google Ads management',
      'Conversion website',
      'Call tracking & reporting',
    ],
    excluded: [],
    cta: { label: 'Start with a free audit', href: AGMP_AUDIT_URL, external: true },
    highlight: false,
  },
]

export const metadata: Metadata = {
  title: 'SEO & Google Ads for Auto Glass Shops',
  description:
    'Done-for-you SEO and Google Ads management built specifically for auto glass and windshield shops. Get more calls from drivers searching near you.',
}

const SERVICES = [
  {
    icon: Search,
    title: 'Local SEO',
    desc: 'Rank in the Google Map Pack and organic results for “windshield repair near me” and every service + city combination that matters in your market.',
  },
  {
    icon: TrendingUp,
    title: 'Google Ads management',
    desc: 'Search campaigns tuned for auto glass intent — the right keywords, negative lists, and call-focused ad copy — so you pay for real leads, not clicks.',
  },
  {
    icon: Phone,
    title: 'Call tracking & lead capture',
    desc: 'Know exactly which calls and forms come from your marketing, and never let a lead slip through the cracks.',
  },
  {
    icon: BarChart3,
    title: 'Transparent reporting',
    desc: 'A simple dashboard showing calls, leads, and cost per lead — no vanity metrics, just what drives revenue.',
  },
]

const STEPS = [
  'Claim your free directory listing',
  'We audit your current visibility and competitors',
  'We build and launch your SEO + ads plan',
  'You start getting more tracked calls',
]

export default function ForShopsPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-gray-900 to-gray-800 px-4 py-20 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-blue-600/20 px-3 py-1 text-sm font-medium text-blue-300">
            {FOR_SHOPS.eyebrow}
          </span>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">{FOR_SHOPS.title}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-300">
            {FOR_SHOPS.subtitle}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/directory/claim"
              className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Get a free assessment
            </Link>
            <Link
              href="/directory"
              className="rounded-lg border border-gray-600 px-6 py-3 font-semibold text-white hover:bg-gray-700"
            >
              Back to directory
            </Link>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-xs text-gray-400">
            Windshield Repair HQ&apos;s growth services are powered by{' '}
            <a href={AGMP_AUDIT_URL} className="underline hover:text-gray-200">
              Auto Glass Marketing Pros
            </a>{' '}
            — the marketing agency built only for auto glass shops.
          </p>
        </div>
      </section>

      {/* Pricing tiers */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-gray-900">Pick your level</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-gray-600">
          Start free, jump the line for {FEATURED_PRICE_DISPLAY}, or hand growth to us entirely.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                'flex flex-col rounded-2xl border p-6 shadow-sm ' +
                (t.highlight ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200')
              }
            >
              {t.highlight && (
                <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  <Star width={12} height={12} /> Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
              <p className="mt-2">
                <span className="text-3xl font-extrabold text-gray-900">{t.price}</span>{' '}
                <span className="text-sm text-gray-500">{t.priceNote}</span>
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-gray-800">
                    <Check className="mt-0.5 shrink-0 text-green-500" width={16} height={16} /> {f}
                  </li>
                ))}
                {t.excluded.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-gray-400">
                    <span className="mt-0.5 w-4 shrink-0 text-center">—</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href={t.cta.href}
                {...('external' in t.cta && t.cta.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
                className={
                  'mt-6 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ' +
                  (t.highlight
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-gray-300 text-gray-800 hover:bg-gray-50')
                }
              >
                {t.cta.label}
              </a>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">
          Paid &ldquo;Featured&rdquo; placements are always labeled Featured in the directory. Paid
          placement never changes the neutral ranking drivers see beyond the labeled slots.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-gray-900">
          What we do for your shop
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <div key={s.title} className="flex gap-4 rounded-xl border border-gray-200 p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <s.icon width={22} height={22} />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-2xl font-bold text-gray-900">How it works</h2>
          <ol className="mt-10 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
                  {i + 1}
                </span>
                <span className="font-medium text-gray-800">{step}</span>
                {i === 0 && (
                  <Check className="ml-auto text-green-500" width={20} height={20} />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-5xl px-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'No long-term contracts',
            'You own your accounts & data',
            'Built only for auto glass',
            'Transparent, call-based reporting',
          ].map((t) => (
            <div
              key={t}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm font-medium text-gray-800"
            >
              <Check className="shrink-0 text-green-500" width={18} height={18} /> {t}
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold text-gray-900">Common questions</h2>
        <div className="mt-8 space-y-3">
          {[
            {
              q: 'Is the directory listing really free?',
              a: 'Yes. Your listing is free forever. Managed SEO and Google Ads is a separate, optional paid service you can add whenever you want more booked jobs.',
            },
            {
              q: 'Do I have to sign a long-term contract?',
              a: 'No. We earn your business month to month — there’s nothing to get started but a conversation.',
            },
            {
              q: 'Who owns the Google Ads and Google Business Profile accounts?',
              a: 'You do. We work inside your own accounts, so you keep everything — history, data, and assets — even if we ever part ways.',
            },
            {
              q: 'How much does it cost?',
              a: 'It depends on your market and goals, so we quote transparently after a free assessment. You’ll see exactly what you’re paying for before committing.',
            },
            {
              q: 'How fast will I see results?',
              a: 'Search and Maps ads can start driving calls within days of launch. SEO compounds over weeks and months — we focus both on tracked calls and quote requests, not vanity metrics.',
            },
          ].map((f) => (
            <details key={f.q} className="group rounded-xl border border-gray-200 bg-white p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-gray-900">
                {f.q}
                <span className="shrink-0 text-lg text-gray-400 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <MapPin className="mx-auto text-blue-600" width={32} height={32} />
        <h2 className="mt-4 text-2xl font-bold text-gray-900">
          Start with a free listing
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-gray-600">
          The directory listing is free and always will be. When you&apos;re ready to
          grow, we&apos;re here. No contracts to get started — just a conversation.
        </p>
        <Link
          href="/directory/claim"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Claim your free listing
        </Link>
      </section>
    </>
  )
}
