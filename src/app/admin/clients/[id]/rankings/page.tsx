export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import RankReport from '@/components/rank/RankReport'
import { rankScansFor } from '@/lib/rank-report'

/**
 * "Rankings" tab: the same report the client sees, and nothing else.
 *
 * There is no share box here any more. Local Dominator's map is served from
 * our own white-label domain and is public by its token, so that URL IS the
 * shareable report — a second sharing mechanism of ours would be one more
 * link to explain, pointing at the same thing.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, rankTrackingId: true, rankMapUrl: true },
  })
  if (!client) notFound()

  return (
    <RankReport
      scans={await rankScansFor(id)}
      mapUrl={client.rankMapUrl}
      campaignId={client.rankTrackingId}
      showProviderLink
    />
  )
}
