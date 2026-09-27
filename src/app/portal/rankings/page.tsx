export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import RankReport from '@/components/rank/RankReport'
import { rankScansFor } from '@/lib/rank-report'
import SeoPitch from '@/components/portal/SeoPitch'

/**
 * "Local Rankings" in the client portal.
 *
 * What a shop owner wants to know is "is this working", so it leads with the
 * most recent map and the direction of travel rather than a table. Nothing
 * here is projected or scored — every number is measured.
 */
export default async function PortalRankingsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: {
      businessName: true,
      city: true,
      googlePlaceId: true,
      rankTrackingId: true,
      rankMapUrl: true,
      rankKeywords: true,
      seoClient: true,
    },
  })
  const scans = await rankScansFor(session.clientId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Local rankings</h1>
        <p className="text-gray-600">
          Where {client?.businessName || 'your shop'} shows up in Google&apos;s map results when
          someone searches from around {client?.city || 'your area'}.
        </p>
      </div>
      <RankReport
        scans={scans}
        mapUrl={client?.rankMapUrl || null}
        campaignId={client?.rankTrackingId || null}
        trackedTerms={client?.rankKeywords || []}
      />
      {/* Below the map, never above it: the map is what they came to read, and
          a shop without SEO is still measured (two searches, monthly). This is
          the page where SEO's effect on the MAP is visible, so it is where the
          case for it belongs — the Traffic page only ever made it for the
          website. */}
      {client && !client.seoClient && (
        <SeoPitch where="rankings" businessName={client.businessName} />
      )}
    </div>
  )
}
