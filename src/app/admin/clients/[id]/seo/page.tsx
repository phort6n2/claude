export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
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
      seoClient: true,
      contentFeedUrl: true,
      contentFeedCheckedAt: true,
      contentFeedError: true,
    },
  })
  if (!client) notFound()

  const feedItemCount = await prisma.siteFeedItem.count({ where: { clientId: id } }).catch(() => 0)

  return (
    <SeoTab
      clientId={client.id}
      initialSeoClient={client.seoClient}
      feed={{
        url: client.contentFeedUrl,
        checkedAt: client.contentFeedCheckedAt?.toISOString() || null,
        error: client.contentFeedError,
        itemCount: feedItemCount,
      }}
    />
  )
}
