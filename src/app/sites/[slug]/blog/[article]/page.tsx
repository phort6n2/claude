import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { BlogArticle } from '@/components/sites/blog'
import { plainExcerpt } from '@/lib/sanitize-html'
import { scrubJsonLd } from '@/lib/article-whitelabel'

export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string; article: string }>
}

async function getClient(slug: string) {
  return prisma.client.findFirst({
    where: { OR: [{ slug }, { siteSubdomain: slug }] },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      status: true,
      businessName: true,
      phone: true,
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      googleMapsUrl: true,
    },
  })
}

/**
 * Only published articles resolve. An article held in the review queue is
 * unreachable by URL, not merely unlinked — a held claim must not be one
 * guessed address away from being live.
 */
async function getArticle(clientId: string, slug: string) {
  return prisma.seoArticle
    .findFirst({
      // The shop's SEO switch is enforced here, not only at sync: turning
      // it off has to take live pages down, which is what the admin card
      // says it does.
      where: {
        clientId,
        slug,
        publishedAt: { not: null },
        client: { seoContentEnabled: true },
      },
      select: {
        title: true,
        metaDescription: true,
        excerpt: true,
        contentHtml: true,
        contentMarkdown: true,
        heroImageUrl: true,
        publishedAt: true,
        jsonLd: true,
        faqJsonLd: true,
      },
    })
    .catch(() => null)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, article: articleSlug } = await params
  const client = await getClient(slug)
  if (!client || client.status !== 'ACTIVE') return { title: 'Not Found' }
  const article = await getArticle(client.id, articleSlug)
  if (!article) return { title: 'Not Found' }

  const host = `${client.siteSubdomain || client.slug}.glassleads.app`
  return {
    title: `${article.title} | ${client.businessName}`,
    description:
      article.metaDescription || article.excerpt || plainExcerpt(article.contentHtml, 155),
    alternates: { canonical: `https://${host}/blog/${articleSlug}` },
    openGraph: {
      title: article.title,
      type: 'article',
      images: article.heroImageUrl ? [article.heroImageUrl] : undefined,
    },
  }
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug, article: articleSlug } = await params
  const client = await getClient(slug)
  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />

  const article = await getArticle(client.id, articleSlug)
  if (!article) notFound()

  client.phone = (await withSitePhone(client)).phone

  // Their schema markup, passed through as data. It describes the article,
  // not the business — the LocalBusiness block stays where it is built, on
  // the site pages, so nothing here can contradict the NAP.
  //
  // Scrubbed first: author/publisher come back naming the writer, which is
  // machine-readable, indexed, and invisible in the rendered page. The shop
  // is credited instead — they publish it, under their name, on their
  // domain.
  const host = `${client.siteSubdomain || client.slug}.glassleads.app`
  const blocks = [article.jsonLd, article.faqJsonLd]
    .filter((b): b is object => !!b && typeof b === 'object')
    .map((b) => scrubJsonLd(b, { businessName: client.businessName, host }))

  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, '\\u003c') }}
        />
      ))}
      <BlogArticle client={client} basePath={`/sites/${client.slug}`} article={article} />
    </>
  )
}
