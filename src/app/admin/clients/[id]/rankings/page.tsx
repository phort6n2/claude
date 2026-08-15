export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import RankReport from '@/components/rank/RankReport'
import { rankScansFor } from '@/lib/rank-report'
import ShareLinkBox from '@/components/admin/ShareLinkBox'
import { rankShareToken } from '@/lib/rank-share-token'

/**
 * "Rankings" tab: the same report the client sees, plus the share link.
 *
 * Identical rendering is the point — an admin view that flattered the
 * numbers would make the share link worthless, since a prospect is supposed
 * to be seeing exactly what a client sees.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      googlePlaceId: true,
      latitude: true,
      longitude: true,
      seoClient: true,
      rankTrackingId: true,
      rankKeywords: true,
    },
  })
  if (!client) notFound()

  const scans = await rankScansFor(id)

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 className="font-semibold text-gray-900">Rank tracking</h2>
        <p className="mt-1 text-sm text-gray-600">
          {client.rankTrackingId ? (
            <>
              Scanned {client.seoClient ? 'weekly' : 'monthly'} on{' '}
              {client.rankKeywords.length || 0} keyword
              {client.rankKeywords.length === 1 ? '' : 's'}
              {client.rankKeywords.length ? `: ${client.rankKeywords.join(', ')}` : ''}.
            </>
          ) : !client.googlePlaceId ? (
            'No Google Place ID on this client, so no scan can be set up. Pick the business on the Business tab.'
          ) : (
            'No campaign yet — the daily sweep will create one, or press "Create campaigns now" in Settings → API keys.'
          )}
        </p>
        <div className="mt-4">
          <ShareLinkBox
            token={rankShareToken(client.id)}
            businessName={client.businessName}
            disabled={scans.length === 0}
          />
        </div>
      </section>

      <RankReport
        scans={scans}
        placeId={client.googlePlaceId || ''}
        hasCoordinates={!!(client.latitude && client.longitude)}
        mapQuery={`client=${client.id}`}
        showProviderLink
      />
    </div>
  )
}
