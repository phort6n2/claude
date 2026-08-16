export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import RankReport from '@/components/rank/RankReport'
import { rankScansFor } from '@/lib/rank-report'

/**
 * "Rankings" tab: the same report the client sees, and nothing else.
 *
 * Literally nothing else. There is no share box — Local Dominator's map is
 * served from our own white-label domain and is public by its token, so that
 * URL IS the shareable report, and a second sharing mechanism of ours would
 * be one more link to explain pointing at the same thing. And there is no
 * Map URL field: pasting a campaign's share link by hand was a per-client
 * chore that bought one combined map instead of per-keyword tabs, which is a
 * cosmetic difference, and it cost a permanent card of explanation on a page
 * whose whole job is to show a map.
 *
 * `Client.rankMapUrl` still exists and is still honoured when it is set. It
 * is filled by the daily sweep and by "Refresh map URLs" on the rankings
 * overview, which is the route that needs no typing.
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
    <div className="space-y-4">
      <RankReport
        scans={await rankScansFor(id)}
        mapUrl={client.rankMapUrl}
        campaignId={client.rankTrackingId}
        showProviderLink
      />
    </div>
  )
}
