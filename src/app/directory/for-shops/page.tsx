import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, TrendingUp, Phone, BarChart3, MapPin, Check } from 'lucide-react'
import { FOR_SHOPS } from '@/lib/directory/content'

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
        </div>
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
