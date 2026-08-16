import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { BlogIndex } from '@/components/sites/blog'
import { plainExcerpt } from '@/lib/sanitize-html'

export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string }>
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
      clarityProjectId: true,
    },
  })
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client || client.status !== 'ACTIVE') return { title: 'Not Found' }
  return {
    title: `Auto Glass Advice | ${client.businessName}`,
    description: `Chips, cracks, calibration and insurance, explained by ${client.businessName} in ${client.city}.`,
    alternates: {
      canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app/blog`,
    },
  }
}

export default async function BlogIndexPage({ params }: PageProps) {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />

  const articles = await prisma.seoArticle
    .findMany({
      // The shop's SEO switch is enforced here, not only at sync: turning
      // it off has to take live pages down, which is what the admin card
      // says it does.
      where: {
        clientId: client.id,
        publishedAt: { not: null },
        client: { seoContentEnabled: true },
      },
      orderBy: { publishedAt: 'desc' },
      select: {
        slug: true,
        title: true,
        excerpt: true,
        metaDescription: true,
        contentHtml: true,
        heroImageUrl: true,
        publishedAt: true,
      },
    })
    .catch(() => [])

  // A shop with no articles has no blog. An empty index page is a thin page
  // Google will happily index and hold against the rest of the site.
  if (articles.length === 0) notFound()

  client.phone = (await withSitePhone(client)).phone

  return (
    <BlogIndex
      client={client}
      basePath={`/sites/${client.slug}`}
      articles={articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        heroImageUrl: a.heroImageUrl,
        publishedAt: a.publishedAt,
        excerpt: a.excerpt || a.metaDescription || plainExcerpt(a.contentHtml),
      }))}
    />
  )
}
