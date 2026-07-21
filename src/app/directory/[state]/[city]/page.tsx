import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Truck, ShieldCheck } from 'lucide-react'
import {
  getCitySummaries,
  getCitySummary,
  getShopsByCity,
} from '@/lib/directory/data'
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  faqPageJsonLd,
  jsonLdScript,
} from '@/lib/directory/seo'
import { cityFaqs } from '@/lib/directory/faqs'
import { cityIntro, cityAdvice } from '@/lib/directory/content'
import { CityShopExplorer } from '@/components/directory/CityShopExplorer'
import { CTASection } from '@/components/directory/CTASection'
import { enrichShops } from '@/lib/directory/photos'
import { withReviews } from '@/lib/directory/reviews'

// Rebuild periodically so newly uploaded owner photos appear.
export const revalidate = 300

export function generateStaticParams() {
  return getCitySummaries().map((c) => ({ state: c.state, city: c.citySlug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>
}): Promise<Metadata> {
  const { state, city } = await params
  const summary = getCitySummary(state, city)
  if (!summary) return { title: 'City not found' }
  const title = `Auto Glass Repair in ${summary.city}, ${summary.state.toUpperCase()}`
  return {
    title,
    description: `Compare ${summary.count} auto glass and windshield shops in ${summary.city}, ${summary.stateFull}. Windshield replacement, chip repair, ADAS calibration, and mobile service near you.`,
    alternates: { canonical: `/directory/${summary.state}/${summary.citySlug}` },
  }
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>
}) {
  const { state, city } = await params
  const summary = getCitySummary(state, city)
  if (!summary) notFound()

  const shops = getShopsByCity(summary.state, summary.city)
  const shopsWithPhotos = await withReviews(await enrichShops(shops))
  const mobileCount = shops.filter((s) => s.mobileService).length
  const faqs = cityFaqs(summary.city, summary.state)
  const advice = cityAdvice(summary.city)

  const breadcrumb = breadcrumbJsonLd([
    { name: 'Directory', path: '/directory' },
    { name: summary.stateFull, path: `/directory/${summary.state}` },
    { name: summary.city, path: `/directory/${summary.state}/${summary.citySlug}` },
  ])
  const itemList = itemListJsonLd(shops)
  const faqSchema = faqPageJsonLd(faqs)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema) }}
      />
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/directory" className="hover:text-blue-600">
          Directory
        </Link>
        <span>/</span>
        <Link href={`/directory/${summary.state}`} className="hover:text-blue-600">
          {summary.stateFull}
        </Link>
        <span>/</span>
        <span className="text-gray-700">{summary.city}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">
        Auto glass &amp; windshield repair in {summary.city}, {summary.state.toUpperCase()}
      </h1>
      <p className="mt-2 max-w-3xl text-gray-600">
        {cityIntro(summary.city, summary.stateFull, summary.count, mobileCount)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
          <Truck width={14} height={14} /> {mobileCount} mobile
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">
          <ShieldCheck width={14} height={14} /> Insurance-approved
        </span>
      </div>

      <div className="mt-8">
        <CityShopExplorer shops={shopsWithPhotos} />
      </div>

      {/* Local SEO copy block */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-bold text-gray-900">{advice.title}</h2>
        <div className="mt-3 space-y-4 text-gray-600">
          {advice.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* FAQ — visible content backing the FAQPage schema */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-bold text-gray-900">
          Auto glass FAQs for {summary.city}
        </h2>
        <dl className="mt-5 space-y-5">
          {faqs.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold text-gray-900">{f.q}</dt>
              <dd className="mt-1 text-gray-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <CTASection
        className="mt-14 rounded-2xl"
        title={`Run an auto glass shop in ${summary.city}?`}
        description="List your business here for free and get found by local drivers searching for windshield repair."
        primary={{ label: 'Add your shop — free', href: '/directory/claim' }}
        secondary={{ label: 'See SEO & ads services', href: '/directory/for-shops' }}
      />
    </div>
  )
}
