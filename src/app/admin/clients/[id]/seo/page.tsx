export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import { decrypt } from '@/lib/encryption'
import SeoTab from '@/components/admin/SeoTab'

/**
 * "SEO" tab: what this shop is paying for, and what that changes.
 *
 * The plan switch is the top of it, and it is also the gate: ticking it on is
 * the moment their content feed is wanted, so that card appears underneath it
 * rather than on every client.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      seoClient: true,
      seoContentEnabled: true,
      blgApiKey: true,
      contentFeedUrl: true,
      contentFeedCheckedAt: true,
      contentFeedError: true,
      domains: { where: { isPrimary: true }, select: { domain: true }, take: 1 },
    },
  })
  if (!client) notFound()

  const articles = await prisma.seoArticle
    .findMany({
      where: { clientId: id },
      orderBy: [{ publishedAt: 'desc' }, { authoredAt: 'desc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        seedKeyword: true,
        reviewFlags: true,
        publishedAt: true,
        authoredAt: true,
      },
    })
    .catch(() => [])

  const feedItemCount = await prisma.siteFeedItem.count({ where: { clientId: id } }).catch(() => 0)

  const plain = client.blgApiKey ? decrypt(client.blgApiKey) : null
  const masked = plain
    ? plain.length <= 8
      ? '••••'
      : `${plain.slice(0, 4)}••••${plain.slice(-4)}`
    : null
  const host = client.domains[0]?.domain || `${client.siteSubdomain || client.slug}.glassleads.app`

  return (
    <SeoTab
      clientId={client.id}
      initialSeoClient={client.seoClient}
      initialContentEnabled={client.seoContentEnabled}
      initialMaskedKey={masked}
      articles={articles.map((a) => ({
        ...a,
        publishedAt: a.publishedAt?.toISOString() || null,
        authoredAt: a.authoredAt?.toISOString() || null,
      }))}
      host={host}
      feed={{
        url: client.contentFeedUrl,
        checkedAt: client.contentFeedCheckedAt?.toISOString() || null,
        error: client.contentFeedError,
        itemCount: feedItemCount,
      }}
    />
  )
}
