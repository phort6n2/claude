import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar } from 'lucide-react'
import {
  listArticles,
  getArticleBySlug,
  articleDate,
} from '@/lib/directory/blog'
import { SafeShopImage } from '@/components/directory/SafeShopImage'

// ISR: refresh article content hourly.
export const revalidate = 3600

export async function generateStaticParams() {
  const articles = await listArticles()
  return articles.map((a) => ({ slug: a.slug }))
}

function fmtDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) return { title: 'Article not found' }
  const description = article.meta_description || article.excerpt
  return {
    title: `${article.title} | Windshield Repair HQ`,
    description,
    alternates: { canonical: `/directory/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description,
      type: 'article',
      images: article.hero_image_url ? [{ url: article.hero_image_url }] : undefined,
    },
  }
}

// Schema markup the article ships with (Article + optional FAQ), rendered as
// JSON-LD. Content comes from BabyLoveGrowth, the site's own SEO vendor.
function SchemaScript({ data }: { data: unknown }) {
  if (!data) return null
  const json = typeof data === 'string' ? data : JSON.stringify(data)
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  )
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)
  if (!article) notFound()

  const date = fmtDate(articleDate(article))

  return (
    <>
      <SchemaScript data={article.jsonLd} />
      <SchemaScript data={article.faqJsonLd} />

      <article className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/directory/blog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-blue-600"
        >
          <ArrowLeft width={15} height={15} /> All articles
        </Link>

        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
          {article.title}
        </h1>
        {date && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-gray-500">
            <Calendar width={14} height={14} /> {date}
          </p>
        )}

        {article.hero_image_url && (
          <div className="mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
            <SafeShopImage src={article.hero_image_url} alt={article.title} slug={article.slug} />
          </div>
        )}

        {article.content_html ? (
          <div
            className="prose prose-lg mt-8 max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-strong:text-gray-900"
            dangerouslySetInnerHTML={{ __html: article.content_html }}
          />
        ) : (
          <p className="mt-8 text-gray-600">This article has no content yet.</p>
        )}

        {/* Contextual CTA back into the directory */}
        <div className="mt-12 rounded-2xl bg-blue-50 p-6 text-center">
          <p className="text-lg font-semibold text-gray-900">
            Need auto glass work done?
          </p>
          <p className="mt-1 text-gray-600">
            Find a trusted windshield repair &amp; replacement shop near you.
          </p>
          <Link
            href="/directory/search"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            Find a shop near me
          </Link>
        </div>
      </article>
    </>
  )
}
