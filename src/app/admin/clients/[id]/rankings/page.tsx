export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import RankReport from '@/components/rank/RankReport'
import { rankScansFor } from '@/lib/rank-report'
import RankMapUrlCard from '@/components/admin/RankMapUrlCard'

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
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">All-keywords map</h2>
          <p className="text-sm text-gray-500">
            One address, every keyword, the whole history — captured automatically when their API
            offers it, pasted here when it does not
          </p>
        </div>
        <RankMapUrlCard clientId={client.id} mapUrl={client.rankMapUrl} />
      </section>

      <RankReport
        scans={await rankScansFor(id)}
        mapUrl={client.rankMapUrl}
        campaignId={client.rankTrackingId}
        showProviderLink
      />
    </div>
  )
}
