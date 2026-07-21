import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, ArrowRight } from 'lucide-react'
import { listArticles, articleDate, type ArticleSummary } from '@/lib/directory/blog'
import { SafeShopImage } from '@/components/directory/SafeShopImage'

// Refresh hourly so new BabyLoveGrowth posts appear without a redeploy.
export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Auto Glass Blog — Tips, Costs & Guides | Windshield Repair HQ',
  description:
    'Expert guides on windshield repair and replacement, ADAS calibration, insurance, and keeping your auto glass in top shape.',
  alternates: { canonical: '/directory/blog' },
}

function fmtDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function BlogIndexPage() {
  const articles = await listArticles()

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-600">
          <Newspaper width={16} height={16} /> The Windshield Repair HQ Blog
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Auto glass tips, costs &amp; guides
        </h1>
        <p className="mt-3 text-lg text-gray-600">
          Straight answers on windshield repair, replacement, calibration, and insurance — so
          you can make the right call for your vehicle.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center">
          <Newspaper width={32} height={32} className="mx-auto text-gray-400" />
          <p className="mt-3 font-medium text-gray-700">New articles are on the way.</p>
          <p className="mt-1 text-sm text-gray-500">
            Check back soon for fresh auto glass guides and advice.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} date={fmtDate(articleDate(a))} />
          ))}
        </div>
      )}
    </div>
  )
}

function ArticleCard({ article, date }: { article: ArticleSummary; date: string | null }) {
  return (
    <Link
      href={`/directory/blog/${article.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="aspect-[16/9] w-full overflow-hidden bg-gray-100">
        {article.hero_image_url ? (
          <SafeShopImage
            src={article.hero_image_url}
            alt={article.title}
            slug={article.slug}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <Newspaper width={28} height={28} className="text-blue-300" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {date && <span className="text-xs font-medium text-gray-400">{date}</span>}
        <h2 className="mt-1 text-lg font-bold leading-snug text-gray-900 group-hover:text-blue-700">
          {article.title}
        </h2>
        {(article.excerpt || article.meta_description) && (
          <p className="mt-2 line-clamp-3 text-sm text-gray-600">
            {article.excerpt || article.meta_description}
          </p>
        )}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-blue-600">
          Read more <ArrowRight width={15} height={15} className="transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
